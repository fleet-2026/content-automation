import { requireUser } from "@/lib/auth-helpers";
import { chatStream } from "@/lib/ai/chat-agent";
import { prisma } from "@/lib/db";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_QUESTION_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 30;
const MAX_HISTORY_CHARS = 16_000;

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return new Response("unauthenticated", { status: 401 });
  }

  // Rate limit before parsing body (cheap path).
  const rl = await rateLimit(`chat:${userId}`, RATE_LIMITS.CHAT);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfterSec: rl.retryAfterSec }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        threadId?: string;
        question: string;
        history?: { role: "user" | "assistant"; content: string }[];
      }
    | null;
  if (!body) return new Response("invalid json", { status: 400 });

  // Validate inputs — cap size so attackers can't run unbounded prompts on our budget.
  const question = body.question?.toString() ?? "";
  if (!question.trim()) return new Response("missing question", { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) {
    return new Response(
      `question too long (max ${MAX_QUESTION_CHARS} chars)`,
      { status: 413 },
    );
  }

  let history = body.history ?? [];
  if (!Array.isArray(history)) history = [];
  // Keep only last N, sanitize role + content shape.
  history = history
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-MAX_HISTORY_MESSAGES);
  // Cap total characters across history.
  let total = 0;
  history = history
    .reverse()
    .filter((m) => {
      total += m.content.length;
      return total <= MAX_HISTORY_CHARS;
    })
    .reverse();

  let threadId = body.threadId;
  if (!threadId) {
    const t = await prisma.chatThread.create({
      data: { userId, title: question.slice(0, 80) },
    });
    threadId = t.id;
  } else {
    // Verify thread ownership before appending messages.
    const owned = await prisma.chatThread.findFirst({
      where: { id: threadId, userId },
      select: { id: true },
    });
    if (!owned) return new Response("forbidden", { status: 403 });
  }
  await prisma.chatMessage.create({
    data: { threadId, role: "user", content: question },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      let citations: unknown = [];
      try {
        for await (const event of chatStream({
          userId,
          question,
          history,
        })) {
          if (event.type === "citations") {
            citations = event.data;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "citations", data: event.data })}\n\n`),
            );
          } else if (event.type === "delta") {
            assistantText += event.data as string;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "delta", data: event.data })}\n\n`),
            );
          }
        }
        await prisma.chatMessage.create({
          data: {
            threadId: threadId!,
            role: "assistant",
            content: assistantText,
            citations: citations as object,
          },
        });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", threadId })}\n\n`),
        );
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: String((e as Error).message ?? e) })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
