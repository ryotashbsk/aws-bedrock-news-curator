import assert from "node:assert/strict";
import test from "node:test";
import { parseCuratedResult } from "../src/lambda/bedrock-curator.js";

void test("parseCuratedResult extracts JSON from fenced response", () => {
  const result = parseCuratedResult(`\`\`\`json
{
  "todaysUpdates": [
    {
      "title": "Model update",
      "summary": "Summary",
      "impact": "Impact",
      "checkPoint": "Check point",
      "officialLink": "https://example.com/update"
    }
  ]
}
\`\`\``);

  assert.equal(result.todaysUpdates.length, 1);
  assert.equal(result.todaysUpdates[0]?.officialLink, "https://example.com/update");
  assert.equal(result.todaysUpdates[0]?.impact, "Impact");
  assert.equal(result.todaysUpdates[0]?.checkPoint, "Check point");
});

void test("parseCuratedResult rejects missing arrays", () => {
  assert.throws(() => parseCuratedResult("{}"), /todaysUpdates/);
});
