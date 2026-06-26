import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({});

export async function loadSlackWebhookUrl(secretId: string): Promise<string> {
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = result.SecretString;
  if (!secretString) {
    throw new Error("Slack secret must contain SecretString");
  }

  const parsed = JSON.parse(secretString) as unknown;
  if (
    !isRecord(parsed) ||
    typeof parsed.webhookUrl !== "string" ||
    !parsed.webhookUrl.startsWith("https://hooks.slack.com/")
  ) {
    throw new Error("Slack secret must include webhookUrl");
  }

  return parsed.webhookUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
