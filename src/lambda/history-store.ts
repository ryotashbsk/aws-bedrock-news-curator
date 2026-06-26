import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CandidateTopic, CuratedTopic } from "./types.js";
import { normalizeUrl } from "./url.js";

export type HistoryStore = {
  readonly hasNotified: (categoryId: string, url: string) => Promise<boolean>;
  readonly markNotified: (categoryId: string, topic: CuratedTopic | CandidateTopic) => Promise<void>;
};

export function createDynamoHistoryStore(tableName: string): HistoryStore {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  return {
    async hasNotified(categoryId, url) {
      const result = await documentClient.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            category: categoryId,
            url: normalizeUrl(url),
          },
        }),
      );
      return result.Item !== undefined;
    },
    async markNotified(categoryId, topic) {
      await documentClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            category: categoryId,
            url: normalizeUrl("officialLink" in topic ? topic.officialLink : topic.url),
            title: topic.title,
            sourceType: "sourceType" in topic ? topic.sourceType : "bedrock",
            notifiedAt: new Date().toISOString(),
          },
        }),
      );
    },
  };
}
