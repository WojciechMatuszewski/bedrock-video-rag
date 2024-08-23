import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import * as glue from "@aws-cdk/aws-glue-alpha";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import * as genai from "@cdklabs/generative-ai-cdk-constructs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { dirname, join } from "desm";

export class BedrockVideoRagStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mediaBucket = new MediaBucket(this);

    const transcriptionsBucket = new TranscriptionsBucket(this);

    const transcriptionsTable = new TranscriptionsTable(this);

    const parseTranscriptionFunction = new ParseTranscriptionFunction(this);

    const transcriptionsGlueDatabase = new TranscriptionsGlueDatabase(this);

    new TranscriptionsGlueTable(this, {
      glueDatabase: transcriptionsGlueDatabase,
      transcriptionsBucket
    });

    const bedrockKnowledgeBase = new BedrockKnowledgeBase(this);

    const bedrockDataSource = new BedrockDataSource(this, {
      knowledgeBase: bedrockKnowledgeBase,
      transcriptionsBucket
    });

    const mediaStateMachine = new MediaStateMachine(this, {
      mediaBucket,
      transcriptionsBucket,
      transcriptionsTable,
      parseTranscriptionFunction,
      bedrockDataSource,
      bedrockKnowledgeBase
    });

    const mediaBusRule = new MediaBusRule(this, {
      mediaBucket,
      mediaStateMachine
    });
  }
}

class ChatWithTranscriptAPI extends cdk.aws_apigatewayv2.HttpApi {
  constructor(scope: Construct) {
    super(scope, "ChatWithTranscriptAPI", {
      corsPreflight: {
        allowCredentials: true,
        allowHeaders: ["*"],
        allowMethods: [cdk.aws_apigatewayv2.CorsHttpMethod.ANY],
        allowOrigins: ["*"]
      }
    });

    const chatWithTranscriptHandler = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "ChatWithTranscriptHandler",
      {}
    );

    this.addRoutes({
      path: "transcript/{id}/chat",
      methods: [cdk.aws_apigatewayv2.HttpMethod.GET],
      integration: new cdk.aws_apigatewayv2_integrations.HttpLambdaIntegration(
        "ChatRouteHandler",
        {},
        {}
      )
    });
  }
}

class ParseTranscriptionFunction extends cdk.aws_lambda_nodejs.NodejsFunction {
  constructor(scope: Construct) {
    super(scope, "ParseTranscriptionFunction", {
      entry: join(
        import.meta.url,
        "../",
        "functions",
        "prepare-data-for-bedrock",
        "handler.ts"
      ),
      handler: "handler",
      environment: {},
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      retryAttempts: 0,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X
    });
  }
}

