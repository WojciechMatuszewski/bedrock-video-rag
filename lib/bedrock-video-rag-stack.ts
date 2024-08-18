import * as cdk from "aws-cdk-lib";
import * as glue from "@aws-cdk/aws-glue-alpha";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export class BedrockVideoRagStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mediaBucket = new MediaBucket(this);

    const transcriptionsBucket = new TranscriptionsBucket(this);

    const transcriptionsGlueDatabase = new TranscriptionsGlueDatabase(this);

    const transcriptionsGlueTable = new TranscriptionsGlueTable(this, {
      glueDatabase: transcriptionsGlueDatabase,
      transcriptionsBucket
    });

    const mediaStateMachine = new MediaStateMachine(this, {
      mediaBucket,
      transcriptionsBucket,
      transcriptionsGlueDatabase
    });

    const mediaBusRule = new MediaBusRule(this, {
      mediaBucket,
      mediaStateMachine
    });
  }
}

/**
 * https://github.com/WojciechMatuszewski/serverless-video-transcribe-fun/blob/main/lib/serverless-transcribe-stack.ts#L303
 */

class TranscriptionsGlueDatabase extends glue.Database {
  constructor(scope: Construct) {
    super(scope, "TranscriptionsDatabase", {
      databaseName: "transcriptions"
    });
  }
}

class TranscriptionsGlueTable extends glue.S3Table {
  constructor(
    scope: Construct,
    {
      glueDatabase,
      transcriptionsBucket
    }: { glueDatabase: glue.Database; transcriptionsBucket: IBucket }
  ) {
    super(scope, "TranscriptionsTable", {
      tableName: "transcriptions",
      database: glueDatabase,
      columns: [
        {
          name: "jobName",
          type: glue.Schema.STRING
        },
        {
          name: "results",
          type: glue.Schema.struct([
            {
              name: "transcripts",
              type: glue.Schema.array(
                glue.Schema.struct([
                  {
                    name: "transcript",
                    type: glue.Schema.STRING
                  }
                ])
              )
            }
          ])
        }
      ],
      dataFormat: glue.DataFormat.JSON,
      bucket: transcriptionsBucket,
      s3Prefix: "transcriptions/"
    });
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

class TranscriptionsBucket extends cdk.aws_s3.Bucket {
  constructor(scope: Construct) {
    super(scope, "TranscriptionsBucket", {
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
  }
}

class MediaBusRule extends cdk.aws_events.Rule {
  constructor(
    scope: Construct,
    {
      mediaBucket,
      mediaStateMachine
    }: { mediaBucket: IBucket; mediaStateMachine: IStateMachine }
  ) {
    super(scope, "MediaBusRule", {
      enabled: true,
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: {
            name: [mediaBucket.bucketName]
          },
          object: {
            key: [{ suffix: ".mp4" }, { suffix: ".m4a" }]
          }
        }
      }
    });

    this.addTarget(
      new cdk.aws_events_targets.SfnStateMachine(mediaStateMachine, {
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
  constructor(
    scope: Construct,
    {
      mediaBucket,
      transcriptionsBucket,
      transcriptionsGlueDatabase
    }: {
      mediaBucket: IBucket;
      transcriptionsBucket: IBucket;
      transcriptionsGlueDatabase: glue.Database;
    }
  ) {
    const readMediaBucketPolicy = new cdk.aws_iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [mediaBucket.arnForObjects("*")]
    });

    const putTranscriptionsBucketPolicy = new cdk.aws_iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [transcriptionsBucket.arnForObjects("*")]
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
            LanguageCode: "en-US",
            OutputBucketName: transcriptionsBucket.bucketName,
            OutputKey: cdk.aws_stepfunctions.JsonPath.format(
              "{}/{}.json",
              "transcriptions",
              cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name")
            )
          },
          additionalIamStatements: [
            readMediaBucketPolicy,
            putTranscriptionsBucketPolicy
          ],
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

    const executeAthenaQueryTask =
      new cdk.aws_stepfunctions_tasks.AthenaStartQueryExecution(
        scope,
        "ExecuteAthenaQueryTask",
        {
          integrationPattern: cdk.aws_stepfunctions.IntegrationPattern.RUN_JOB,
          queryString: cdk.aws_stepfunctions.JsonPath.format(
            `
UNLOAD(
  select
      array_join(array_agg(transcriptItem.transcript), '') as fullTranscription
  from
      transcriptions
  CROSS JOIN UNNEST(results.transcripts) as t(transcriptItem)
  WHERE jobName = '{}'
)
TO '${transcriptionsBucket.s3UrlForObject("data/{}")}'
with (format = 'TEXTFILE', compression = 'NONE')
`,
            cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name"),
            cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name")
          ),
          queryExecutionContext: {
            databaseName: "transcriptions"
          },
          resultConfiguration: {
            outputLocation: {
              bucketName: transcriptionsBucket.bucketName,
              objectKey: "athena"
            }
          }
        }
      );

    const decideOnTranscriptionStatus = new cdk.aws_stepfunctions.Choice(
      scope,
      "DecideOnTranscriptionStatus"
    );

    decideOnTranscriptionStatus.when(
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "COMPLETED"),
      executeAthenaQueryTask
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

    const body = cdk.aws_stepfunctions.DefinitionBody.fromChainable(
      startTranscriptionTask.next(transcriptionStatusWaiter)
    );

    super(scope, "MediaStateMachine", {
      definitionBody: body
    });

    // this.addToRolePolicy(
    //   new cdk.aws_iam.PolicyStatement({
    //     actions: ["glue:GetTable", "glue:GetPartitions"],
    //     resources: [transcriptionsGlueDatabase.databaseArn]
    //   })
    // );
  }
}
