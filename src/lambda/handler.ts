import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { loadNewsConfig } from "./config.js";
import { curateWithBedrock } from "./bedrock-curator.js";
import { fetchCandidateTopics } from "./source-fetcher.js";
import { createDynamoHistoryStore } from "./history-store.js";
import { loadSlackWebhookUrl } from "./secrets.js";
import { formatSlackMessages, postSlackMessages } from "./slack.js";
import type { CandidateTopic, CuratedCategoryResult, CuratedTopic } from "./types.js";
import { normalizeUrl } from "./url.js";

type HandlerResult = {
  readonly postedCategories: readonly string[];
};

const workspaceRoot = process.cwd();

export async function handler(): Promise<HandlerResult> {
  const env = readEnvironment();
  const config = await loadNewsConfig(env.newsConfigPath, workspaceRoot);
  const historyStore = createDynamoHistoryStore(env.notifiedUrlTableName);
  const webhookUrl = await loadSlackWebhookUrl(env.slackSecretId);
  const postedCategories: string[] = [];

  for (const category of config.categories) {
    const agentPrompt = await readAgentPrompt(category.agentPromptPath);
    const candidates = await fetchCandidateTopics(category.sources);
    const freshCandidates = await filterFreshCandidates(category.id, candidates, historyStore.hasNotified);
    const freshUrls = new Set(freshCandidates.map((candidate) => normalizeUrl(candidate.url)));
    const previousUrls = candidates
      .map((candidate) => normalizeUrl(candidate.url))
      .filter((url) => !freshUrls.has(url));

    const curated = filterCuratedResultByCandidates(
      await curateWithBedrock({
        modelId: env.bedrockModelId,
        category,
        agentPrompt,
        candidates: freshCandidates,
        previousUrls,
      }),
      freshCandidates,
    );

    const messages = formatSlackMessages(category, curated, new Date());
    await postSlackMessages(webhookUrl, messages);

    for (const topic of curated.todaysUpdates.concat(curated.recentImportantUpdates)) {
      await historyStore.markNotified(category.id, topic);
    }

    postedCategories.push(category.id);
  }

  return { postedCategories };
}

function filterCuratedResultByCandidates(
  result: CuratedCategoryResult,
  candidates: readonly CandidateTopic[],
): CuratedCategoryResult {
  const candidateUrls = new Set(candidates.map((candidate) => normalizeUrl(candidate.url)));
  return {
    todaysUpdates: filterCuratedTopics(result.todaysUpdates, candidateUrls),
    recentImportantUpdates: filterCuratedTopics(result.recentImportantUpdates, candidateUrls),
  };
}

function filterCuratedTopics(topics: readonly CuratedTopic[], candidateUrls: ReadonlySet<string>): CuratedTopic[] {
  return topics.filter((topic) => candidateUrls.has(normalizeUrl(topic.officialLink)));
}

async function filterFreshCandidates(
  categoryId: string,
  candidates: readonly CandidateTopic[],
  hasNotified: (categoryId: string, url: string) => Promise<boolean>,
): Promise<CandidateTopic[]> {
  const freshCandidates: CandidateTopic[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of candidates) {
    const url = normalizeUrl(candidate.url);
    if (seenUrls.has(url) || (await hasNotified(categoryId, url))) {
      continue;
    }
    seenUrls.add(url);
    freshCandidates.push({ ...candidate, url });
  }

  return freshCandidates;
}

async function readAgentPrompt(promptPath: string): Promise<string> {
  const resolvedPath = isAbsolute(promptPath) ? promptPath : join(workspaceRoot, promptPath);
  return readFile(resolvedPath, "utf8");
}

function readEnvironment(): {
  readonly bedrockModelId: string;
  readonly newsConfigPath: string;
  readonly notifiedUrlTableName: string;
  readonly slackSecretId: string;
} {
  return {
    bedrockModelId: readEnv("BEDROCK_MODEL_ID"),
    newsConfigPath: readEnv("NEWS_CONFIG_PATH"),
    notifiedUrlTableName: readEnv("NOTIFIED_URL_TABLE_NAME"),
    slackSecretId: readEnv("SLACK_SECRET_ID"),
  };
}

function readEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`missing environment variable: ${key}`);
  }
  return value;
}
