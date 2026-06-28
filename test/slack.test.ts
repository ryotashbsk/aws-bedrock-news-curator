import assert from "node:assert/strict";
import test from "node:test";
import { formatSlackMessages } from "../src/lambda/slack.js";
import type { CuratedCategoryResult, CuratedTopic, NewsCategory } from "../src/lambda/types.js";

const category: NewsCategory = {
  id: "ai",
  title: "AIニュース",
  agentPromptPath: "agents/ai-news.md",
  sources: [],
};

function createTopic(topic: Pick<CuratedTopic, "title" | "summary" | "officialLink">): CuratedTopic {
  return {
    ...topic,
    changed: "",
    engineerUse: "",
    adoption: "",
    cautions: "",
  };
}

void test("formatSlackMessages creates readable block kit messages", () => {
  const result: CuratedCategoryResult = {
    todaysUpdates: [
      createTopic({
        title: "Nova の更新",
        summary: "日本語の短い要約",
        officialLink: "https://example.com/nova",
      }),
    ],
  };

  const messages = formatSlackMessages(category, result, new Date("2026-06-26T00:00:00+09:00"));

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, "AIニュース - 2026/06/26(金)");
  assert.deepEqual(
    messages[0]?.blocks.some((block) =>
      JSON.stringify(block).includes("━━━━━━━━━━━━━━━━━━━━\\n*AIニュース - 2026/06/26(金)*"),
    ),
    true,
  );
  assert.deepEqual(
    messages[0]?.blocks.some((block) =>
      JSON.stringify(block).includes("*1. Nova の更新*\\n日本語の短い要約\\n<https://example.com/nova>"),
    ),
    true,
  );
  assert.equal(JSON.stringify(messages[0]?.blocks).includes("最近の重要アップデート"), false);
  assert.equal(JSON.stringify(messages[0]?.blocks).includes("今日の最新情報"), false);
});

void test("formatSlackMessages splits blocks across multiple messages", () => {
  const topic = createTopic({
    title: "Long update",
    summary: "Summary",
    officialLink: "https://example.com/update",
  });
  const result: CuratedCategoryResult = {
    todaysUpdates: Array.from({ length: 50 }, (_, index) => ({
      ...topic,
      title: `${topic.title} ${index + 1}`,
      officialLink: `${topic.officialLink}-${index + 1}`,
    })),
  };
  const messages = formatSlackMessages(category, result, new Date("2026-06-26T00:00:00+09:00"));

  assert.ok(messages.length > 1);
  assert.ok(messages.every((message) => message.blocks.length <= 45));
});
