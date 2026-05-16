/**
 * Lightweight Tavily REST wrapper. Free tier: 1,000 searches/month.
 * Docs: https://docs.tavily.com
 */
export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
  score?: number;
  publishedDate?: string;
};

export async function tavilySearch(input: {
  query: string;
  searchDepth?: "basic" | "advanced";
  maxResults?: number;
  topic?: "general" | "news";
  days?: number;
  includeAnswer?: boolean;
  includeRawContent?: boolean;
}): Promise<{ answer?: string; results: TavilyResult[] }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: input.query,
      search_depth: input.searchDepth ?? "basic",
      max_results: input.maxResults ?? 8,
      topic: input.topic ?? "news",
      days: input.days ?? 7,
      include_answer: input.includeAnswer ?? false,
      include_raw_content: input.includeRawContent ?? false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    answer?: string;
    results?: {
      title: string;
      url: string;
      content: string;
      raw_content?: string;
      score?: number;
      published_date?: string;
    }[];
  };
  return {
    answer: json.answer,
    results: (json.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      rawContent: r.raw_content,
      score: r.score,
      publishedDate: r.published_date,
    })),
  };
}
