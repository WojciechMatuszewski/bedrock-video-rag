#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BedrockVideoRagStack } from "../lib/bedrock-video-rag-stack";

const app = new cdk.App();
new BedrockVideoRagStack(app, "BedrockVideoRagStack", {
  synthesizer: new cdk.DefaultStackSynthesizer({
    qualifier: "bedrockrag"
  })
});
