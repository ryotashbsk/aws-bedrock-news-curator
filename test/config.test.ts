import assert from "node:assert/strict";
import test from "node:test";
import { parseNewsConfig } from "../src/lambda/config/news-config.js";

void test("parseNewsConfig accepts valid category config", () => {
  const config = parseNewsConfig({
    categories: [
      {
        id: "ai",
        title: "AIニュース",
        agentPromptPath: "agents/ai-news.md",
        sources: [{ name: "OpenAI", url: "https://openai.com/news/rss.xml" }],
      },
    ],
  });

  assert.equal(config.categories[0]?.id, "ai");
  assert.equal(config.categories[0]?.sources[0]?.url, "https://openai.com/news/rss.xml");
});

void test("parseNewsConfig rejects missing source url", () => {
  assert.throws(
    () =>
      parseNewsConfig({
        categories: [
          {
            id: "ai",
            title: "AIニュース",
            agentPromptPath: "agents/ai-news.md",
            sources: [{ name: "OpenAI" }],
          },
        ],
      }),
    /missing string property: url/,
  );
});
