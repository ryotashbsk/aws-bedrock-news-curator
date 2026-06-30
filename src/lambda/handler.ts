import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { loadNewsConfig } from "./config/news-config.js";
import { curateWithBedrock } from "./curation/bedrock-curator.js";
import { formatDailySlackMessage, postSlackMessages } from "./notifications/slack.js";
import { formatNewsHtml } from "./output/news-html.js";
import { normalizeUrl } from "./shared/url.js";
import type { CandidateTopic, CuratedCategoryNews, CuratedCategoryResult, CuratedTopic } from "./shared/types.js";
import { fetchCandidateTopics } from "./sources/source-fetcher.js";
import { uploadNewsHtml } from "./storage/news-page-store.js";
import { loadSlackWebhookUrl } from "./storage/secrets.js";

type HandlerResult = {
  readonly postedCategories: readonly string[];
  readonly htmlUrl: string;
};

const workspaceRoot = process.cwd();

/** ニュース収集から Slack 通知までの Lambda 実行入口 */
export async function handler(): Promise<HandlerResult> {
  const env = readEnvironment();
  const config = await loadNewsConfig(env.newsConfigPath, workspaceRoot);
  const webhookUrl = await loadSlackWebhookUrl(env.slackSecretId);
  const currentDate = new Date();
  const curatedCategories: CuratedCategoryNews[] = [];
  const postedCategories: string[] = [];

  for (const category of config.categories) {
    const agentPrompt = await readAgentPrompt(category.agentPromptPath);
    const candidates = await fetchCandidateTopics(category.sources);
    const freshCandidates = filterFreshCandidates(candidates);

    const curated = filterCuratedResultByCandidates(
      await curateWithBedrock({
        modelId: env.bedrockModelId,
        category,
        agentPrompt,
        candidates: freshCandidates,
      }),
      freshCandidates,
    );

    curatedCategories.push({ category, result: curated });
    postedCategories.push(category.id);
  }

  const html = formatNewsHtml({ categories: curatedCategories, date: currentDate });
  const htmlUrl = await uploadNewsHtml({
    bucketName: env.newsHtmlBucketName,
    publicBaseUrl: env.newsHtmlPublicBaseUrl,
    date: currentDate,
    html,
  });
  await postSlackMessages(webhookUrl, [
    formatDailySlackMessage({ categories: curatedCategories, date: currentDate, htmlUrl }),
  ]);

  return { postedCategories, htmlUrl };
}

function filterCuratedResultByCandidates(
  result: CuratedCategoryResult,
  candidates: readonly CandidateTopic[],
): CuratedCategoryResult {
  const candidateUrls = new Set(candidates.map((candidate) => normalizeUrl(candidate.url)));
  return {
    todaysUpdates: filterCuratedTopics(result.todaysUpdates, candidateUrls),
  };
}

/** Bedrock 応答から、今回取得した候補 URL に含まれる記事だけを残す */
function filterCuratedTopics(topics: readonly CuratedTopic[], candidateUrls: ReadonlySet<string>): CuratedTopic[] {
  return topics.filter((topic) => candidateUrls.has(normalizeUrl(topic.officialLink)));
}

/** 同一実行内の重複 URL を除外した候補一覧 */
function filterFreshCandidates(candidates: readonly CandidateTopic[]): CandidateTopic[] {
  const freshCandidates: CandidateTopic[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of candidates) {
    const url = normalizeUrl(candidate.url);
    if (seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    freshCandidates.push({ ...candidate, url });
  }

  return freshCandidates;
}

/** カテゴリ別エージェントプロンプトの読み込み */
async function readAgentPrompt(promptPath: string): Promise<string> {
  const resolvedPath = isAbsolute(promptPath) ? promptPath : join(workspaceRoot, promptPath);
  return readFile(resolvedPath, "utf8");
}

/** Lambda 実行に必要な環境変数一覧 */
function readEnvironment(): {
  readonly bedrockModelId: string;
  readonly newsHtmlBucketName: string;
  readonly newsHtmlPublicBaseUrl: string;
  readonly newsConfigPath: string;
  readonly slackSecretId: string;
} {
  return {
    bedrockModelId: readEnv("BEDROCK_MODEL_ID"),
    newsHtmlBucketName: readEnv("NEWS_HTML_BUCKET_NAME"),
    newsHtmlPublicBaseUrl: readEnv("NEWS_HTML_PUBLIC_BASE_URL"),
    newsConfigPath: readEnv("NEWS_CONFIG_PATH"),
    slackSecretId: readEnv("SLACK_SECRET_ID"),
  };
}

/** 必須環境変数の取得。未設定時は起動失敗扱い */
function readEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`missing environment variable: ${key}`);
  }
  return value;
}
