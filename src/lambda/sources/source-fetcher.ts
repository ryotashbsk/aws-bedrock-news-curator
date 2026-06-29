import type { CandidateTopic, NewsSource } from "../shared/types.js";
import { normalizeUrl } from "../shared/url.js";

const maxExcerptLength = 900;
const maxTopicsPerSource = 8;
const fetchTimeoutMs = 10_000;

/** 複数ニュースソースから候補トピックを取得。失敗したソースはスキップ。 */
export async function fetchCandidateTopics(sources: readonly NewsSource[]): Promise<CandidateTopic[]> {
  const results = await Promise.allSettled(sources.map(fetchSourceTopics));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function fetchSourceTopics(source: NewsSource): Promise<CandidateTopic[]> {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(fetchTimeoutMs),
    headers: {
      "user-agent": "aws-bedrock-news-curator/0.1 (+https://aws.amazon.com/bedrock/)",
      accept:
        source.type === "rss" ? "application/rss+xml, application/atom+xml, application/xml, text/xml" : "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`failed to fetch ${source.name}: ${response.status}`);
  }

  const body = await response.text();
  return source.type === "rss" ? parseFeed(body, source) : parseHtml(body, source);
}

/** RSS / Atom の item / entry から候補トピックを抽出。 */
export function parseFeed(body: string, source: NewsSource): CandidateTopic[] {
  const itemBlocks = extractBlocks(body, "item").concat(extractBlocks(body, "entry"));
  return itemBlocks.slice(0, maxTopicsPerSource).flatMap((block) => {
    const title = decodeEntities(stripTags(readTag(block, "title")));
    const link = readTag(block, "link") || readAtomLink(block);
    const publishedAt = readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated");
    const excerpt = decodeEntities(
      stripTags(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content")),
    );

    if (!title || !link) {
      return [];
    }

    return [
      {
        title,
        url: normalizeUrl(link),
        sourceName: source.name,
        sourceType: source.type,
        excerpt: truncate(excerpt || title, maxExcerptLength),
        ...(publishedAt ? { publishedAt } : {}),
      },
    ];
  });
}

/** HTML ページ内の同一ドメインリンクから候補トピックを抽出。 */
export function parseHtml(body: string, source: NewsSource): CandidateTopic[] {
  const anchors = Array.from(body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const topics: CandidateTopic[] = [];
  const seenUrls = new Set<string>();
  const baseUrl = new URL(source.url);

  for (const match of anchors) {
    const href = match[1];
    const label = decodeEntities(stripTags(match[2] ?? ""));
    if (!href || label.length < 8) {
      continue;
    }

    const url = normalizeUrl(new URL(href, baseUrl).toString());
    if (seenUrls.has(url) || shouldSkipHtmlLink(url, baseUrl)) {
      continue;
    }

    seenUrls.add(url);
    topics.push({
      title: label,
      url,
      sourceName: source.name,
      sourceType: source.type,
      excerpt: truncate(label, maxExcerptLength),
    });

    if (topics.length >= maxTopicsPerSource) {
      break;
    }
  }

  return topics;
}

/** HTML ソースから指定タグの本文ブロック一覧を抽出。 */
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

function shouldSkipHtmlLink(url: string, baseUrl: URL): boolean {
  const parsed = new URL(url);
  return parsed.hostname !== baseUrl.hostname || parsed.pathname === "/" || parsed.pathname === baseUrl.pathname;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
