import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUrl } from "../src/lambda/shared/url.js";

void test("normalizeUrl removes fragments and tracking parameters", () => {
  assert.equal(
    normalizeUrl("https://example.com/post/?utm_source=x&ref=y&id=1#heading"),
    "https://example.com/post/?id=1",
  );
});

void test("normalizeUrl removes trailing slash", () => {
  assert.equal(normalizeUrl("https://example.com/post/"), "https://example.com/post");
});
