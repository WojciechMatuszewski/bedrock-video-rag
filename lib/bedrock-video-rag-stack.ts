import * as cdk from "aws-cdk-lib";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export class BedrockVideoRagStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mediaBucket = new MediaBucket(this);

    const mediaStateMachine = new MediaStateMachine(this);

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
            key: [{ suffix: ".mp4" }]
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
  constructor(scope: Construct) {
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
            "TranscriptionJobName.$": "$$.Execution.Name",
            LanguageCode: "en-US"
          }
        }
      );

    const passStep = new cdk.aws_stepfunctions.Pass(scope, "Pass");

    super(scope, "MediaStateMachine", {
      definitionBody:
        cdk.aws_stepfunctions.DefinitionBody.fromChainable(passStep)
    });
  }
}
