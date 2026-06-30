import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { NewsCategory, NewsConfig, NewsSource } from "../shared/types.js";

/** ニュース設定 JSON の読み込みと検証。 */
export async function loadNewsConfig(configPath: string, baseDir: string): Promise<NewsConfig> {
  const resolvedPath = isAbsolute(configPath) ? configPath : join(baseDir, configPath);
  const rawConfig = JSON.parse(await readFile(resolvedPath, "utf8")) as unknown;
  return parseNewsConfig(rawConfig);
}

/** unknown の設定値を Lambda 内部で使う型へ変換。 */
export function parseNewsConfig(value: unknown): NewsConfig {
  if (!isRecord(value) || !Array.isArray(value.categories)) {
    throw new Error("news config must include categories");
  }

  return {
    categories: value.categories.map(parseCategory),
  };
}

function parseCategory(value: unknown): NewsCategory {
  if (!isRecord(value)) {
    throw new Error("news category must be an object");
  }

  const id = readString(value, "id");
  const title = readString(value, "title");
  const agentPromptPath = readString(value, "agentPromptPath");
  const sourcesValue = value.sources;

  if (!Array.isArray(sourcesValue) || sourcesValue.length === 0) {
    throw new Error(`news category ${id} must include sources`);
  }

  return {
    id,
    title,
    agentPromptPath,
    sources: sourcesValue.map(parseSource),
  };
}

function parseSource(value: unknown): NewsSource {
  if (!isRecord(value)) {
    throw new Error("news source must be an object");
  }

  return {
    name: readString(value, "name"),
    url: readString(value, "url"),
  };
}

function readString(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  if (typeof property !== "string" || property.trim().length === 0) {
    throw new Error(`missing string property: ${key}`);
  }
  return property;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
