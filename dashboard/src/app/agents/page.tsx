"use client";

import { useCallback, useEffect, useState } from "react";
import AgentCard, { type AgentCardProps } from "@/components/AgentCard";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TICKERS } from "@/lib/constants";

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
  { name: "Technical Agent",      initials: "TE", avatarBg: "#7c3aed", avatarColor: "#fff", weightLabel: "w 11%", prefix: "TechnicalAgent" },
  { name: "Fundamental Agent",    initials: "FU", avatarBg: "#0891b2", avatarColor: "#fff", weightLabel: "w 18%", prefix: "FundamentalAgent" },
  { name: "Liquidity Agent",      initials: "LI", avatarBg: "#E1F5EE", avatarColor: "#085041", weightLabel: "w 8%",  prefix: "LiquidityAgent" },
  { name: "Options Agent",        initials: "OP", avatarBg: "#FAEEDA", avatarColor: "#633806", weightLabel: "w 6%",  prefix: "OptionsAgent" },
  { name: "Macro Agent",          initials: "MA", avatarBg: "#ea580c", avatarColor: "#fff", weightLabel: "w 4%",  prefix: "MacroAgent" },
  { name: "Intermarket Agent",    initials: "IM", avatarBg: "#EEF2FF", avatarColor: "#3730A3", weightLabel: "w 4%",  prefix: "IntermarketAgent" },
  { name: "Momentum Agent",       initials: "MO", avatarBg: "#16a34a", avatarColor: "#fff", weightLabel: "w 12%", prefix: "MomentumAgent" },
  { name: "Mean Reversion Agent", initials: "MR", avatarBg: "#d946ef", avatarColor: "#fff", weightLabel: "w 2%",  prefix: "MeanReversionAgent" },
  { name: "Seasonal Agent",      initials: "SN", avatarBg: "#FEF3C7", avatarColor: "#92400E", weightLabel: "w 4%",  prefix: "SeasonalAgent" },
  { name: "Institutional Agent", initials: "IN", avatarBg: "#F0FDF4", avatarColor: "#14532D", weightLabel: "w 4%",  prefix: "InstitutionalAgent" },
  { name: "ML Prediction Agent",  initials: "ML", avatarBg: "#eab308", avatarColor: "#000", weightLabel: "w 11%", prefix: "MLAgent" },
  { name: "Research Agent",       initials: "RE", avatarBg: "#64748b", avatarColor: "#fff", weightLabel: "context", prefix: "ResearchAgent" },
  { name: "Risk Agent",           initials: "RI", avatarBg: "#dc2626", avatarColor: "#fff", weightLabel: "gate",   prefix: "RiskAgent" },
  { name: "Exit Strategy Agent",  initials: "ES", avatarBg: "#059669", avatarColor: "#fff", weightLabel: "exit",   prefix: "ExitStrategyAgent" },
  { name: "Meta-Labeling",        initials: "MC", avatarBg: "#7c3aed", avatarColor: "#fff", weightLabel: "calib.", prefix: "MetaLabeling" },
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

function parseMetaLabeling(line: string): Record<string, string | number> {
  // "MetaLabeling: 73% prob. success (confidence 65% → 47% calibrata)"
  const probMatch = line.match(/(\d+)%\s*prob\. success/);
  const confMatch = line.match(/confidence (\d+)%\s*.\s*(\d+)%/);
  if (probMatch) {
    return {
      "Prob. Success": `${probMatch[1]}%`,
      "Confidence": confMatch ? `${confMatch[1]}% → ${confMatch[2]}%` : "—",
      "Model": "XGBoost",
    };
  }
  return { "Status": "not trained", "Confidence": "unchanged", "Model": "XGBoost" };
}

function parseResearch(line: string): Record<string, string | number> {
  const countMatch = line.match(/(\d+)\s*paper\s*arXiv/i);
  const queryMatch = line.match(/query='([^']+)'/);
  return {
    "Paper arXiv": countMatch ? parseInt(countMatch[1]) : "—",
    Context: queryMatch ? queryMatch[1].slice(0, 40) + "…" : "—",
  };
}

