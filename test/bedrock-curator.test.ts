import assert from "node:assert/strict";
import test from "node:test";
import { buildCuratorPrompt, parseCuratedResult } from "../src/lambda/bedrock-curator.js";

void test("parseCuratedResult extracts JSON from fenced response", () => {
  const result = parseCuratedResult(`\`\`\`json
{
  "todaysUpdates": [
    {
      "title": "Model update",
      "summary": "Summary",
      "officialLink": "https://example.com/update"
    }
  ]
}
\`\`\``);

  assert.equal(result.todaysUpdates.length, 1);
  assert.equal(result.todaysUpdates[0]?.officialLink, "https://example.com/update");
  assert.equal(result.todaysUpdates[0]?.summary, "Summary");
});

void test("parseCuratedResult rejects missing arrays", () => {
  assert.throws(() => parseCuratedResult("{}"), /todaysUpdates/);
});

void test("buildCuratorPrompt strongly instructs Japanese rewriting", () => {
  const prompt = buildCuratorPrompt({
    category: {
      id: "ai",
      title: "AIニュース",
      agentPromptPath: "agents/ai-news.md",
      sources: [],
    },
    agentPrompt: "AIカテゴリの指示",
    candidates: [],
    previousUrls: [],
  });

  assert.equal(prompt.includes("title, summary は必ず日本語で書く"), true);
  assert.equal(prompt.includes("英語の見出しや本文をそのまま転記しない"), true);
  assert.equal(prompt.includes("固有名詞だけ原語のまま残してよい"), true);
});
