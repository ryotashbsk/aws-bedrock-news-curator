import assert from "node:assert/strict";
import test from "node:test";
import { parseFeed } from "../src/lambda/sources/source-fetcher.js";
import type { NewsSource } from "../src/lambda/shared/types.js";

const source: NewsSource = {
  name: "Example",
  url: "https://example.com/feed.xml",
};

void test("parseFeed keeps only items published today in JST", () => {
  const topics = parseFeed(
    `
    <rss><channel>
      <item>
        <title>Today in JST</title>
        <link>https://example.com/today</link>
        <pubDate>Tue, 30 Jun 2026 09:30:00 +0900</pubDate>
        <description>Today update</description>
      </item>
      <item>
        <title>Yesterday in JST</title>
        <link>https://example.com/yesterday</link>
        <pubDate>Mon, 29 Jun 2026 23:59:00 +0900</pubDate>
        <description>Old update</description>
      </item>
      <item>
        <title>No date</title>
        <link>https://example.com/no-date</link>
        <description>Undated update</description>
      </item>
    </channel></rss>
    `,
    source,
    new Date("2026-06-30T12:00:00+09:00"),
  );

  assert.deepEqual(
    topics.map((topic) => topic.title),
    ["Today in JST"],
  );
});

void test("parseFeed treats UTC timestamps by JST calendar date", () => {
  const topics = parseFeed(
    `
    <feed>
      <entry>
        <title>UTC but JST today</title>
        <link href="https://example.com/utc-today" />
        <updated>2026-06-29T15:30:00Z</updated>
        <summary>UTC timestamp crosses into JST today</summary>
      </entry>
      <entry>
        <title>UTC and JST yesterday</title>
        <link href="https://example.com/utc-yesterday" />
        <updated>2026-06-29T14:30:00Z</updated>
        <summary>Old update</summary>
      </entry>
    </feed>
    `,
    source,
    new Date("2026-06-30T12:00:00+09:00"),
  );

  assert.deepEqual(
    topics.map((topic) => topic.title),
    ["UTC but JST today"],
  );
});
