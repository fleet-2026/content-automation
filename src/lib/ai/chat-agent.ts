import { anthropic, MODELS, assertAnthropicConfigured } from "./claude";
import { ragRetrieve, type RagChunk } from "@/lib/rag";

export type ChatCitation = {
  type: "post" | "competitor" | "news";
  id: string;
  url?: string;
  snippet: string;
  score: number;
};

export async function* chatStream(input: {
  userId: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): AsyncGenerator<{ type: "delta" | "citations" | "done"; data: unknown }> {
  assertAnthropicConfigured();
  const chunks = await ragRetrieve({ userId: input.userId, query: input.question, k: 10 });

  const citations: ChatCitation[] = chunks.map((c) => ({
    type: c.source,
    id: c.id,
    url: (c.meta.url as string | undefined) ?? undefined,
    snippet: c.text.slice(0, 280),
    score: c.score,
  }));

  yield { type: "citations", data: citations };

  const context = formatContext(chunks);
  const system = `You are the user's content intelligence analyst. You have access to:
- Their own posts and transcripts
- Posts and transcripts from creators they watch
- Recent niche news

Answer based ONLY on the CONTEXT below. If the context doesn't contain the answer, say so plainly. Cite sources inline as [post:id], [competitor:id], or [news:id].`;

  const stream = await anthropic.messages.stream({
    model: MODELS.default,
    max_tokens: 1500,
    system,
    messages: [
      ...(input.history ?? []),
      {
        role: "user",
        content: `CONTEXT:\n${context}\n\n---\n\nQUESTION: ${input.question}`,
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "delta", data: event.delta.text };
    }
  }

  yield { type: "done", data: null };
}

function formatContext(chunks: RagChunk[]): string {
  return chunks
    .map((c, i) => {
      const tag = `[${c.source}:${c.id}]`;
      const meta = c.source === "competitor"
        ? `from @${c.meta.handle ?? "?"}`
        : c.source === "news"
          ? `news`
          : `your post`;
      return `${i + 1}. ${tag} (${meta}, similarity ${c.score.toFixed(2)})\n${c.text}`;
    })
    .join("\n\n");
}
