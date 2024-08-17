import * as cdk from "aws-cdk-lib";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export class BedrockVideoRagStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mediaBucket = new MediaBucket(this);

    const mediaStateMachine = new MediaStateMachine(this, mediaBucket);

    const mediaBusRule = new MediaBusRule(this, mediaBucket, mediaStateMachine);
  }
}

class MediaBucket extends cdk.aws_s3.Bucket {
  constructor(scope: Construct) {
    super(scope, "MediaBucket", {
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
}

class TranscriptionBucket extends cdk.aws_s3.Bucket {}

class MediaBusRule extends cdk.aws_events.Rule {
  constructor(scope: Construct, bucket: IBucket, stateMachine: IStateMachine) {
    super(scope, "MediaBusRule", {
      enabled: true,
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: {
            name: [bucket.bucketName]
          },
          object: {
            key: [{ suffix: ".mp4" }, { suffix: ".m4a" }]
          }
        }
      }
    });

    this.addTarget(
      new cdk.aws_events_targets.SfnStateMachine(stateMachine, {
        input: cdk.aws_events.RuleTargetInput.fromObject({
          bucketName: cdk.aws_events.EventField.fromPath(
            "$.detail.bucket.name"
          ),
          objectKey: cdk.aws_events.EventField.fromPath("$.detail.object.key")
        })
      })
    );
  }
}

class MediaStateMachine extends cdk.aws_stepfunctions.StateMachine {
  constructor(scope: Construct, mediaBucket: IBucket) {
    const readMediaBucketPolicy = new cdk.aws_iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [mediaBucket.arnForObjects("*")]
    });

    const startTranscriptionTask =
      new cdk.aws_stepfunctions_tasks.CallAwsService(
        scope,
        "StartTranscriptionTask",
        {
          service: "transcribe",
          action: "startTranscriptionJob",
          iamResources: ["*"],
          parameters: {
            Media: {
              MediaFileUri: cdk.aws_stepfunctions.JsonPath.format(
                "s3://{}/{}",
                cdk.aws_stepfunctions.JsonPath.stringAt("$.bucketName"),
                cdk.aws_stepfunctions.JsonPath.stringAt("$.objectKey")
              )
            },
            TranscriptionJobName:
              cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name"),
            LanguageCode: "en-US"
          },
          additionalIamStatements: [readMediaBucketPolicy],
          resultSelector: {
            jobName: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.TranscriptionJob.TranscriptionJobName"
            ),
            status: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.TranscriptionJob.TranscriptionJobStatus"
            )
          }
        }
      );

    const checkTranscriptionStatusTask =
      new cdk.aws_stepfunctions_tasks.CallAwsService(
        scope,
        "CheckTranscriptionStatusTask",
        {
          service: "transcribe",
          action: "getTranscriptionJob",
          iamResources: ["*"],
          parameters: {
            TranscriptionJobName:
              cdk.aws_stepfunctions.JsonPath.stringAt("$.jobName")
          },
          resultSelector: {
            status: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.TranscriptionJob.TranscriptionJobStatus"
            ),
            jobName: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.TranscriptionJob.TranscriptionJobName"
            ),
            transcriptUri: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.TranscriptionJob.Transcript.TranscriptFileUri"
            )
          }
        }
      );

    const decideOnTranscriptionStatus = new cdk.aws_stepfunctions.Choice(
      scope,
      "DecideOnTranscriptionStatus"
    );

    decideOnTranscriptionStatus.when(
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "COMPLETED"),
      new cdk.aws_stepfunctions.Pass(scope, "TranscriptionCompleted")
    );

    decideOnTranscriptionStatus.when(
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "FAILED"),
      new cdk.aws_stepfunctions.Pass(scope, "TranscriptionFailed")
    );

    const waitFor10SecondsTask = new cdk.aws_stepfunctions.Wait(
      scope,
      "WaitFor10Seconds",
      {
        time: cdk.aws_stepfunctions.WaitTime.duration(cdk.Duration.seconds(10))
      }
    );

    const transcriptionStatusWaiter = waitFor10SecondsTask
      .next(checkTranscriptionStatusTask)
      .next(decideOnTranscriptionStatus);

    decideOnTranscriptionStatus.otherwise(transcriptionStatusWaiter);

    // const initialWaitFor10Seconds = new cdk.aws_stepfunctions.Wait(
    //   scope,
    //   "InitialWaitFor10Seconds",
    //   {
    //     time: cdk.aws_stepfunctions.WaitTime.duration(cdk.Duration.seconds(10))
    //   }
    // );

    // waitForTranscriptionTask.otherwise(waitFor10SecondsTask);

    const body = cdk.aws_stepfunctions.DefinitionBody.fromChainable(
      startTranscriptionTask.next(transcriptionStatusWaiter)
    );

    super(scope, "MediaStateMachine", {
      definitionBody: body
    });
  }
}
