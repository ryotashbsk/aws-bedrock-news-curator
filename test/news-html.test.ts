import assert from "node:assert/strict";
import test from "node:test";
import { formatNewsHtml } from "../src/lambda/output/news-html.js";
import type { CuratedCategoryNews, CuratedTopic, NewsCategory } from "../src/lambda/shared/types.js";

const category: NewsCategory = {
  id: "frontend",
  title: "フロントエンドニュース",
  agentPromptPath: "agents/frontend-news.md",
  sources: [],
};

const topic: CuratedTopic = {
  title: "React <Update>",
  summary: "詳しめの要約 & 背景",
  officialLink: "https://example.com/news?a=1&b=2",
};

void test("formatNewsHtml creates one page for all categories and escapes content", () => {
  const categories: CuratedCategoryNews[] = [
    {
      category,
      result: { todaysUpdates: [topic] },
    },
    {
      category: { ...category, id: "ai", title: "AIニュース" },
      result: { todaysUpdates: [] },
    },
  ];

  const html = formatNewsHtml({ categories, date: new Date("2026-06-26T00:00:00+09:00") });

  assert.equal(html.includes('<html lang="ja">'), true);
  assert.equal(html.includes("🚀 本日のTechニュース - 2026/06/26(金)"), true);
  assert.equal(html.includes("フロントエンドニュース"), true);
  assert.equal(html.includes("AIニュース"), true);
  assert.equal(html.includes("React &lt;Update&gt;"), true);
  assert.equal(html.includes("詳しめの要約 &amp; 背景"), true);
  assert.equal(html.includes("<dt>要点</dt>"), false);
  assert.equal(html.includes("<dt>影響</dt>"), false);
  assert.equal(html.includes("<dt>確認</dt>"), false);
  assert.equal(html.includes("https://example.com/news?a=1&amp;b=2"), true);
  assert.equal(html.includes("該当なし"), true);
});
