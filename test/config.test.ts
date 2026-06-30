import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNewsConfig } from "../src/lambda/config/news-config.js";

void test("loadNewsConfig reads category config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "news-config-"));
  try {
    await writeFile(
      join(dir, "news-sources.json"),
      JSON.stringify({
        categories: [
          {
            id: "ai",
            title: "AIニュース",
            agentPromptPath: "agents/ai-news.md",
            sources: [{ name: "OpenAI", url: "https://openai.com/news/rss.xml" }],
          },
        ],
      }),
      "utf8",
    );

    const config = await loadNewsConfig("news-sources.json", dir);

    assert.equal(config.categories[0]?.id, "ai");
    assert.equal(config.categories[0]?.sources[0]?.url, "https://openai.com/news/rss.xml");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
