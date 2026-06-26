import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { CandidateTopic, CuratedCategoryResult, CuratedTopic, NewsCategory } from "./types.js";

const bedrockClient = new BedrockRuntimeClient({});

export async function curateWithBedrock(input: {
  readonly modelId: string;
  readonly category: NewsCategory;
  readonly agentPrompt: string;
  readonly candidates: readonly CandidateTopic[];
  readonly previousUrls: readonly string[];
}): Promise<CuratedCategoryResult> {
  if (input.candidates.length === 0) {
    return { todaysUpdates: [], recentImportantUpdates: [] };
  }

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: input.modelId,
      inferenceConfig: {
        maxTokens: 5000,
        temperature: 0.2,
      },
      messages: [
        {
          role: "user",
          content: [
            {
              text: buildCuratorPrompt(input),
            },
          ],
        },
      ],
    }),
  );

  const text = response.output?.message?.content?.flatMap((content) => (content.text ? [content.text] : [])).join("\n");
  if (!text) {
    throw new Error(`Bedrock returned no text for category: ${input.category.id}`);
  }

  return parseCuratedResult(text);
}

export function buildCuratorPrompt(input: {
  readonly category: NewsCategory;
  readonly agentPrompt: string;
  readonly candidates: readonly CandidateTopic[];
  readonly previousUrls: readonly string[];
}): string {
  return [
    "あなたはチーム向け技術ニュースの編集者。",
    "次のカテゴリ指示に従い、公式一次情報の候補だけから Slack 投稿用のニュースを選別する。",
    "候補に無い情報、公式リンクが無い情報、推測情報は採用しない。",
    "Slack 投稿に表示される title, summary, changed, engineerUse, nonEngineerUse, adoption, cautions は必ず自然な日本語に翻訳・要約する。",
    "英語の公式タイトルや本文をそのまま貼り付けない。ただしサービス名、会社名、製品名、API名、モデル名などの固有名詞は原語のまま残してよい。",
    "出力は Markdown ではなく JSON のみ。",
    "JSON schema:",
    JSON.stringify({
      todaysUpdates: [
        {
          title: "string",
          summary: "string",
          changed: "string",
          engineerUse: "string",
          nonEngineerUse: "string optional for AI category",
          adoption: "string",
          cautions: "string",
          officialLink: "string",
        },
      ],
      recentImportantUpdates: [],
    }),
    "",
    "カテゴリ指示:",
    input.agentPrompt,
    "",
    "昨日以前に通知済みのURL。これらは採用しない:",
    JSON.stringify(input.previousUrls, null, 2),
    "",
    "候補トピック:",
    JSON.stringify(input.candidates, null, 2),
  ].join("\n");
}

export function parseCuratedResult(text: string): CuratedCategoryResult {
  const parsed = JSON.parse(extractJson(text)) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("curated result must be an object");
  }

  return {
    todaysUpdates: parseTopicArray(parsed.todaysUpdates, "todaysUpdates"),
    recentImportantUpdates: parseTopicArray(parsed.recentImportantUpdates, "recentImportantUpdates"),
  };
}

function parseTopicArray(value: unknown, key: string): CuratedTopic[] {
  if (!Array.isArray(value)) {
    throw new Error(`curated result must include ${key}`);
  }
  return value.map(parseTopic);
}

function parseTopic(value: unknown): CuratedTopic {
  if (!isRecord(value)) {
    throw new Error("curated topic must be an object");
  }
  return {
    title: readString(value, "title"),
    summary: readString(value, "summary"),
    changed: readString(value, "changed"),
    engineerUse: readString(value, "engineerUse"),
    ...(typeof value.nonEngineerUse === "string" ? { nonEngineerUse: value.nonEngineerUse } : {}),
    adoption: readString(value, "adoption"),
    cautions: readString(value, "cautions"),
    officialLink: readString(value, "officialLink"),
  };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    return fenced.trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Bedrock response did not contain JSON");
  }
  return text.slice(start, end + 1);
}

function readString(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== "string" || property.trim().length === 0) {
    throw new Error(`missing curated topic property: ${key}`);
  }
  return property;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
