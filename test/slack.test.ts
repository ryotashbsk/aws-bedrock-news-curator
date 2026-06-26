import assert from "node:assert/strict";
import test from "node:test";
import { formatSlackMessages } from "../src/lambda/slack.js";
import type { CuratedCategoryResult, NewsCategory } from "../src/lambda/types.js";

const category: NewsCategory = {
  id: "ai",
  title: "AIニュース",
  agentPromptPath: "agents/ai-news.md",
  sources: [],
};

void test("formatSlackMessages creates readable block kit messages", () => {
  const result: CuratedCategoryResult = {
    todaysUpdates: [
      {
        title: "Nova の更新",
        summary: "日本語の短い要約",
        changed: "API の使い方が変わった",
        engineerUse: "検証環境で試す",
        nonEngineerUse: "業務改善案の確認に使う",
        adoption: "AWS Console で有効化する",
        cautions: "リージョン制約に注意する",
        officialLink: "https://example.com/nova",
      },
    ],
    recentImportantUpdates: [],
  };

  const messages = formatSlackMessages(category, result, new Date("2026-06-26T00:00:00+09:00"));

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, "AIニュース - 2026/06/26(金)");
  assert.deepEqual(messages[0]?.blocks[0], {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "━━━━━━━━━━━━━━━━━━━━",
    },
  });
  assert.equal(messages[0]?.blocks[1]?.type, "header");
  assert.deepEqual(
    messages[0]?.blocks.some((block) => JSON.stringify(block).includes("<https://example.com/nova|Nova の更新>")),
    true,
  );
  assert.deepEqual(
    messages[0]?.blocks.some((block) => JSON.stringify(block).includes("公式リンク")),
    true,
  );
});

void test("formatSlackMessages splits blocks across multiple messages", () => {
  const topic = {
    title: "Long update",
    summary: "Summary",
    changed: "Changed",
    engineerUse: "Engineer use",
    adoption: "Adoption",
    cautions: "Cautions",
    officialLink: "https://example.com/update",
  };
  const result: CuratedCategoryResult = {
    todaysUpdates: Array.from({ length: 20 }, (_, index) => ({
      ...topic,
      title: `${topic.title} ${index + 1}`,
      officialLink: `${topic.officialLink}-${index + 1}`,
    })),
    recentImportantUpdates: [],
  };
  const messages = formatSlackMessages(category, result, new Date("2026-06-26T00:00:00+09:00"));

  assert.ok(messages.length > 1);
  assert.ok(messages.every((message) => message.blocks.length <= 45));
});
