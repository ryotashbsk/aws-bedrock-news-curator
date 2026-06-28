import type { CuratedCategoryResult, CuratedTopic, NewsCategory } from "./types.js";

const maxBlocksPerMessage = 45;
const maxTextLength = 2800;
const categoryDivider = "━━━━━━━━━━━━━━━━━━━━";

type SlackBlock =
  | {
      readonly type: "header";
      readonly text: SlackText;
    }
  | {
      readonly type: "section";
      readonly text: SlackText;
    }
  | {
      readonly type: "context";
      readonly elements: readonly SlackText[];
    }
  | {
      readonly type: "divider";
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

export function formatSlackMessages(category: NewsCategory, result: CuratedCategoryResult, date: Date): SlackMessage[] {
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${categoryDivider}\n*${category.title} - ${dateLabel}*`,
      },
    },
    ...formatTopicListBlocks(result.todaysUpdates),
  ];

  return chunkSlackBlocks(blocks).map((messageBlocks, index) => ({
    text: `${category.title} - ${dateLabel}${index > 0 ? ` (${index + 1})` : ""}`,
    blocks: messageBlocks,
  }));
}

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

function formatTopicListBlocks(topics: readonly CuratedTopic[]): SlackBlock[] {
  if (topics.length === 0) {
    return [
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "該当なし" }],
      },
    ];
  }

  return topics.flatMap((topic, index) => formatTopicBlocks(topic, index));
}

function formatTopicBlocks(topic: CuratedTopic, index: number): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(
          [
            `*${index + 1}. ${escapeSlackText(topic.title)}*`,
            escapeSlackText(topic.summary),
            `<${topic.officialLink}>`,
          ].join("\n"),
          maxTextLength,
        ),
      },
    },
  ];
}

function chunkSlackBlocks(blocks: readonly SlackBlock[]): SlackBlock[][] {
  const messages: SlackBlock[][] = [];
  let current: SlackBlock[] = [];
  for (const block of blocks) {
    if (current.length < maxBlocksPerMessage) {
      current.push(block);
      continue;
    }
    if (current.length > 0) {
      messages.push(current);
    }
    current = [block];
  }
  if (current.length > 0) {
    messages.push(current);
  }
  return messages;
}

function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