class TranscriptionsTable extends cdk.aws_dynamodb.Table {
  constructor(scope: Construct) {
    super(scope, "TranscriptionsTable", {
      partitionKey: {
        name: "pk",
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: cdk.aws_dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      deletionProtection: false
    });
  }
}

class BedrockKnowledgeBase extends genai.bedrock.KnowledgeBase {
  constructor(scope: Construct) {
    const pineconeVectorStore = new genai.pinecone.PineconeVectorStore({
      connectionString: process.env.PINECONE_CONNECTION_STRING as string,
      credentialsSecretArn: process.env.PINECONE_API_KEY_ARN as string,
      metadataField: "metadata",
      textField: "text"
    });

    super(scope, "BedrockKnowledgeBase", {
      embeddingsModel: genai.bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      vectorStore: pineconeVectorStore
    });
  }
}

class BedrockDataSource extends genai.bedrock.S3DataSource {
  constructor(
    scope: Construct,
    {
      transcriptionsBucket,
      knowledgeBase
    }: {
      transcriptionsBucket: IBucket;
      knowledgeBase: genai.bedrock.KnowledgeBase;
    }
  ) {
    super(scope, "BedrockDataStore", {
      bucket: transcriptionsBucket,
      dataSourceName: "transcriptions",
      knowledgeBase,
      inclusionPrefixes: ["data/"]
    });
  }
}

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
    super(scope, "TranscriptionsGlueTable", {
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
      parseTranscriptionFunction,
      transcriptionsTable,
      bedrockDataSource,
      bedrockKnowledgeBase
    }: {
      mediaBucket: IBucket;
      transcriptionsBucket: IBucket;
      transcriptionsTable: ITable;
      parseTranscriptionFunction: IFunction;
      bedrockDataSource: genai.bedrock.S3DataSource;
      bedrockKnowledgeBase: genai.bedrock.KnowledgeBase;
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

    const saveItemInDynamoDBTask =
      new cdk.aws_stepfunctions_tasks.DynamoPutItem(
        scope,
        "SaveItemInDynamoDBTask",
        {
          item: {
            pk: cdk.aws_stepfunctions_tasks.DynamoAttributeValue.fromString(
              "transcription"
            ),
            sk: cdk.aws_stepfunctions_tasks.DynamoAttributeValue.fromString(
              cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name")
            ),
            bucketName:
              cdk.aws_stepfunctions_tasks.DynamoAttributeValue.fromString(
                cdk.aws_stepfunctions.JsonPath.stringAt("$.bucketName")
              ),
            fileName:
              cdk.aws_stepfunctions_tasks.DynamoAttributeValue.fromString(
                cdk.aws_stepfunctions.JsonPath.stringAt("$.objectKey")
              )
          },
          table: transcriptionsTable,
          outputPath: cdk.aws_stepfunctions.JsonPath.DISCARD
        }
      );

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

    const kickoffTranscription = new cdk.aws_stepfunctions.Parallel(
      scope,
      "KickoffTranscription",
      {
        outputPath: cdk.aws_stepfunctions.JsonPath.stringAt("$[0]")
      }
    );
    kickoffTranscription.branch(startTranscriptionTask);
    kickoffTranscription.branch(saveItemInDynamoDBTask);

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
            transcriptFileId:
              cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name"),
            transcriptFilePath: cdk.aws_stepfunctions.JsonPath.format(
              "transcriptions/{}.json",
              cdk.aws_stepfunctions.JsonPath.stringAt(
                "$.TranscriptionJob.TranscriptionJobName"
              )
            ),
            bucketName: transcriptionsBucket.bucketName,
            status: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.TranscriptionJob.TranscriptionJobStatus"
            )
          }
        }
      );

    transcriptionsBucket.grantReadWrite(parseTranscriptionFunction);
    const parseTranscriptionTask = new cdk.aws_stepfunctions_tasks.LambdaInvoke(
      scope,
      "ParseTranscriptionTask",
      {
        lambdaFunction: parseTranscriptionFunction,
        outputPath: cdk.aws_stepfunctions.JsonPath.DISCARD
      }
    );

    // const prepareDataForBedrockTask =
    //   new cdk.aws_stepfunctions_tasks.LambdaInvoke(
    //     scope,
    //     "PrepareDataForBedrockTask",
    //     {
    //       lambdaFunction: ""
    //     }
    //   );

    //     const executeAthenaQueryTask =
    //       new cdk.aws_stepfunctions_tasks.AthenaStartQueryExecution(
    //         scope,
    //         "ExecuteAthenaQueryTask",
    //         {
    //           integrationPattern: cdk.aws_stepfunctions.IntegrationPattern.RUN_JOB,
    //           queryString: cdk.aws_stepfunctions.JsonPath.format(
    //             `
    // UNLOAD(
    //   select
    //       array_join(array_agg(transcriptItem.transcript), '') as fullTranscription
    //   from
    //       transcriptions
    //   CROSS JOIN UNNEST(results.transcripts) as t(transcriptItem)
    //   WHERE jobName = '{}'
    // )
    // TO '${transcriptionsBucket.s3UrlForObject("data/{}")}'
    // with (format = 'TEXTFILE', compression = 'NONE')
    // `,
    //             cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name"),
    //             cdk.aws_stepfunctions.JsonPath.stringAt("$$.Execution.Name")
    //           ),
    //           queryExecutionContext: {
    //             databaseName: "transcriptions"
    //           },
    //           resultConfiguration: {
    //             outputLocation: {
    //               bucketName: transcriptionsBucket.bucketName,
    //               objectKey: "athena"
    //             }
    //           }
    //         }
    //       );

    const startIngestionJobPolicy = new cdk.aws_iam.PolicyStatement({
      actions: ["bedrock:StartIngestionJob"],
      resources: [bedrockKnowledgeBase.knowledgeBaseArn]
    });
    const associateThirdPartyKnowledgeBasePolicy =
      new cdk.aws_iam.PolicyStatement({
        actions: ["bedrock:AssociateThirdPartyKnowledgeBase"],
        resources: [bedrockKnowledgeBase.knowledgeBaseArn]
      });

    const startBedrockDataIngestionTask =
      new cdk.aws_stepfunctions_tasks.CallAwsService(
        scope,
        "StartBedrockDataIngestionTask",
        {
          service: "bedrockagent",
          action: "startIngestionJob",
          parameters: {
            DataSourceId: bedrockDataSource.dataSourceId,
            KnowledgeBaseId: bedrockKnowledgeBase.knowledgeBaseId
          },
          iamResources: ["*"],
          additionalIamStatements: [
            startIngestionJobPolicy,
            associateThirdPartyKnowledgeBasePolicy
          ],
          resultSelector: {
            jobId: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.IngestionJob.IngestionJobId"
            ),
            status: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.IngestionJob.Status"
            )
          }
        }
      );

    const getIngestionJobPolicy = new cdk.aws_iam.PolicyStatement({
      actions: ["bedrock:GetIngestionJob"],
      resources: [bedrockKnowledgeBase.knowledgeBaseArn]
    });

    const checkBedrockDataIngestionTask =
      new cdk.aws_stepfunctions_tasks.CallAwsService(
        scope,
        "CheckBedrockDataIngestionTask",
        {
          service: "bedrockagent",
          action: "getIngestionJob",
          parameters: {
            DataSourceId: bedrockDataSource.dataSourceId,
            KnowledgeBaseId: bedrockKnowledgeBase.knowledgeBaseId,
            IngestionJobId: cdk.aws_stepfunctions.JsonPath.stringAt("$.jobId")
          },
          iamResources: ["*"],
          additionalIamStatements: [getIngestionJobPolicy],
          resultSelector: {
            status: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.IngestionJob.Status"
            ),
            jobId: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.IngestionJob.IngestionJobId"
            )
          }
        }
      );

    const bedrockIngestionSuccessful = new cdk.aws_stepfunctions.Pass(
      scope,
      "BedrockIngestionSuccessful"
    );

    const bedrockIngestionFailed = new cdk.aws_stepfunctions.Pass(
      scope,
      "BedrockIngestionFailed"
    );

    const decideOnBedrockIngestionStatus = new cdk.aws_stepfunctions.Choice(
      scope,
      "DecideOnBedrockIngestionStatus"
    );

    decideOnBedrockIngestionStatus.when(
      /**
       * Notice that it is different than the status we get from AWS Transcribe.
       */
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "COMPLETE"),
      bedrockIngestionSuccessful
    );

    decideOnBedrockIngestionStatus.when(
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "FAILED"),
      bedrockIngestionFailed
    );

    const ingestionStatusWaitFor10Seconds = new cdk.aws_stepfunctions.Wait(
      scope,
      "IngestionStatusWaitFor10Seconds",
      {
        time: cdk.aws_stepfunctions.WaitTime.duration(cdk.Duration.seconds(10))
      }
    );

    const handleBedrockIngestion = ingestionStatusWaitFor10Seconds
      .next(checkBedrockDataIngestionTask)
      .next(decideOnBedrockIngestionStatus);

    decideOnBedrockIngestionStatus.otherwise(handleBedrockIngestion);

    // ----

    const transcriptionSuccessful = parseTranscriptionTask.next(
      startBedrockDataIngestionTask.next(handleBedrockIngestion)
    );

    const transcriptionFailed = new cdk.aws_stepfunctions.Pass(
      scope,
      "TranscriptionFailed"
    );

    const decideOnTranscriptionStatus = new cdk.aws_stepfunctions.Choice(
      scope,
      "DecideOnTranscriptionStatus"
    );

    decideOnTranscriptionStatus.when(
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "COMPLETED"),
      transcriptionSuccessful
    );

    decideOnTranscriptionStatus.when(
      cdk.aws_stepfunctions.Condition.stringEquals("$.status", "FAILED"),
      transcriptionFailed
    );

    const transcriptionStatusWaitFor10Seconds = new cdk.aws_stepfunctions.Wait(
      scope,
      "TranscriptionStatusWaitFor10Seconds",
      {
        time: cdk.aws_stepfunctions.WaitTime.duration(cdk.Duration.seconds(10))
      }
    );

    const handleTranscription = transcriptionStatusWaitFor10Seconds
      .next(checkTranscriptionStatusTask)
      .next(decideOnTranscriptionStatus);

    decideOnTranscriptionStatus.otherwise(handleTranscription);

    const body = cdk.aws_stepfunctions.DefinitionBody.fromChainable(
      kickoffTranscription.next(handleTranscription)
    );

    super(scope, "MediaStateMachine", {
      definitionBody: body
    });
  }
}

/**
 * 1. Invoke the Amazon Bedrock for chat. See the console how to do it.
 * 2. Consider adding metadata to the files? This should allow us to use -> https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_RetrievalFilter.html ??
 *  - We could use `source` to point the agent to specific file. See Pinecone console?
 */
