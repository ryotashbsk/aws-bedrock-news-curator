import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatTokyoDateParts } from "../shared/date.js";
import type { CuratedCategoryNews, CuratedTopic } from "../shared/types.js";

type NewsHtmlCategory = {
  readonly title: string;
  readonly topics: readonly CuratedTopic[];
};

const templatePath = join(process.cwd(), "templates/news.html");
const newsTemplate = readFileSync(templatePath, "utf8");

/** カテゴリ別ニュースを日次公開ページ用 HTML へ変換 */
export function formatNewsHtml(input: {
  readonly categories: readonly CuratedCategoryNews[];
  readonly date: Date;
}): string {
  const { dateLabel } = formatTokyoDateParts(input.date);
  const categories = input.categories.map((categoryNews) => ({
    title: categoryNews.category.title,
    topics: categoryNews.result.todaysUpdates,
  }));
  const topicCount = categories.reduce((count, category) => count + category.topics.length, 0);
  const pageTitle = `🚀 本日のTechニュース - ${dateLabel}`;
  const description = `🚀 本日のTechニュース。フロントエンド、バックエンド、AIの公式一次情報を${topicCount}件掲載。`;

  return renderTemplate(newsTemplate, {
    pageTitle: escapeHtml(pageTitle),
    description: escapeAttribute(description),
    dateLabel: escapeHtml(dateLabel),
    categorySections: categories.map(renderCategorySection).join("\n"),
  });
}

function renderCategorySection(category: NewsHtmlCategory): string {
  return [
    '<section class="category">',
    `<h2>${escapeHtml(category.title)}</h2>`,
    category.topics.length === 0
      ? '<p class="empty">該当なし</p>'
      : `<ol class="topicList">${category.topics.map(renderTopicItem).join("\n")}</ol>`,
    "</section>",
  ].join("\n");
}

function renderTopicItem(topic: CuratedTopic): string {
  return [
    '<li class="topic">',
    `<h3><a href="${escapeAttribute(topic.officialLink)}" rel="noopener noreferrer">${escapeHtml(topic.title)}</a></h3>`,
    `<p class="summary">${escapeHtml(topic.summary)}</p>`,
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

/** HTML テンプレートの単純なプレースホルダー置換 */
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9]+)\}\}/g, (match, key: string) => {
    return values[key] ?? match;
  });
}
