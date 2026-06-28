import assert from "node:assert/strict";
import test from "node:test";
import { formatDailySlackMessage } from "../src/lambda/slack.js";
import type { CuratedCategoryNews, CuratedTopic, NewsCategory } from "../src/lambda/types.js";

const category: NewsCategory = {
  id: "ai",
  title: "AIニュース",
  agentPromptPath: "agents/ai-news.md",
  sources: [],
};

function createTopic(
  topic: Pick<CuratedTopic, "title" | "summary" | "impact" | "checkPoint" | "officialLink">,
): CuratedTopic {
  return {
    ...topic,
  };
}

void test("formatDailySlackMessage creates short daily message with HTML link", () => {
  const categories: CuratedCategoryNews[] = [
    {
      category,
      result: {
        todaysUpdates: [
          createTopic({
            title: "Nova の更新",
            summary: "日本語の要点。背景も含めて少し余裕を持たせた説明。",
            impact: "開発チームの検証や既存ワークフローに影響する可能性がある。",
            checkPoint: "既存設定との差分と導入優先度を確認する。",
            officialLink: "https://example.com/nova",
          }),
        ],
      },
    },
  ];

  const message = formatDailySlackMessage({
    categories,
    date: new Date("2026-06-26T00:00:00+09:00"),
    htmlUrl: "https://example.com/news/2026/06/26/",
  });

  assert.equal(message.text, "📰本日のTechニュース - 2026/06/26(金)");
  assert.equal(message.blocks.length, 1);
  assert.deepEqual(
    JSON.stringify(message.blocks).includes(
      "━━━━━━━━━━━━━━━━━━━━\\n📰本日のTechニュース - 2026/06/26(金)\\n・Nova の更新\\n\\n本日のニュース一覧はこちら：\\nhttps://example.com/news/2026/06/26/",
    ),
    true,
  );
  assert.equal(JSON.stringify(message.blocks).includes("要点"), false);
  assert.equal(JSON.stringify(message.blocks).includes("影響"), false);
});

void test("formatDailySlackMessage limits headline titles", () => {
  const topic = createTopic({
    title: "Long update",
    summary: "Summary",
    impact: "Impact",
    checkPoint: "Check point",
    officialLink: "https://example.com/update",
  });
  const message = formatDailySlackMessage({
    categories: [
      {
        category,
        result: {
          todaysUpdates: Array.from({ length: 50 }, (_, index) => ({
            ...topic,
            title: `${topic.title} ${index + 1}`,
            officialLink: `${topic.officialLink}-${index + 1}`,
          })),
        },
      },
    ],
    date: new Date("2026-06-26T00:00:00+09:00"),
    htmlUrl: "https://example.com/news/2026/06/26/",
  });
  const blockText = JSON.stringify(message.blocks);

  assert.equal(blockText.includes("Long update 5"), true);
  assert.equal(blockText.includes("Long update 6"), false);
});
