import { formatTokyoDateParts } from "../shared/date.js";
import type { CuratedCategoryNews } from "../shared/types.js";

const categoryDivider = "━━━━━━━━━━━━━━━━━━━━";
const maxHeadlineCount = 5;

type SlackBlock = {
  readonly type: "section";
  readonly text: SlackText;
};

type SlackText = {
  readonly type: "mrkdwn" | "plain_text";
  readonly text: string;
  readonly emoji?: boolean;
};

export type SlackMessage = {
  readonly text: string;
  readonly blocks: readonly SlackBlock[];
};

/** 日次ニュース一覧へのリンクを含む Slack 投稿メッセージ生成 */
export function formatDailySlackMessage(input: {
  readonly categories: readonly CuratedCategoryNews[];
  readonly date: Date;
  readonly htmlUrl: string;
}): SlackMessage {
  const { dateLabel } = formatTokyoDateParts(input.date);
  const headlineLines = selectHeadlineTitles(input.categories).map((title) => `・${escapeSlackText(title)}`);
  const headlineText = headlineLines.length > 0 ? headlineLines.join("\n") : "・該当なし";
  const text = [
    categoryDivider,
    `🚀 本日のTechニュース - ${dateLabel}`,
    categoryDivider,
    "■ 注目のトピックス：",
    headlineText,
    "",
    "■ 本日のニュース一覧：",
    input.htmlUrl,
  ].join("\n");

  return {
    text: `🚀 本日のTechニュース - ${dateLabel}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
    ],
  };
}

/** Slack Incoming Webhook へのメッセージ送信 */
export async function postSlackMessages(webhookUrl: string, messages: readonly SlackMessage[]): Promise<void> {
  for (const message of messages) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Slack post failed: ${response.status} ${responseText}`);
    }
  }
}

function selectHeadlineTitles(categories: readonly CuratedCategoryNews[]): string[] {
  return categories
    .flatMap((categoryNews) => categoryNews.result.todaysUpdates.map((topic) => topic.title))
    .slice(0, maxHeadlineCount);
}

function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
