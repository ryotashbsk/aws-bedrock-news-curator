import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { NewsConfig } from "../shared/types.js";

/** ニュース設定 JSON の読み込み */
export async function loadNewsConfig(configPath: string, baseDir: string): Promise<NewsConfig> {
  const resolvedPath = isAbsolute(configPath) ? configPath : join(baseDir, configPath);
  return JSON.parse(await readFile(resolvedPath, "utf8")) as NewsConfig;
}