function parseOptions(line: string, data: ApiData | null): Record<string, string | number> {
  const opt = data?.options;
  if (opt) {
    const pcVal = opt.pc_ratio;
    let pcLabel = "";
    if (pcVal != null) {
      pcLabel = pcVal < 0.5 ? " (bullish)" : pcVal > 1.5 ? " (bearish)" : " (neutral)";
    }
    return {
      "Put/Call Ratio": pcVal != null ? `${pcVal}${pcLabel}` : "—",
      "Max Pain": opt.max_pain != null
        ? `$${opt.max_pain}${opt.distance_to_max_pain ? ` (${opt.distance_to_max_pain})` : ""}`
        : "—",
      "Avg IV": opt.avg_iv != null ? `${opt.avg_iv}%` : "—",
    };
  }
  // Fallback: parse from reasoning line
  const pcRatio = extractKV(line, "PC_ratio");
  return {
    "Put/Call Ratio": pcRatio ?? "—",
    "Max Pain": line.match(/MaxPain=\$?([\d.]+)/)?.[1] ? `$${line.match(/MaxPain=\$?([\d.]+)/)?.[1]}` : "—",
    "Avg IV": extractKV(line, "IV") ? `${extractKV(line, "IV")}` : "—",
  };
}

function parseLiquidity(line: string, data: ApiData | null): Record<string, string | number> {
  const liq = data?.liquidity;
  if (liq) {
    return {
      "Liquidity Score": `${liq.score} (${liq.direction})`,
      "Fed Balance Sheet": liq.fed_balance_sheet
        ? `${liq.fed_balance_sheet.direction} (${liq.fed_balance_sheet.change_pct})`
        : "—",
      "Fed Funds Rate": liq.fed_funds_rate?.direction ?? "—",
      "Yield Curve": liq.yield_curve?.inverted
        ? `${liq.yield_curve.value}% INVERTED`
        : liq.yield_curve?.value
          ? `${liq.yield_curve.value}% normal`
          : "—",
      "VIX": liq.vix ? `${liq.vix.value} (${liq.vix.regime})` : "—",
    };
  }
  // Fallback: parse from reasoning line
  const scoreMatch = extractKV(line, "score");
  return {
    "Liquidity Score": scoreMatch ?? "—",
  };
}

function parseInstitutional(line: string, data: ApiData | null): Record<string, string | number> {
  const inst = data?.institutional;
  if (inst) {
    const insiderLabel = inst.insider_signal === "BULLISH"
      ? "Smart money buying"
      : inst.insider_signal === "BEARISH"
        ? "Smart money selling"
        : "Neutral";
    return {
      "Insider": `${inst.insider_buy_count} buys / ${inst.insider_sell_count} sells`,
      "Smart Money": insiderLabel,
      "ETF Flow": inst.etf_symbol
        ? `${inst.etf_symbol} ${inst.etf_flow}${inst.etf_return_30d != null ? ` (${inst.etf_return_30d > 0 ? "+" : ""}${inst.etf_return_30d}% 30d)` : ""}`
        : inst.etf_flow ?? "—",
      "Inst. Ownership": inst.institutional_pct != null ? `${inst.institutional_pct}%` : "—",
    };
  }
  // Fallback: parse from reasoning line
  const insiderMatch = line.match(/Insider:\s*(BULLISH|BEARISH|NEUTRAL)/);
  const etfMatch = line.match(/ETF:\s*(inflow|outflow|neutral|unknown)/);
  return {
    Insider: insiderMatch?.[1] ?? "—",
    "ETF Flow": etfMatch?.[1] ?? "—",
  };
}

function parseSeasonal(line: string): Record<string, string | number> {
  const effectsMatch = line.match(/(?:Effetti attivi|Active effects):\s*([^|]+)/);
  const bullishMatch = line.match(/Bullish:\s*(\d+)/);
  const bearishMatch = line.match(/Bearish:\s*(\d+)/);
  const volatileMatch = line.match(/Volatile:\s*(\d+)/);
  return {
    "Effects": effectsMatch ? effectsMatch[1].trim() : "—",
    "Bullish": bullishMatch ? parseInt(bullishMatch[1]) : 0,
    "Bearish": bearishMatch ? parseInt(bearishMatch[1]) : 0,
    "Volatile": volatileMatch ? parseInt(volatileMatch[1]) : 0,
  };
}

