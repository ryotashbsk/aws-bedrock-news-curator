import type { CuratedCategoryResult, CuratedTopic, NewsCategory } from "./types.js";

const maxBlocksPerMessage = 45;
const maxTextLength = 2800;

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
        text: "━━━━━━━━━━━━━━━━━━━━",
      },
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${category.title} - ${dateLabel}`,
        emoji: true,
      },
    },
    ...formatSectionBlocks("今日の最新情報", result.todaysUpdates),
    ...formatSectionBlocks("最近の重要アップデート（再掲）", result.recentImportantUpdates),
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

function formatSectionBlocks(title: string, topics: readonly CuratedTopic[]): SlackBlock[] {
  const sectionHeader: SlackBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title}*`,
    },
  };

  if (topics.length === 0) {
    return [
      sectionHeader,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "該当なし" }],
      },
      { type: "divider" },
    ];
  }

  const topicBlocks = topics.flatMap((topic, index) => formatTopicBlocks(topic, index));
  return [sectionHeader, ...topicBlocks, { type: "divider" }];
}

function formatTopicBlocks(topic: CuratedTopic, index: number): SlackBlock[] {
  const fields = [
    `*要約*\n${escapeSlackText(topic.summary)}`,
    `*変化点*\n${escapeSlackText(topic.changed)}`,
    `*エンジニア向け*\n${escapeSlackText(topic.engineerUse)}`,
    topic.nonEngineerUse ? `*非エンジニア向け*\n${escapeSlackText(topic.nonEngineerUse)}` : "",
    `*導入*\n${escapeSlackText(topic.adoption)}`,
    `*注意*\n${escapeSlackText(topic.cautions)}`,
  ].filter(Boolean);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${index + 1}. <${topic.officialLink}|${escapeSlackText(topic.title)}>*`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(fields.join("\n\n"), maxTextLength),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${topic.officialLink}|公式リンク>`,
        },
      ],
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
