import * as cdk from "aws-cdk-lib";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { IStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export class BedrockVideoRagStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mediaBucket = new MediaBucket(this);

    const mediaStateMachine = new MediaStateMachine(this);

    const mediaBus = new MediaBus(this, mediaBucket, mediaStateMachine);
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

class MediaBus extends cdk.aws_events.EventBus {
  constructor(scope: Construct, bucket: IBucket, stateMachine: IStateMachine) {
    super(scope, "MediaBus");

    const fileUploadedRule = new cdk.aws_events.Rule(this, "FileUploadedRule", {
      enabled: true,
      /**
       * TODO: use the default bus here.
       */
      eventBus: this,
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: {
            name: [bucket.bucketName]
          }
        }
      }
    });

    fileUploadedRule.addTarget(
      new cdk.aws_events_targets.SfnStateMachine(stateMachine)
    );
  }
}

class MediaStateMachine extends cdk.aws_stepfunctions.StateMachine {
  constructor(scope: Construct) {
    const passStep = new cdk.aws_stepfunctions.Pass(scope, "Pass");

    super(scope, "MediaStateMachine", {
      definitionBody:
        cdk.aws_stepfunctions.DefinitionBody.fromChainable(passStep)
    });
  }
}