function parseIntermarket(line: string, data: ApiData | null): Record<string, string | number> {
  const im = data?.intermarket;
  if (im) {
    return {
      Signal: `${im.signal} (${im.confidence}%)`,
      Summary: im.summary || "—",
      Details: im.details.slice(0, 2).join("; ") || "—",
    };
  }
  // Fallback: parse from reasoning line
  const summaryMatch = line.match(/\|\s*(\d+\/\d+\s*segnali\s*bullish\s*\|\s*\d+\/\d+\s*bearish)/);
  return {
    Summary: summaryMatch?.[1] ?? "—",
  };
}

function parseRisk(line: string, data: ApiData | null): Record<string, string | number> {
  const level = line.match(/→\s*(HIGH|MEDIUM|LOW)/)?.[1] ?? "—";
  const kelly = data?.kelly_sizing;
  const result: Record<string, string | number> = {
    "Risk Level": level,
    Volatility: extractKV(line, "volatility") ?? "—",
    Drawdown: extractKV(line, "drawdown") ?? "—",
  };
  if (kelly) {
    result["Kelly Sizing"] = `${kelly.suggested_pct}% capital`;
    result["Edge"] = kelly.edge > 0
      ? `+${kelly.edge.toFixed(3)} (positive)`
      : `${kelly.edge.toFixed(3)} (negative)`;
    result["Win Rate"] = `${(kelly.win_rate * 100).toFixed(0)}%`;
  }
  return result;
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

interface TopArticle {
  title: string;
  label: string;
  score: number;
  source: string;
}

interface SentimentData {
  articles_analyzed: number;
  positive: number;
  negative: number;
  neutral: number;
  weighted_score: number;
  top_articles: TopArticle[];
}

interface HistoryEntry {
  signal: string;
  confidence: number;
  created_at: string;
  sentiment_score: number | null;
}

interface ResearchData {
  papers_count: number;
  context: string;
  papers: { title: string; url: string }[];
}

interface OptionsData {
  signal: string;
  confidence: number;
  pc_ratio: number | null;
  max_pain: number | null;
  avg_iv: number | null;
  distance_to_max_pain: string | null;
}

interface IntermarketData {
  signal: string;
  confidence: number;
  summary: string;
  details: string[];
}

interface InstitutionalData {
  signal: string;
  confidence: number;
  insider_signal: string;
  insider_buy_count: number;
  insider_sell_count: number;
  insider_net_shares: string;
  etf_flow: string;
  etf_symbol: string;
  etf_return_30d: number | null;
  institutional_pct: number | null;
  details: string[];
}

interface LiquidityData {
  signal: string;
  confidence: number;
  score: number;
  direction: string;
  fed_balance_sheet: { direction: string; change_pct: string } | null;
  fed_funds_rate: { direction: string } | null;
  yield_curve: { value: string | null; inverted: boolean };
  vix: { value: number; regime: string } | null;
}

interface KellySizing {
  suggested_pct: number;
  edge: number;
  win_rate: number;
}

interface ApiData {
  ticker: string;
  signal: {
    signal: string;
    confidence: number;
    created_at: string;
    reasoning: string[];
  } | null;
  sentiment: SentimentData;
  stats: ApiStats;
  research?: ResearchData;
  options?: OptionsData | null;
  liquidity?: LiquidityData | null;
  intermarket?: IntermarketData | null;
  institutional?: InstitutionalData | null;
  kelly_sizing?: KellySizing | null;
  history: HistoryEntry[];
}

/* ── check if parsed details are all empty ─────────────── */
function hasRealData(details: Record<string, string | number>): boolean {
  return Object.values(details).some((v) => v !== "—" && v !== "");
}

/* ── build cards from API data ─────────────────────────── */
function buildCards(data: ApiData): AgentCardProps[] {
  const reasoning = data.signal?.reasoning ?? [];
  const sent = data.sentiment;

  const parsers: Record<string, (line: string) => Record<string, string | number>> = {
    TechnicalAgent: parseTechnical,
    FundamentalAgent: parseFundamental,
    MacroAgent: parseMacro,
    MomentumAgent: parseMomentum,
    MeanReversionAgent: parseMeanReversion,
    MLAgent: parseML,
    OptionsAgent: (line: string) => parseOptions(line, data),
    LiquidityAgent: (line: string) => parseLiquidity(line, data),
    IntermarketAgent: (line: string) => parseIntermarket(line, data),
    SeasonalAgent: parseSeasonal,
    InstitutionalAgent: (line: string) => parseInstitutional(line, data),
    ResearchAgent: parseResearch,
    RiskAgent: (line: string) => parseRisk(line, data),
    MetaLabeling: parseMetaLabeling,
  };

  return AGENTS.map((agent) => {
    // Find all reasoning lines for this agent
    const matchingLines = reasoning.filter((r) => r.startsWith(agent.prefix + ":"));
    const line = matchingLines[0] ?? "";

    // SentimentAgent: use server-side data directly
    let details: Record<string, string | number> = {};
    if (agent.prefix === "SentimentAgent") {
      details = {
        "Articles": sent.articles_analyzed,
        "Positive": sent.positive,
        "Negative": sent.negative,
        "Neutral": sent.neutral,
        "Weighted Score": sent.weighted_score,
      };
    } else if (line && parsers[agent.prefix]) {
      const parsed = parsers[agent.prefix](line);
      // Only show details grid if we got real data, otherwise fallback to raw log
      details = hasRealData(parsed) ? parsed : {};
    }

    // Extract vote
    let vote = extractVote(line);
    if (agent.prefix === "RiskAgent") {
      const level = line.match(/→\s*(HIGH|MEDIUM|LOW)/)?.[1];
      vote = level === "HIGH" ? "SELL" : level === "LOW" ? "BUY" : "HOLD";
    }
    if (agent.prefix === "ResearchAgent") {
      vote = "HOLD";
    }
    if (agent.prefix === "MetaLabeling") {
      vote = "HOLD"; // calibrator — no directional vote
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
      reasoning: matchingLines,
      // Pass top articles for SentimentAgent
      ...(agent.prefix === "SentimentAgent" ? { topArticles: sent.top_articles } : {}),
      // Pass research papers for ResearchAgent
      ...(agent.prefix === "ResearchAgent" ? {
        researchPapers: data.research?.papers ?? [],
        researchPapersCount: data.research?.papers_count ?? 0,
        researchContext: data.research?.context ?? "",
      } : {}),
    };
  });
}

/* ── parse WeightedVote reasoning ──────────────────────── */
interface WeightedVoteData {
  consensus: string;
  agentsAgree: number;
  agentsTotal: number;
  dominant: string;
  criticLine: string;
}

function parseWeightedVote(reasoning: string[]): WeightedVoteData {
  const wvLine = reasoning.find((r) => r.startsWith("WeightedVote:")) ?? "";
  const criticLine = reasoning.find((r) => r.startsWith("CriticAgent:")) ?? "";

  const consensus = extractKV(wvLine, "consensus") ?? "—";
  const agreeMatch = wvLine.match(/\((\d+)\/(\d+)\)/);
  const dominant = extractKV(wvLine, "dominant") ?? "—";

  return {
    consensus,
    agentsAgree: agreeMatch ? parseInt(agreeMatch[1]) : 0,
    agentsTotal: agreeMatch ? parseInt(agreeMatch[2]) : 0,
    dominant,
    criticLine,
  };
}

/* ── SVG confidence gauge ─────────────────────────────── */
function ConfidenceGauge({ value, signal }: { value: number; signal: string }) {
  const r = 54;
  const stroke = 8;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - pct);
  const color =
    signal === "BUY" ? "#10b981" : signal === "SELL" ? "#ef4444" : "#71717a";
  const trackColor = signal === "BUY" ? "#10b98110" : signal === "SELL" ? "#ef444410" : "#71717a10";

  return (
    <div className="relative flex items-center justify-center">
      <svg width={136} height={136} className="-rotate-90">
        <circle
          cx={68} cy={68} r={r}
          fill="none" stroke={trackColor} strokeWidth={stroke}
        />
        <circle
          cx={68} cy={68} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono tabular-nums" style={{ color }}>
          {Math.round(pct * 100)}%
        </span>
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
          confidence
        </span>
      </div>
    </div>
  );
}

