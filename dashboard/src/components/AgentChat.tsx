"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ChatMessage {
  id: string;
  agent: string;
  abbr: string;
  avatarBg: string;
  avatarColor: string;
  text: string;
  timestamp: string;
  signal?: string;
  confidence?: number;
  isFinal?: boolean;
}

interface AgentChatProps {
  ticker: string;
  onSignalReady?: (signal: string, confidence: number) => void;
}

const AGENTS: Record<string, { abbr: string; bg: string; color: string }> = {
  ScraperAgent:     { abbr: "SC", bg: "#E1F5EE", color: "#085041" },
  SentimentAgent:   { abbr: "SE", bg: "#EEEDFE", color: "#3C3489" },
  ResearchAgent:    { abbr: "RE", bg: "#EEEDFE", color: "#3C3489" },
  RiskAgent:        { abbr: "RI", bg: "#FAEEDA", color: "#633806" },
  TechnicalAgent:   { abbr: "TE", bg: "#FAEEDA", color: "#633806" },
  FundamentalAgent: { abbr: "FU", bg: "#E1F5EE", color: "#085041" },
  MomentumAgent:    { abbr: "MO", bg: "#EEEDFE", color: "#3C3489" },
  MeanReversionAgent: { abbr: "MR", bg: "#EEEDFE", color: "#3C3489" },
  SocialAgent:      { abbr: "SO", bg: "#E1F5EE", color: "#085041" },
  MLAgent:          { abbr: "ML", bg: "#FAECE7", color: "#712B13" },
  MacroAgent:       { abbr: "MA", bg: "#FAECE7", color: "#712B13" },
  WeightedVote:     { abbr: "WV", bg: "#EAF3DE", color: "#27500A" },
  CriticAgent:      { abbr: "CR", bg: "#FCEBEB", color: "#791F1F" },
  Orchestrator:     { abbr: "OR", bg: "#F1EFE8", color: "#444441" },
  SignalAgent:      { abbr: "SI", bg: "#EAF3DE", color: "#27500A" },
};

function getAgentStyle(name: string) {
  for (const [key, val] of Object.entries(AGENTS)) {
    if (name.includes(key.replace("Agent", ""))) return val;
  }
  return AGENTS[name] ?? AGENTS.Orchestrator;
}

const signalBg = (s: string) =>
  s === "BUY" ? "bg-green-600" : s === "SELL" ? "bg-red-600" : "bg-gray-500";

export default function AgentChat({ ticker, onSignalReady }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Pronto");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const runAnalysis = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setMessages([]);
    setStatus("Connessione...");

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/agent-run?ticker=${ticker}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        setStatus("Errore connessione");
        setIsRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const style = getAgentStyle(data.agent);
            const msg: ChatMessage = {
              id: crypto.randomUUID(),
              agent: data.agent,
              abbr: style.abbr,
              avatarBg: style.bg,
              avatarColor: style.color,
              text: data.message,
              timestamp: new Date().toLocaleTimeString(),
              signal: data.signal,
              confidence: data.confidence,
              isFinal: data.isFinal,
            };
            setMessages((prev) => [...prev, msg]);
            setStatus(`${data.agent} completato`);

            if (data.isFinal && data.signal && onSignalReady) {
              onSignalReady(data.signal, data.confidence ?? 0);
            }
          } catch {
            /* skip malformed */
          }
        }
      }

      setStatus("Analisi completata");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("Interrotto");
      } else {
        setStatus("Errore");
      }
    } finally {
      setIsRunning(false);
    }
  }, [ticker, isRunning, onSignalReady]);

  // Auto-run when ticker changes
  useEffect(() => {
    setMessages([]);
    setStatus("Pronto");
  }, [ticker]);

  return (
    <div className="border rounded-lg flex flex-col h-[500px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isRunning ? "bg-green-500 live-dot" : "bg-gray-400"
            }`}
          />
          <span className="text-sm font-medium font-mono">
            trading-bot &middot; {ticker}
          </span>
        </div>
        <button
          onClick={runAnalysis}
          disabled={isRunning}
          className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
            isRunning
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Clicca &quot;Run&quot; per avviare l&apos;analisi di {ticker}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="agent-msg flex gap-2.5 items-start">
            {/* Avatar */}
            <div
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
              style={{ backgroundColor: msg.avatarBg, color: msg.avatarColor }}
            >
              {msg.abbr}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{msg.agent}</span>
                <span className="text-[10px] text-muted-foreground">
                  {msg.timestamp}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                {msg.text}
              </p>
              {/* Final signal card */}
              {msg.isFinal && msg.signal && (
                <div className="mt-2 p-2 rounded-md border bg-muted/40">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge className={signalBg(msg.signal)}>{msg.signal}</Badge>
                    <span className="text-xs font-mono font-semibold">
                      {Math.round((msg.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <Progress value={(msg.confidence ?? 0) * 100} className="h-1.5" />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isRunning && (
          <div className="flex gap-2.5 items-center pl-1">
            <div className="flex gap-1">
              <span className="typing-d1 w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-d2 w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-d3 w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            </div>
            <span className="text-[10px] text-muted-foreground">{status}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t text-[10px] text-muted-foreground bg-muted/20">
        {status}
      </div>
    </div>
  );
}
