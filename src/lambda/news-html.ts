import { formatTokyoDateParts } from "./date.js";
import type { CuratedCategoryNews, CuratedTopic } from "./types.js";

export function formatNewsHtml(input: {
  readonly categories: readonly CuratedCategoryNews[];
  readonly date: Date;
}): string {
  const { dateLabel } = formatTokyoDateParts(input.date);
  const topicCount = input.categories.reduce(
    (count, categoryNews) => count + categoryNews.result.todaysUpdates.length,
    0,
  );

  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(`📰本日のTechニュース - ${dateLabel}`)}</title>`,
    `<meta name="description" content="${escapeAttribute(
      `📰本日のTechニュース。フロントエンド、バックエンド、AIの公式一次情報を${topicCount}件掲載。`,
    )}">`,
    "<style>",
    css,
    "</style>",
    "</head>",
    "<body>",
    '<main class="page">',
    '<header class="pageHeader">',
    `<p class="eyebrow">${escapeHtml(dateLabel)}</p>`,
    "<h1>📰本日のTechニュース</h1>",
    `<p class="lead">公式一次情報から選別した更新をカテゴリ別に掲載。</p>`,
    "</header>",
    input.categories.map(formatCategorySection).join("\n"),
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function formatCategorySection(categoryNews: CuratedCategoryNews): string {
  const topics = categoryNews.result.todaysUpdates;
  return [
    '<section class="category">',
    `<h2>${escapeHtml(categoryNews.category.title)}</h2>`,
    topics.length === 0
      ? '<p class="empty">該当なし</p>'
      : `<ol class="topicList">${topics.map(formatTopicItem).join("\n")}</ol>`,
    "</section>",
  ].join("\n");
}

function formatTopicItem(topic: CuratedTopic): string {
  return [
    '<li class="topic">',
    `<h3><a href="${escapeAttribute(topic.officialLink)}" rel="noopener noreferrer">${escapeHtml(topic.title)}</a></h3>`,
    '<dl class="details">',
    `<div><dt>要点</dt><dd>${escapeHtml(topic.summary)}</dd></div>`,
    `<div><dt>影響</dt><dd>${escapeHtml(topic.impact)}</dd></div>`,
    `<div><dt>確認</dt><dd>${escapeHtml(topic.checkPoint)}</dd></div>`,
    "</dl>",
    "</li>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, " ");
}

const css = `
:root {
  color-scheme: light;
  --background: #f7f7f4;
  --surface: #ffffff;
  --text: #222222;
  --muted: #626262;
  --line: #d9d9d2;
  --accent: #0b6bcb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  line-height: 1.7;
}

a {
  color: var(--accent);
  text-underline-offset: 0.18em;
}

a:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

.page {
  width: min(100% - 32px, 960px);
  margin: 0 auto;
  padding: clamp(32px, 7vw, 72px) 0;
}

.pageHeader {
  margin-bottom: 40px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 0.95rem;
  font-weight: 700;
}

h1,
h2,
h3,
p {
  overflow-wrap: anywhere;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.15;
}

.lead {
  margin: 14px 0 0;
  color: var(--muted);
}

.category {
  padding: 32px 0;
  border-top: 1px solid var(--line);
}

.category h2 {
  margin: 0 0 18px;
  font-size: 1.45rem;
}

.topicList {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.topic {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: clamp(18px, 3vw, 24px);
}

.topic h3 {
  margin: 0 0 16px;
  font-size: 1.1rem;
  line-height: 1.45;
}

.details {
  display: grid;
  gap: 12px;
  margin: 0;
}

.details div {
  display: grid;
  grid-template-columns: 4.5em 1fr;
  gap: 12px;
}

dt {
  color: var(--muted);
  font-weight: 700;
}

dd {
  margin: 0;
}

.empty {
  margin: 0;
  color: var(--muted);
}

@media (max-width: 640px) {
  .details div {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
`.trim();
