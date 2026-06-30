import { ArnFormat, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnSchedule } from "aws-cdk-lib/aws-scheduler";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const bedrockDefaultModelId = "apac.amazon.nova-lite-v1:0";

const resourceNames = {
  functionName: "AwsBedrockNewsCuratorFunction",
  lambdaRoleName: "AwsBedrockNewsCuratorLambdaRole",
  logGroupName: "/aws/lambda/AwsBedrockNewsCuratorFunction",
  schedulerName: "AwsBedrockNewsCuratorWeekdayMorningSchedule",
  schedulerRoleName: "AwsBedrockNewsCuratorSchedulerRole",
} as const;

export class NewsCuratorStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bedrockModelId = this.node.tryGetContext("bedrockModelId") as string | undefined;
    const scheduleExpression = this.node.tryGetContext("scheduleExpression") as string | undefined;
    const scheduleTimezone = this.node.tryGetContext("scheduleTimezone") as string | undefined;
    const slackSecretName = this.node.tryGetContext("slackSecretName") as string | undefined;

    const slackSecret = new Secret(this, "SlackWebhookSecret", {
      secretName: slackSecretName ?? "aws-bedrock-news-curator/slack-webhook",
      description: "Slack Incoming Webhook URL for AWS Bedrock news curator",
      removalPolicy: RemovalPolicy.RETAIN,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ webhookUrl: "replace-me" }),
        generateStringKey: "nonce",
      },
    });

    const newsHtmlBucket = new Bucket(this, "NewsHtmlBucket", {
      websiteIndexDocument: "index.html",
      publicReadAccess: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const logGroup = new LogGroup(this, "NewsCuratorLogGroup", {
      logGroupName: resourceNames.logGroupName,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambdaRole = new Role(this, "NewsCuratorLambdaRole", {
      roleName: resourceNames.lambdaRoleName,
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    lambdaRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        resources: [`${logGroup.logGroupArn}:*`],
      }),
    );

    lambdaRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue"],
        resources: [slackSecret.secretArn],
      }),
    );

    lambdaRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [`${newsHtmlBucket.bucketArn}/news/*`],
      }),
    );

    lambdaRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["bedrock:InvokeModel", "bedrock:Converse"],
        resources: this.bedrockModelResourceArns(bedrockModelId ?? bedrockDefaultModelId),
      }),
    );

    const curatorFunction = new NodejsFunction(this, "NewsCuratorFunction", {
      functionName: resourceNames.functionName,
      entry: path.join(dirname, "../src/lambda/handler.ts"),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(10),
      memorySize: 512,
      logGroup,
      role: lambdaRole,
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        sourceMap: true,
        externalModules: [],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir, outputDir) => [
            `cp -R ${inputDir}/config ${outputDir}/config`,
            `cp -R ${inputDir}/agents ${outputDir}/agents`,
            `cp -R ${inputDir}/templates ${outputDir}/templates`,
          ],
        },
      },
      environment: {
        BEDROCK_MODEL_ID: bedrockModelId ?? bedrockDefaultModelId,
        NEWS_HTML_BUCKET_NAME: newsHtmlBucket.bucketName,
        NEWS_HTML_PUBLIC_BASE_URL: newsHtmlBucket.bucketWebsiteUrl,
        NEWS_CONFIG_PATH: "config/news-sources.json",
        SLACK_SECRET_ID: slackSecret.secretArn,
      },
    });

    const schedulerRole = new Role(this, "SchedulerInvokeRole", {
      roleName: resourceNames.schedulerRoleName,
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com"),
    });
    schedulerRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [curatorFunction.functionArn, `${curatorFunction.functionArn}:*`],
      }),
    );

    new CfnSchedule(this, "WeekdayMorningSchedule", {
      name: resourceNames.schedulerName,
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: scheduleExpression ?? "cron(0 7 * * ? *)",
      scheduleExpressionTimezone: scheduleTimezone ?? "Asia/Tokyo",
      target: {
        arn: curatorFunction.functionArn,
        roleArn: schedulerRole.roleArn,
        retryPolicy: {
          maximumEventAgeInSeconds: 3600,
          maximumRetryAttempts: 2,
        },
      },
    });
  }

  private bedrockModelResourceArns(modelId: string): string[] {
    const isInferenceProfile = !isFoundationModelId(modelId);
    if (!isInferenceProfile) {
      return [this.foundationModelArn(modelId)];
    }

    return [
      this.formatArn({
        service: "bedrock",
        resource: "inference-profile",
        resourceName: modelId,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      }),
      this.foundationModelArn(toFoundationModelId(modelId)),
    ];
  }

  private foundationModelArn(modelId: string): string {
    return this.formatArn({
      service: "bedrock",
      region: "*",
      account: "",
      resource: "foundation-model",
      resourceName: modelId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
  }
}

function isFoundationModelId(modelId: string): boolean {
  return ["amazon.", "anthropic.", "ai21.", "cohere.", "meta.", "mistral."].some((prefix) =>
    modelId.startsWith(prefix),
  );
}

function toFoundationModelId(modelId: string): string {
  const providerIndex = ["amazon.", "anthropic.", "ai21.", "cohere.", "meta.", "mistral."]
    .map((providerPrefix) => modelId.indexOf(providerPrefix))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return providerIndex === undefined ? modelId : modelId.slice(providerIndex);
}
