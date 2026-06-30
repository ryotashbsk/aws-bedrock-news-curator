import type { CandidateTopic, NewsSource } from "../shared/types.js";
import { isSameTokyoDate } from "../shared/date.js";
import { normalizeUrl } from "../shared/url.js";

const maxExcerptLength = 900;
const maxTopicsPerSource = 8;
const fetchTimeoutMs = 10_000;

/** 複数ニュースソースから候補トピックを取得。失敗したソースはスキップ。 */
export async function fetchCandidateTopics(
  sources: readonly NewsSource[],
  referenceDate: Date = new Date(),
): Promise<CandidateTopic[]> {
  const results = await Promise.allSettled(sources.map((source) => fetchSourceTopics(source, referenceDate)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function fetchSourceTopics(source: NewsSource, referenceDate: Date): Promise<CandidateTopic[]> {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(fetchTimeoutMs),
    headers: {
      "user-agent": "aws-bedrock-news-curator/0.1 (+https://aws.amazon.com/bedrock/)",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`failed to fetch ${source.name}: ${response.status}`);
  }

  const body = await response.text();
  return parseFeed(body, source, referenceDate);
}

/** RSS / Atom の item / entry から候補トピックを抽出。 */
export function parseFeed(body: string, source: NewsSource, referenceDate: Date = new Date()): CandidateTopic[] {
  const itemBlocks = extractBlocks(body, "item").concat(extractBlocks(body, "entry"));
  return itemBlocks
    .flatMap((block) => {
      const title = decodeEntities(stripTags(readTag(block, "title")));
      const link = readTag(block, "link") || readAtomLink(block);
      const publishedAt = readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated");
      const excerpt = decodeEntities(
        stripTags(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content")),
      );

      if (!title || !link || !isPublishedToday(publishedAt, referenceDate)) {
        return [];
      }

      return [
        {
          title,
          url: normalizeUrl(link),
          sourceName: source.name,
          excerpt: truncate(excerpt || title, maxExcerptLength),
          ...(publishedAt ? { publishedAt } : {}),
        },
      ];
    })
    .slice(0, maxTopicsPerSource);
}

/** XML ソースから指定タグの本文ブロック一覧を抽出。 */
function extractBlocks(body: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return Array.from(body.matchAll(pattern), (match) => match[1] ?? "");
}

function readTag(block: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return block.match(pattern)?.[1]?.trim() ?? "";
}

function readAtomLink(block: string): string {
  return block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]?.trim() ?? "";
}

function stripTags(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function isPublishedToday(publishedAt: string, referenceDate: Date): boolean {
  const publishedDate = new Date(publishedAt);
  return !Number.isNaN(publishedDate.getTime()) && isSameTokyoDate(publishedDate, referenceDate);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
