"use client";

import { useCallback, useEffect, useState } from "react";
import AgentCard, { type AgentCardProps } from "@/components/AgentCard";

const TICKERS = [
  "AAPL", "TSLA", "NVDA", "BTC-USD",
  "ETH-USD", "MSFT", "XOM", "GLD",
];

/* ── agent visual config ───────────────────────────────── */
interface AgentMeta {
  name: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  weightLabel: string;
  prefix: string;                      // reasoning line prefix
}

const AGENTS: AgentMeta[] = [
  { name: "Sentiment Agent",      initials: "SE", avatarBg: "#2563eb", avatarColor: "#fff", weightLabel: "w 22%", prefix: "SentimentAgent" },
  { name: "Technical Agent",      initials: "TE", avatarBg: "#7c3aed", avatarColor: "#fff", weightLabel: "w 15%", prefix: "TechnicalAgent" },
  { name: "Fundamental Agent",    initials: "FU", avatarBg: "#0891b2", avatarColor: "#fff", weightLabel: "w 18%", prefix: "FundamentalAgent" },
  { name: "Macro Agent",          initials: "MA", avatarBg: "#ea580c", avatarColor: "#fff", weightLabel: "w 8%",  prefix: "MacroAgent" },
  { name: "Momentum Agent",       initials: "MO", avatarBg: "#16a34a", avatarColor: "#fff", weightLabel: "w 12%", prefix: "MomentumAgent" },
  { name: "Mean Reversion Agent", initials: "MR", avatarBg: "#d946ef", avatarColor: "#fff", weightLabel: "w 6%",  prefix: "MeanReversionAgent" },
  { name: "ML Prediction Agent",  initials: "ML", avatarBg: "#eab308", avatarColor: "#000", weightLabel: "w 11%", prefix: "MLAgent" },
  { name: "Research Agent",       initials: "RE", avatarBg: "#64748b", avatarColor: "#fff", weightLabel: "context", prefix: "ResearchAgent" },
  { name: "Risk Agent",           initials: "RI", avatarBg: "#dc2626", avatarColor: "#fff", weightLabel: "gate",   prefix: "RiskAgent" },
];

/* ── helpers ───────────────────────────────────────────── */

function extractVote(line: string): "BUY" | "SELL" | "HOLD" {
  if (/\bBUY\b/.test(line)) return "BUY";
  if (/\bSELL\b/.test(line)) return "SELL";
  return "HOLD";
}

function extractConfidence(line: string): number | undefined {
  const m = line.match(/\((\d+)%\)/);
  return m ? parseInt(m[1]) / 100 : undefined;
}

function extractKV(line: string, key: string): string | undefined {
  const re = new RegExp(`${key}=([^,|)\\s]+)`);
  const m = line.match(re);
  return m ? m[1] : undefined;
}

/* ── per-agent detail extractors ───────────────────────── */

function parseSentiment(
  line: string,
  stats: ApiStats | null,
): Record<string, string | number> {
  const d: Record<string, string | number> = {};
  d["Positive"] = stats?.positive ?? extractKV(line, "'positive'") ?? "—";
  d["Negative"] = stats?.negative ?? extractKV(line, "'negative'") ?? "—";
  d["Neutral"] = stats?.neutral ?? extractKV(line, "'neutral'") ?? "—";
  const ws = stats?.weighted_score;
  const score = extractKV(line, "score");
  d["Weighted Score"] = ws != null ? ws : score ?? "—";
  return d;
}

function parseTechnical(line: string): Record<string, string | number> {
  return {
    RSI: extractKV(line, "RSI") ?? "—",
    MACD: extractKV(line, "MACD_hist") ?? "—",
    Bollinger: extractKV(line, "BB") ?? "—",
    "MA Cross": extractKV(line, "trend") ?? "—",
  };
}

function parseFundamental(line: string): Record<string, string | number> {
  return {
    "P/E": extractKV(line, "P/E") ?? "—",
    PEG: extractKV(line, "PEG") ?? "—",
    ROE: extractKV(line, "ROE") ?? "—",
    "Upside %": extractKV(line, "upside") ?? extractKV(line, "growth") ?? "—",
  };
}

function parseMacro(line: string): Record<string, string | number> {
  const direction = extractKV(line, "direction") ?? "—";
  const magnitude = extractKV(line, "magnitude") ?? "—";
  // causal chain: everything after "MacroAgent: " up to " (magnitude"
  const chainMatch = line.match(/MacroAgent:\s*(.+?)\s*\(magnitude/);
  const chain = chainMatch ? chainMatch[1] : "—";
  return { Direction: direction, Magnitude: magnitude, "Causal Chain": chain };
}

function parseMomentum(line: string): Record<string, string | number> {
  return {
    "3M Return": extractKV(line, "mom3m") ?? "—",
    "6M Return": extractKV(line, "mom6m") ?? "—",
    "Rel. Strength": extractKV(line, "RS") ?? "—",
    Trend: extractKV(line, "trend") ?? "—",
  };
}

function parseMeanReversion(line: string): Record<string, string | number> {
  return {
    "Z-Score": extractKV(line, "z") ?? "—",
    "Bollinger %B": extractKV(line, "%B") ?? "—",
    "Half-life": extractKV(line, "half_life") ?? "—",
    Divergence: extractKV(line, "div") ?? "—",
  };
}

function parseML(line: string): Record<string, string | number> {
  return {
    Accuracy: extractKV(line, "acc") ?? "—",
    "P(up)": extractKV(line, "prob_up") ?? "—",
    "Model Age": extractKV(line, "age") ?? "—",
    Type: "XGBoost",
  };
}

function parseResearch(line: string): Record<string, string | number> {
  const countMatch = line.match(/trovati\s+(\d+)/);
  const queryMatch = line.match(/query='([^']+)'/);
  return {
    "Similar Found": countMatch ? parseInt(countMatch[1]) : "—",
    Context: queryMatch ? queryMatch[1].slice(0, 40) + "…" : "—",
  };
}

