import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: apiKey ?? "" });

// text-embedding-3-small @ 1536 dims is plenty for retrieval and ~5x cheaper
// than -large. Matches the vector(1536) column in our Prisma schema.
const MODEL = "text-embedding-3-small";

export async function embed(text: string): Promise<number[]> {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  const res = await openai.embeddings.create({
    model: MODEL,
    input: cleaned,
  });
  return res.data[0].embedding;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000));
  const res = await openai.embeddings.create({
    model: MODEL,
    input: cleaned,
  });
  return res.data.map((d) => d.embedding);
}

// Postgres pgvector wants a literal like "[0.1,0.2,...]"
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
