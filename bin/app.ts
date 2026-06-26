#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { NewsCuratorStack } from "../lib/news-curator-stack.js";

const app = new App();
const env = process.env.CDK_DEFAULT_ACCOUNT
  ? {
      region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
      account: process.env.CDK_DEFAULT_ACCOUNT,
    }
  : {
      region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
    };

new NewsCuratorStack(app, "AwsBedrockNewsCuratorStack", {
  env,
});
