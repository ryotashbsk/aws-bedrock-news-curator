import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { NewsCuratorStack } from "../lib/news-curator-stack.js";

void test("stack defines daily JST scheduler and state store", () => {
  const app = new App();
  const stack = new NewsCuratorStack(app, "TestStack", {
    env: { region: "ap-northeast-1" },
  });
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::Scheduler::Schedule", {
    Name: "AwsBedrockNewsCuratorWeekdayMorningSchedule",
    ScheduleExpression: "cron(0 8 * * ? *)",
    ScheduleExpressionTimezone: "Asia/Tokyo",
    Target: {
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 2,
      },
    },
  });
  template.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    TableName: "AwsBedrockNewsCuratorNotifiedUrls",
  });
  template.hasResourceProperties("AWS::SecretsManager::Secret", {
    Name: "aws-bedrock-news-curator/slack-webhook",
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "AwsBedrockNewsCuratorFunction",
    MemorySize: 512,
    Environment: {
      Variables: {
        NEWS_HTML_BUCKET_NAME: {
          Ref: Match.stringLikeRegexp("NewsHtmlBucket"),
        },
        NEWS_HTML_PUBLIC_BASE_URL: Match.anyValue(),
      },
    },
  });
  template.hasResourceProperties("AWS::S3::Bucket", {
    WebsiteConfiguration: {
      IndexDocument: "index.html",
    },
  });
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: "/aws/lambda/AwsBedrockNewsCuratorFunction",
    RetentionInDays: 30,
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: "AwsBedrockNewsCuratorLambdaRole",
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Principal: {
            Service: "lambda.amazonaws.com",
          },
        },
      ],
    },
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: "AwsBedrockNewsCuratorSchedulerRole",
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Principal: {
            Service: "scheduler.amazonaws.com",
          },
        },
      ],
    },
  });
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
          Effect: "Allow",
        }),
        Match.objectLike({
          Action: ["dynamodb:DescribeTable", "dynamodb:GetItem", "dynamodb:PutItem"],
          Effect: "Allow",
        }),
        Match.objectLike({
          Action: ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue"],
          Effect: "Allow",
        }),
        Match.objectLike({
          Action: "s3:PutObject",
          Effect: "Allow",
        }),
        Match.objectLike({
          Action: ["bedrock:InvokeModel", "bedrock:Converse"],
          Effect: "Allow",
          Resource: [
            {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    Ref: "AWS::Partition",
                  },
                  ":bedrock:ap-northeast-1:",
                  {
                    Ref: "AWS::AccountId",
                  },
                  ":inference-profile/apac.amazon.nova-lite-v1:0",
                ],
              ],
            },
            {
              "Fn::Join": [
                "",
                [
                  "arn:",
                  {
                    Ref: "AWS::Partition",
                  },
                  ":bedrock:*::foundation-model/amazon.nova-lite-v1:0",
                ],
              ],
            },
          ],
        }),
      ]),
    },
  });

  assert.equal(template.findResources("AWS::Lambda::Function") !== undefined, true);
});
