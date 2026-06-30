import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { CandidateTopic, CuratedCategoryResult, CuratedTopic, NewsCategory } from "../shared/types.js";

const bedrockClient = new BedrockRuntimeClient({});

/** 候補トピックを Bedrock に渡し、カテゴリごとの掲載ニュースへ整形 */
export async function curateWithBedrock(input: {
  readonly modelId: string;
  readonly category: NewsCategory;
  readonly agentPrompt: string;
  readonly candidates: readonly CandidateTopic[];
}): Promise<CuratedCategoryResult> {
  if (input.candidates.length === 0) {
    return { todaysUpdates: [] };
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

/** Bedrock に渡す編集指示と候補一覧のプロンプト生成 */
export function buildCuratorPrompt(input: {
  readonly category: NewsCategory;
  readonly agentPrompt: string;
  readonly candidates: readonly CandidateTopic[];
}): string {
  return [
    "あなたはチーム向け技術ニュースの編集者。",
    "次のカテゴリ指示に従い、公式一次情報の候補だけから Slack 投稿用のニュースを選別する。",
    "候補に無い情報、公式リンクが無い情報、推測情報は採用しない。",
    "title, summary は必ず日本語で書く。英語の候補ソースは、意味を保ったまま日本語として自然に再構成する。",
    "英語の見出しや本文をそのまま転記しない。直訳調ではなく、日本語の技術ニュースとして読める表現にする。",
    "サービス名、会社名、製品名、API名、モデル名などの固有名詞だけ原語のまま残してよい。それ以外の説明、動詞、状態、判断は日本語で書く。",
    "summary は3〜5文、180〜260文字を目安にする。何が変わったか、重要な背景、誰に関係するか、チームで確認すべき観点を含める。",
    "出力は Markdown ではなく JSON のみ。",
    "JSON schema:",
    JSON.stringify({
      todaysUpdates: [
        {
          title: "string",
          summary: "string",
          officialLink: "string",
        },
      ],
    }),
    "",
    "カテゴリ指示:",
    input.agentPrompt,
    "",
    "候補トピック:",
    JSON.stringify(input.candidates, null, 2),
  ].join("\n");
}

/** Bedrock のテキスト応答から JSON を取り出し、要約結果へ変換 */
export function parseCuratedResult(text: string): CuratedCategoryResult {
  const parsed = JSON.parse(extractJson(text)) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("curated result must be an object");
  }

  return {
    todaysUpdates: parseTopicArray(parsed.todaysUpdates, "todaysUpdates"),
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
    officialLink: readString(value, "officialLink"),
  };
}

/** Markdown フェンス付き応答にも対応した JSON 本体の抽出 */
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
