"use client";

import * as React from "react";
import { Bot, ChevronDown, ChevronUp, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ToolLogEntry {
  name: string;
  input: unknown;
  result: unknown;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolLog?: ToolLogEntry[];
}

const SUGGESTIONS = [
  "How much did I spend on dining this month?",
  "Compare this month to last month",
  "What's my mortgage balance?",
  "Any unusual charges recently?",
];

export function FinanceChat({ configured }: { configured: boolean }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Something went wrong." }]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply, toolLog: data.toolLog }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Couldn't reach the AI — check your connection and try again." }]);
    } finally {
      setSending(false);
    }
  }

  if (!configured) {
    return (
      <p className="text-muted-foreground text-sm">
        Add <code className="bg-muted rounded px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> to your{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">.env</code> file and restart the app to use this feature.
      </p>
    );
  }

  return (
    <div className="flex h-[70vh] flex-col gap-3">
      <div ref={scrollRef} className="border-border/60 flex-1 overflow-y-auto rounded-md border p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Bot className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">Ask a question about your spending or mortgage.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} />
          ))}
          {sending && (
            <div className="flex items-center gap-2">
              <Bot className="text-muted-foreground size-4" />
              <span className="text-muted-foreground text-xs">Thinking…</span>
            </div>
          )}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your finances…" disabled={sending} />
        <Button type="submit" disabled={sending || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const [showLog, setShowLog] = React.useState(false);
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      {isUser ? (
        <User className="text-muted-foreground mt-1 size-4 shrink-0" />
      ) : (
        <Bot className="text-muted-foreground mt-1 size-4 shrink-0" />
      )}
      <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", isUser ? "bg-primary text-primary-foreground" : "bg-muted")}>
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.toolLog && message.toolLog.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              {showLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              Numbers used ({message.toolLog.length})
            </button>
            {showLog && (
              <div className="border-border/60 mt-2 flex flex-col gap-2 border-t pt-2">
                {message.toolLog.map((t, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium">{humanizeToolName(t.name)}</span>
                    <pre className="bg-background/50 mt-1 overflow-x-auto rounded p-2 text-[11px]">{JSON.stringify(t.result, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function humanizeToolName(name: string): string {
  return name.replace(/_/g, " ");
}
