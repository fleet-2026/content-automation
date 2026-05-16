"use client";

import { useState, useRef, useEffect } from "react";
import { Send, FileText, Eye, Newspaper } from "lucide-react";

type Message = {
  // Stable per-message id so streaming chunks key by id, not array index
  // (streaming-during-render with index keys misaligns DOM nodes).
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: string;
  citations?: { type: "post" | "competitor" | "news"; id: string; url?: string; snippet: string }[];
};

function newId() {
  // Cheap unique id; doesn't need to be cryptographic
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const SUGGESTIONS = [
  "What hooks performed best last month?",
  "Summarize the viral posts in my niche this week",
  "What topics are trending I haven't covered?",
  "Compare my engagement to my watched creators",
];

export function ChatUI() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(question: string) {
    if (!question.trim() || streaming) return;
    const userMsg: Message = { id: newId(), role: "user", content: question };
    const assistantId = newId();
    setMessages((cur) => [
      ...cur,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);

    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    function setError(msg: string) {
      setMessages((cur) =>
        cur.map((m) => (m.id === assistantId ? { ...m, error: msg } : m)),
      );
    }

    let res: Response;
    try {
      res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, question, history }),
      });
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
      setStreaming(false);
      return;
    }

    if (!res.ok || !res.body) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        detail = body?.message || body?.error || detail;
        if (res.status === 429 && body?.retryAfterSec) {
          detail = `Rate limit hit. Try again in ~${Math.ceil(body.retryAfterSec / 60)} min.`;
        }
      } catch {
        const txt = await res.text().catch(() => "");
        if (txt) detail = txt.slice(0, 200);
      }
      setError(detail);
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "delta") {
            setMessages((cur) =>
              cur.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + evt.data } : m,
              ),
            );
          } else if (evt.type === "citations") {
            setMessages((cur) =>
              cur.map((m) =>
                m.id === assistantId ? { ...m, citations: evt.data } : m,
              ),
            );
          } else if (evt.type === "error") {
            setError(evt.error || "Stream error");
          } else if (evt.type === "done") {
            if (evt.threadId) setThreadId(evt.threadId);
          }
        } catch {
          /* ignore malformed line */
        }
      }
    }
    setStreaming(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-2">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto pt-12">
            <h2 className="text-xl font-semibold mb-2">Ask anything about your data.</h2>
            <p className="text-[var(--color-muted)] text-sm mb-6">
              Answers cite the underlying posts, competitor videos, and news.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border bg-[var(--color-surface)] hover:border-[var(--color-muted)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto space-y-6 py-6">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-[var(--color-border)] px-4 py-3"
      >
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={streaming ? "thinking…" : "Ask a question"}
            disabled={streaming}
            aria-label="Ask a question"
            className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-[var(--color-accent)] text-black disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-[var(--color-accent)] text-black text-sm">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed">
        {message.content}
        {!message.content && !message.error && (
          <span className="text-[var(--color-muted)]">…</span>
        )}
      </div>
      {message.error && (
        <div className="mt-2 bg-red-100 border border-red-300 text-red-900 text-xs rounded-md p-2.5">
          <span className="font-semibold">Error:</span> {message.error}
        </div>
      )}
      {message.citations && message.citations.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {message.citations.slice(0, 6).map((c, i) => (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2 rounded-lg border bg-[var(--color-surface)] hover:border-[var(--color-muted)] text-xs"
            >
              <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
                {c.type === "post" && <FileText className="w-3 h-3" />}
                {c.type === "competitor" && <Eye className="w-3 h-3" />}
                {c.type === "news" && <Newspaper className="w-3 h-3" />}
                <span>{c.type}</span>
              </div>
              <div className="line-clamp-2 mt-0.5">{c.snippet}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
