export type SourceType = "rss" | "html";

export type NewsCategory = {
  readonly id: string;
  readonly title: string;
  readonly agentPromptPath: string;
  readonly sources: readonly NewsSource[];
};

export type NewsSource = {
  readonly name: string;
  readonly url: string;
  readonly type: SourceType;
};

export type NewsConfig = {
  readonly categories: readonly NewsCategory[];
};

export type CandidateTopic = {
  readonly title: string;
  readonly url: string;
  readonly sourceName: string;
  readonly sourceType: SourceType;
  readonly excerpt: string;
  readonly publishedAt?: string;
};

export type CuratedTopic = {
  readonly title: string;
  readonly summary: string;
  readonly impact: string;
  readonly checkPoint: string;
  readonly officialLink: string;
};

export type CuratedCategoryResult = {
  readonly todaysUpdates: readonly CuratedTopic[];
};

export type CuratedCategoryNews = {
  readonly category: NewsCategory;
  readonly result: CuratedCategoryResult;
};