/* ── weighted voting summary card ─────────────────────── */
const WEIGHT_TABLE: { name: string; initials: string; weight: number; color: string }[] = [
  { name: "Sentiment",      initials: "SE", weight: 22, color: "#2563eb" },
  { name: "Fundamental",    initials: "FU", weight: 18, color: "#0891b2" },
  { name: "Momentum",       initials: "MO", weight: 12, color: "#16a34a" },
  { name: "Technical",      initials: "TE", weight: 11, color: "#7c3aed" },
  { name: "ML Prediction",  initials: "ML", weight: 11, color: "#eab308" },
  { name: "Liquidity",      initials: "LI", weight:  8, color: "#10b981" },
  { name: "Options",        initials: "OP", weight:  6, color: "#b45309" },
  { name: "Macro",          initials: "MA", weight:  4, color: "#ea580c" },
  { name: "Intermarket",    initials: "IM", weight:  4, color: "#3730A3" },
  { name: "Seasonal",       initials: "SN", weight:  4, color: "#92400E" },
  { name: "Institutional",  initials: "IN", weight:  4, color: "#14532D" },
  { name: "Mean Reversion", initials: "MR", weight:  2, color: "#d946ef" },
];

const donutData = WEIGHT_TABLE.map(w => ({ name: w.name, value: w.weight, color: w.color }));

