#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BedrockVideoRagStack } from "../lib/bedrock-video-rag-stack.ts";
import { IConstruct } from "constructs";

const app = new cdk.App();

const stack = new BedrockVideoRagStack(app, "BedrockVideoRagStack", {
  synthesizer: new cdk.DefaultStackSynthesizer({
    qualifier: "bedrockrag"
  })
});

class RemovalPolicyAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}

cdk.Aspects.of(stack).add(new RemovalPolicyAspect());