function parseRisk(line: string): Record<string, string | number> {
  const level = line.match(/→\s*(HIGH|MEDIUM|LOW)/)?.[1] ?? "—";
  return {
    "Risk Level": level,
    Volatility: extractKV(line, "volatility") ?? "—",
    Drawdown: extractKV(line, "drawdown") ?? "—",
  };
}

/* ── types ─────────────────────────────────────────────── */
interface ApiStats {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  weighted_score: number;
  articles_with_embedding: number;
}

interface ApiData {
  ticker: string;
  signal: {
    signal: string;
    confidence: number;
    created_at: string;
    reasoning: string[];
  } | null;
  stats: ApiStats;
}

/* ── build cards from API data ─────────────────────────── */
function buildCards(data: ApiData): AgentCardProps[] {
  const reasoning = data.signal?.reasoning ?? [];

  const parsers: Record<string, (line: string, stats: ApiStats | null) => Record<string, string | number>> = {
    SentimentAgent: parseSentiment,
    TechnicalAgent: (l) => parseTechnical(l),
    FundamentalAgent: (l) => parseFundamental(l),
    MacroAgent: (l) => parseMacro(l),
    MomentumAgent: (l) => parseMomentum(l),
    MeanReversionAgent: (l) => parseMeanReversion(l),
    MLAgent: (l) => parseML(l),
    ResearchAgent: (l) => parseResearch(l),
    RiskAgent: (l) => parseRisk(l),
  };

  return AGENTS.map((agent) => {
    const line = reasoning.find((r) => r.startsWith(agent.prefix + ":")) ?? "";

    const details = line
      ? parsers[agent.prefix](line, data.stats)
      : {};

    // Research and Risk don't have a BUY/SELL vote
    let vote = extractVote(line);
    if (agent.prefix === "RiskAgent") {
      const level = line.match(/→\s*(HIGH|MEDIUM|LOW)/)?.[1];
      vote = level === "HIGH" ? "SELL" : level === "LOW" ? "BUY" : "HOLD";
    }
    if (agent.prefix === "ResearchAgent") {
      vote = "HOLD";
    }

    return {
      name: agent.name,
      initials: agent.initials,
      avatarBg: agent.avatarBg,
      avatarColor: agent.avatarColor,
      weightLabel: agent.weightLabel,
      vote,
      confidence: extractConfidence(line),
      details,
      reasoning: line ? [line] : [],
    };
  });
}

/* ── page ──────────────────────────────────────────────── */
export default function AgentsPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents-debug?ticker=${t}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(ticker);
  }, [ticker, fetchData]);

  const cards = data ? buildCards(data) : [];
  const overall = data?.signal;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Agent Monitor</h1>
        <div className="flex gap-1.5 flex-wrap">
          {TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => setTicker(t)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                ticker === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Overall signal banner */}
      {overall && (
        <div
          className={`rounded-xl border px-5 py-4 flex items-center justify-between flex-wrap gap-3 ${
            overall.signal === "BUY"
              ? "bg-emerald-500/10 border-emerald-500/30"
              : overall.signal === "SELL"
                ? "bg-red-500/10 border-red-500/30"
                : "bg-zinc-500/10 border-zinc-500/30"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`text-lg font-bold ${
                overall.signal === "BUY"
                  ? "text-emerald-400"
                  : overall.signal === "SELL"
                    ? "text-red-400"
                    : "text-zinc-400"
              }`}
            >
              {overall.signal}
            </span>
            <span className="text-sm text-muted-foreground">{ticker}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Confidence{" "}
              <span className="font-mono font-medium text-foreground">
                {Math.round(overall.confidence * 100)}%
              </span>
            </span>
            <span>
              Updated{" "}
              <span className="font-mono text-foreground">
                {new Date(overall.created_at).toLocaleString()}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-6">
              <div className="h-28 rounded-lg bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-red-400 text-sm font-medium">Errore</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {/* Agent cards grid */}
      {!loading && !error && cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <AgentCard key={card.initials} {...card} />
          ))}
        </div>
      )}

      {/* No signal */}
      {!loading && !error && data && !data.signal && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Nessun segnale disponibile per <span className="font-mono font-medium">{ticker}</span>
          </p>
        </div>
      )}
    </div>
  );
}