function WeightedVotingCard({
  cards,
  overall,
  reasoning,
}: {
  cards: AgentCardProps[];
  overall: ApiData["signal"];
  reasoning: string[];
}) {
  if (!overall) return null;

  const signal = overall.signal as "BUY" | "SELL" | "HOLD";
  const confidence = overall.confidence;
  const wv = parseWeightedVote(reasoning);

  // vote distribution from individual cards (exclude Research/Risk — non-voting)
  const votingCards = cards.filter(
    (c) => c.weightLabel !== "context" && c.weightLabel !== "gate",
  );
  const buys = votingCards.filter((c) => c.vote === "BUY").length;
  const sells = votingCards.filter((c) => c.vote === "SELL").length;
  const holds = votingCards.filter((c) => c.vote === "HOLD").length;
  const total = votingCards.length || 1;

  const signalColor =
    signal === "BUY" ? "text-[#10b981]" : signal === "SELL" ? "text-[#ef4444]" : "text-[#f59e0b]";
  const signalBg =
    signal === "BUY"
      ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.2)]"
      : signal === "SELL"
        ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.2)]"
        : "bg-[rgba(255,255,255,0.04)] border-[rgba(139,92,246,0.15)]";

  return (
    <div className={`card-gradient rounded-2xl border ${signalBg} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(139,92,246,0.12)]">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          WV
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-[var(--text-primary)]">Weighted Voting Agent</p>
          <p className="text-xs text-[var(--text-muted)]">
            Consensus: <span className="font-medium text-[var(--text-primary)]">{wv.consensus}</span>
            {" · "}
            {wv.agentsAgree}/{wv.agentsTotal} agents agree
            {" · "}
            Dominant: <span className="font-medium text-[var(--text-primary)]">{wv.dominant}</span>
          </p>
        </div>
        <span className={`text-2xl font-black tracking-tight ${signalColor}`}>
          {signal}
        </span>
      </div>

      {/* Body: 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-[rgba(139,92,246,0.12)]">
        {/* Col 1: Vote distribution */}
        <div className="p-5 space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">
            Vote Distribution
          </p>

          {/* Stacked bar */}
          <div className="flex h-7 rounded-xl overflow-hidden border border-[rgba(139,92,246,0.12)]">
            {buys > 0 && (
              <div
                className="bg-[#10b981] flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                style={{ width: `${(buys / total) * 100}%` }}
              >
                {buys}
              </div>
            )}
            {holds > 0 && (
              <div
                className="bg-[#f59e0b] flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                style={{ width: `${(holds / total) * 100}%` }}
              >
                {holds}
              </div>
            )}
            {sells > 0 && (
              <div
                className="bg-[#ef4444] flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                style={{ width: `${(sells / total) * 100}%` }}
              >
                {sells}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" />
              BUY ({buys})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" />
              HOLD ({holds})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />
              SELL ({sells})
            </span>
          </div>

          {/* Critic verdict */}
          {wv.criticLine && (
            <div className="rounded-lg bg-[#07070f] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Critic</p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] leading-relaxed">
                {wv.criticLine.replace("CriticAgent: ", "")}
              </p>
            </div>
          )}
        </div>

        {/* Col 2: Weight table */}
        <div className="p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">
            Agent Weights
          </p>
          <div className="space-y-1.5">
            {WEIGHT_TABLE.map((w) => {
              const agentCard = cards.find((c) => c.initials === w.initials);
              const agentVote = agentCard?.vote ?? "—";
              const voteColor =
                agentVote === "BUY"
                  ? "text-[#10b981]"
                  : agentVote === "SELL"
                    ? "text-[#ef4444]"
                    : "text-[#f59e0b]";
              return (
                <div key={w.initials} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                    style={{ backgroundColor: w.color, color: "#fff" }}
                  >
                    {w.initials}
                  </span>
                  <span className="flex-1 text-[var(--text-muted)] truncate">{w.name}</span>
                  <span className={`font-mono font-medium w-8 text-right ${voteColor}`}>
                    {agentVote}
                  </span>
                  <div className="w-16 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${w.weight}%`, backgroundColor: w.color, maxWidth: "100%" }}
                    />
                  </div>
                  <span className="font-mono text-[var(--text-muted)] w-7 text-right">{w.weight}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 3: Confidence gauge */}
        <div className="p-5 flex flex-col items-center justify-center gap-3">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-medium">
            Final Signal
          </p>
          <ConfidenceGauge value={confidence} signal={signal} />
          <p className="text-xs text-[var(--text-muted)] text-center">
            Updated {new Date(overall.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Pipeline Log: syntax-highlighted reasoning list ───── */
function highlightLine(line: string) {
  // Split into tokens and colorize BUY/SELL/numbers
  return line.split(/(\bBUY\b|\bSELL\b|\bHOLD\b|\bHIGH\b|\bMEDIUM\b|\bLOW\b|\bAPPROVATO\b|\bRIGETTATO\b|\d+\.?\d*%?)/g).map((token, i) => {
    if (token === "BUY" || token === "APPROVATO")
      return <span key={i} className="text-[#10b981] font-bold">{token}</span>;
    if (token === "SELL" || token === "RIGETTATO" || token === "HIGH")
      return <span key={i} className="text-[#ef4444] font-bold">{token}</span>;
    if (token === "HOLD" || token === "MEDIUM")
      return <span key={i} className="text-[#f59e0b] font-bold">{token}</span>;
    if (token === "LOW")
      return <span key={i} className="text-[#10b981] opacity-70 font-medium">{token}</span>;
    if (/^\d+\.?\d*%?$/.test(token))
      return <span key={i} className="font-mono text-sky-400">{token}</span>;
    return <span key={i}>{token}</span>;
  });
}

function PipelineLog({ reasoning }: { reasoning: string[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(reasoning.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (reasoning.length === 0) return null;

  return (
    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(139,92,246,0.12)]">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Pipeline Log</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-lg border bg-[rgba(124,58,237,0.1)] border-[rgba(139,92,246,0.2)] hover:bg-[rgba(124,58,237,0.2)] text-[var(--text-secondary)] transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <div className="bg-[#07070f] rounded-xl m-2 p-4 space-y-0.5 max-h-[400px] overflow-auto">
        {reasoning.map((line, i) => (
          <div key={i} className="flex gap-3 py-1 text-[11px] leading-relaxed group hover:bg-[rgba(124,58,237,0.05)] rounded px-2 -mx-2">
            <span className="text-[var(--text-muted)] opacity-40 font-mono select-none shrink-0 w-5 text-right tabular-nums">
              {i + 1}
            </span>
            <p className="font-mono text-[var(--text-muted)] min-w-0">
              {highlightLine(line)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Signal History table ─────────────────────────────── */
function SignalHistory({ history, ticker }: { history: HistoryEntry[]; ticker: string }) {
  if (history.length === 0) return null;

  return (
    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[rgba(139,92,246,0.12)]">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Signal History{" "}
          <span className="text-[var(--text-muted)] font-normal">— {ticker}</span>
        </p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(139,92,246,0.12)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-muted)]">Date</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--text-muted)]">Signal</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">Confidence</th>
              <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">Sentiment Score</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => {
              const sigColor =
                h.signal === "BUY"
                  ? "text-[#10b981]"
                  : h.signal === "SELL"
                    ? "text-[#ef4444]"
                    : "text-[#f59e0b]";
              const sentColor =
                h.sentiment_score != null
                  ? h.sentiment_score > 0
                    ? "text-[#10b981]"
                    : h.sentiment_score < 0
                      ? "text-[#ef4444]"
                      : "text-[#f59e0b]"
                  : "text-[var(--text-muted)]";
              return (
                <tr
                  key={i}
                  className={`border-b border-[rgba(139,92,246,0.12)] last:border-0 hover:bg-[rgba(124,58,237,0.05)] transition-colors ${i % 2 === 0 ? "bg-[var(--bg-card)]" : "bg-[var(--bg-secondary)]"}`}
                >
                  <td className="px-4 py-2.5 font-mono tabular-nums text-[var(--text-muted)]">
                    {new Date(h.created_at).toLocaleString()}
                  </td>
                  <td className={`px-4 py-2.5 font-bold ${sigColor}`}>
                    {h.signal}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {Math.round(h.confidence * 100)}%
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${sentColor}`}>
                    {h.sentiment_score != null ? h.sentiment_score.toFixed(3) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Custom Tooltip for Donut Chart ───────────────────── */
function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          backgroundColor: "#12122a",
          border: "1px solid rgba(139,92,246,0.3)",
          borderRadius: "8px",
          color: "#f0f0ff",
          fontSize: "12px",
          padding: "8px 12px",
        }}
      >
        <p style={{ margin: 0 }}>{payload[0].name}: <strong>{payload[0].value}%</strong></p>
      </div>
    );
  }
  return null;
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Active Agents</h1>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[rgba(16,185,129,0.15)] text-[#10b981] border border-[rgba(16,185,129,0.3)]">12 LIVE</span>
          <span className="text-xs font-mono text-[var(--text-muted)]">&Sigma; 100%</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => setTicker(t)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                ticker === t
                  ? "bg-[var(--accent)] text-white border-[var(--accent-light)] shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                  : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border-transparent hover:bg-[rgba(255,255,255,0.08)]"
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
          className={`card-gradient rounded-2xl border px-5 py-4 flex items-center justify-between flex-wrap gap-3 ${
            overall.signal === "BUY"
              ? "border-[rgba(16,185,129,0.2)]"
              : overall.signal === "SELL"
                ? "border-[rgba(239,68,68,0.2)]"
                : "border-[rgba(139,92,246,0.2)]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`text-lg font-bold ${
                overall.signal === "BUY"
                  ? "text-[#10b981]"
                  : overall.signal === "SELL"
                    ? "text-[#ef4444]"
                    : "text-[#f59e0b]"
              }`}
            >
              {overall.signal}
            </span>
            <span className="text-sm text-[var(--text-muted)]">{ticker}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span>
              Confidence{" "}
              <span className="font-mono font-medium text-[var(--text-primary)]">
                {Math.round(overall.confidence * 100)}%
              </span>
            </span>
            <span>
              Updated{" "}
              <span className="font-mono text-[var(--text-primary)]">
                {new Date(overall.created_at).toLocaleString()}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Donut Chart - Weight Distribution */}
      {!loading && !error && cards.length > 0 && (
        <div className="card-gradient rounded-2xl p-5 border border-[rgba(139,92,246,0.2)]">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4">Agent Weight Distribution</p>
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Chart */}
            <div className="relative" style={{ width: 200, height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xl font-bold font-mono text-[var(--text-primary)]">100%</span>
              </div>
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              {donutData.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-[var(--text-muted)]">{d.name}</span>
                  <span className="font-mono text-[var(--text-secondary)] ml-auto">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-6">
              <div className="h-28 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] p-5">
          <p className="text-[#ef4444] text-sm font-medium">Error</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{error}</p>
        </div>
      )}

      {/* Agent cards grid */}
      {!loading && !error && cards.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <AgentCard key={card.initials} {...card} />
            ))}
          </div>

          {/* Weighted Voting summary */}
          <WeightedVotingCard
            cards={cards}
            overall={data?.signal ?? null}
            reasoning={data?.signal?.reasoning ?? []}
          />

          {/* Pipeline Log */}
          <PipelineLog reasoning={data?.signal?.reasoning ?? []} />

          {/* Signal History */}
          <SignalHistory history={data?.history ?? []} ticker={ticker} />
        </>
      )}

      {/* No signal */}
      {!loading && !error && data && !data.signal && (
        <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-8 text-center">
          <p className="text-[var(--text-muted)] text-sm">
            No signal available for <span className="font-mono font-medium">{ticker}</span>
          </p>
        </div>
      )}
    </div>
  );
}
