"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── constants ── */
const TICKERS = [
  "AAPL",
  "TSLA",
  "NVDA",
  "BTC-USD",
  "ETH-USD",
  "MSFT",
  "XOM",
  "GLD",
];

const PIPELINE_STEPS = [
  "Fetch articoli",
  "Truncate 512 token",
  "FinBERT classify",
  "Decay weighting",
  "Score aggregato",
];

type SentimentLabel = "positive" | "negative" | "neutral";
type SignalType = "BUY" | "SELL" | "HOLD";
type FilterType = "all" | SentimentLabel;

interface Article {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  ticker: string;
  published_at: string;
  sentiment_label: SentimentLabel;
  sentiment_score: number;
  hours_ago: number;
  decay_weight: number;
  direction: number;
  contribution: number;
}

interface Stats {
  count: number;
  weighted_score: number;
  signal: SignalType;
  distribution: Record<SentimentLabel, number>;
  sum_contribution: number;
  sum_weight: number;
  most_impactful: {
    title: string;
    label: string;
    score: number;
    contribution: number;
  } | null;
}

interface RecentRun {
  id: string;
  signal: SignalType;
  confidence: number;
  created_at: string;
  reasoning: string;
}

interface DebugData {
  ticker: string;
  articles: Article[];
  stats: Stats;
  recent_runs: RecentRun[];
}

/* ── helpers ── */
const signalBg = (s: string) =>
  s === "BUY"
    ? "bg-emerald-500"
    : s === "SELL"
      ? "bg-red-500"
      : "bg-zinc-500";

const labelBg = (l: string) =>
  l === "positive"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : l === "negative"
      ? "bg-red-500/15 text-red-400 border-red-500/25"
      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";

const labelDot = (l: string) =>
  l === "positive"
    ? "bg-emerald-400"
    : l === "negative"
      ? "bg-red-400"
      : "bg-zinc-400";

const scoreBg = (score: number) => {
  if (score > 0) return `rgba(52,211,153,${Math.min(score, 1) * 0.7})`;
  if (score < 0) return `rgba(248,113,113,${Math.min(-score, 1) * 0.7})`;
  return "rgba(161,161,170,0.3)";
};

function timeAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m fa`;
  if (hours < 24) return `${Math.round(hours)}h fa`;
  return `${Math.round(hours / 24)}d fa`;
}

/* ── word coloring for salient tokens ── */
const POS_WORDS = new Set([
  "surge", "surges", "soars", "rally", "rallies", "jumps",
  "gains", "rises", "beats", "profit", "growth", "bullish",
  "record", "high", "upgrade", "buy", "up", "boost", "strong",
  "positive", "outperform", "revenue", "earnings", "demand",
]);
const NEG_WORDS = new Set([
  "crash", "crashes", "drops", "falls", "plunges", "decline",
  "loss", "losses", "sell", "selloff", "bearish", "down",
  "risk", "debt", "miss", "warning", "weak", "cut", "layoffs",
  "negative", "underperform", "fear", "recession", "inflation",
]);

function wordColor(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (POS_WORDS.has(w)) return "text-emerald-400 font-semibold";
  if (NEG_WORDS.has(w)) return "text-red-400 font-semibold";
  return "text-zinc-400";
}

/* ═══════════════ COMPONENT ═══════════════ */
export default function FinBertDebugPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pipeStep, setPipeStep] = useState(-1);
  const [pipeRunning, setPipeRunning] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  /* ── fetch data ── */
  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finbert-debug?ticker=${t}&limit=50`);
      const json: DebugData = await res.json();
      setData(json);
      setSelectedId(null);
      setFilter("all");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(ticker);
  }, [ticker, fetchData]);

  /* ── pipeline animation ── */
  const runPipeline = () => {
    if (pipeRunning) return;
    setPipeRunning(true);
    setPipeStep(0);
    let step = 0;
    const iv = setInterval(() => {
      step++;
      if (step >= PIPELINE_STEPS.length) {
        clearInterval(iv);
        setPipeStep(PIPELINE_STEPS.length);
        setTimeout(() => {
          setPipeRunning(false);
          fetchData(ticker);
        }, 600);
      } else {
        setPipeStep(step);
      }
    }, 700);
  };

  /* ── derived ── */
  const articles = data?.articles ?? [];
  const filtered =
    filter === "all"
      ? articles
      : articles.filter((a) => a.sentiment_label === filter);
  const selected = articles.find((a) => a.id === selectedId) ?? null;
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            FinBERT Debug
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analisi dettagliata del sentiment per articolo
          </p>
        </div>

        {/* ticker pills */}
        <div className="flex gap-1.5 flex-wrap justify-end">
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

      {loading && !data ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* ══════ SEZIONE 1: Metriche aggregate ══════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* count */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Articoli analizzati
              </p>
              <p className="text-3xl font-bold font-mono">
                {stats?.count ?? 0}
              </p>
            </div>

            {/* weighted score */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Score pesato
              </p>
              <p
                className="text-3xl font-bold font-mono"
                style={{ color: scoreBg(stats?.weighted_score ?? 0) }}
              >
                {(stats?.weighted_score ?? 0) > 0 ? "+" : ""}
                {(stats?.weighted_score ?? 0).toFixed(4)}
              </p>
            </div>

            {/* distribution */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Distribuzione
              </p>
              <div className="flex gap-3 mt-2">
                <span className="text-emerald-400 font-bold font-mono">
                  {stats?.distribution.positive ?? 0}+
                </span>
                <span className="text-red-400 font-bold font-mono">
                  {stats?.distribution.negative ?? 0}-
                </span>
                <span className="text-zinc-400 font-bold font-mono">
                  {stats?.distribution.neutral ?? 0}~
                </span>
              </div>
            </div>

            {/* signal */}
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Segnale finale
              </p>
              <span
                className={`inline-block mt-1 px-4 py-1.5 rounded-full text-white text-sm font-bold ${signalBg(stats?.signal ?? "HOLD")}`}
              >
                {stats?.signal ?? "HOLD"}
              </span>
            </div>
          </div>

          {/* ══════ SEZIONE 2: Pipeline steps ══════ */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">Pipeline FinBERT</h2>
              <button
                onClick={runPipeline}
                disabled={pipeRunning}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-all"
              >
                {pipeRunning ? "Elaborazione..." : "Rielabora"}
              </button>
            </div>

            <div className="flex items-center gap-0">
              {PIPELINE_STEPS.map((step, i) => {
                const done = pipeStep > i;
                const active = pipeStep === i && pipeRunning;
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                          done
                            ? "bg-emerald-500 text-white scale-105"
                            : active
                              ? "bg-blue-500 text-white animate-pulse scale-110"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {done ? "\u2713" : i + 1}
                      </div>
                      <span
                        className={`text-[11px] mt-1.5 text-center leading-tight ${
                          done
                            ? "text-emerald-400"
                            : active
                              ? "text-blue-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 -mx-1 transition-all duration-500 ${
                          done ? "bg-emerald-500" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══════ SEZIONE 3: Lista + Dettaglio ══════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── colonna sinistra: lista articoli ── */}
            <div className="rounded-xl border bg-card flex flex-col max-h-[620px]">
              {/* filtri */}
              <div className="flex gap-1.5 p-3 border-b">
                {(
                  ["all", "positive", "negative", "neutral"] as FilterType[]
                ).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${
                      filter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {f === "all"
                      ? `Tutti (${articles.length})`
                      : f === "positive"
                        ? `Positivi (${stats?.distribution.positive ?? 0})`
                        : f === "negative"
                          ? `Negativi (${stats?.distribution.negative ?? 0})`
                          : `Neutrali (${stats?.distribution.neutral ?? 0})`}
                  </button>
                ))}
              </div>

              {/* lista */}
              <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-border">
                {filtered.length === 0 && (
                  <p className="p-6 text-center text-muted-foreground text-sm">
                    Nessun articolo trovato
                  </p>
                )}
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left p-3 hover:bg-muted/40 transition-colors ${
                      selectedId === a.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 w-2 h-2 rounded-full shrink-0 ${labelDot(a.sentiment_label)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug truncate">
                          {a.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${labelBg(a.sentiment_label)}`}
                          >
                            {a.sentiment_label}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {a.sentiment_score.toFixed(3)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {a.source}
                          </span>
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            {timeAgo(a.hours_ago)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── colonna destra: dettaglio ── */}
            <div className="rounded-xl border bg-card p-5 max-h-[620px] overflow-y-auto">
              {!selected ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <p className="text-muted-foreground text-sm">
                    Seleziona un articolo dalla lista
                  </p>
                </div>
              ) : (
                <div className="space-y-5 agent-msg">
                  {/* titolo */}
                  <div>
                    <h3 className="font-semibold text-base leading-snug">
                      {selected.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span>{selected.source}</span>
                      <span>-</span>
                      <span>
                        {new Date(selected.published_at).toLocaleString(
                          "it-IT",
                        )}
                      </span>
                      <span>-</span>
                      <span className="font-mono">troncato a 512 token</span>
                    </div>
                  </div>

                  {/* token salienti */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Token salienti
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selected.title.split(/\s+/).map((word, i) => (
                        <span
                          key={i}
                          className={`px-1.5 py-0.5 rounded text-sm ${wordColor(word)} bg-muted/40`}
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* score per classe */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Score per classe
                    </p>
                    <div className="space-y-2">
                      {/* positive */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs w-16 text-emerald-400">
                          Positive
                        </span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                            style={{
                              width: `${selected.sentiment_label === "positive" ? selected.sentiment_score * 100 : (1 - selected.sentiment_score) * 30}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono w-12 text-right">
                          {selected.sentiment_label === "positive"
                            ? selected.sentiment_score.toFixed(3)
                            : ((1 - selected.sentiment_score) * 0.3).toFixed(
                                3,
                              )}
                        </span>
                      </div>
                      {/* negative */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs w-16 text-red-400">
                          Negative
                        </span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 rounded-full transition-all duration-700"
                            style={{
                              width: `${selected.sentiment_label === "negative" ? selected.sentiment_score * 100 : (1 - selected.sentiment_score) * 30}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono w-12 text-right">
                          {selected.sentiment_label === "negative"
                            ? selected.sentiment_score.toFixed(3)
                            : ((1 - selected.sentiment_score) * 0.3).toFixed(
                                3,
                              )}
                        </span>
                      </div>
                      {/* neutral */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs w-16 text-zinc-400">
                          Neutral
                        </span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-zinc-500 rounded-full transition-all duration-700"
                            style={{
                              width: `${selected.sentiment_label === "neutral" ? selected.sentiment_score * 100 : (1 - selected.sentiment_score) * 0.4 * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono w-12 text-right">
                          {selected.sentiment_label === "neutral"
                            ? selected.sentiment_score.toFixed(3)
                            : ((1 - selected.sentiment_score) * 0.4).toFixed(
                                3,
                              )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* formula box */}
                  <div className="rounded-lg bg-muted/40 border border-border p-4 font-mono text-xs leading-relaxed space-y-1">
                    <p>
                      Classificato come{" "}
                      <span
                        className={
                          selected.sentiment_label === "positive"
                            ? "text-emerald-400 font-bold"
                            : selected.sentiment_label === "negative"
                              ? "text-red-400 font-bold"
                              : "text-zinc-400 font-bold"
                        }
                      >
                        {selected.sentiment_label}
                      </span>{" "}
                      con confidence{" "}
                      <span className="text-foreground font-bold">
                        {selected.sentiment_score.toFixed(4)}
                      </span>
                    </p>
                    <p>
                      Peso per et&agrave; ({selected.hours_ago}h):{" "}
                      <span className="text-foreground">
                        e^(-{selected.hours_ago}/24)
                      </span>{" "}
                      ={" "}
                      <span className="text-foreground font-bold">
                        {selected.decay_weight.toFixed(4)}
                      </span>
                    </p>
                    <p>
                      Contributo al score:{" "}
                      <span className="text-foreground">
                        {selected.sentiment_score.toFixed(4)} &times;{" "}
                        {selected.direction} &times;{" "}
                        {selected.decay_weight.toFixed(4)}
                      </span>{" "}
                      ={" "}
                      <span
                        className={`font-bold ${selected.contribution > 0 ? "text-emerald-400" : selected.contribution < 0 ? "text-red-400" : "text-zinc-400"}`}
                      >
                        {selected.contribution > 0 ? "+" : ""}
                        {selected.contribution.toFixed(4)}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════ SEZIONE 4: Decay Weighting table ══════ */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-sm">
                Decay Weighting &mdash; Contributo per articolo
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Et&agrave;
                    </th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Titolo
                    </th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Label
                    </th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">
                      Peso (e^(-h/24))
                    </th>
                    <th className="p-3 text-xs font-medium text-muted-foreground w-32">
                      Barra peso
                    </th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground">
                      Contributo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {articles.map((a) => (
                    <tr
                      key={a.id}
                      className="hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setSelectedId(a.id)}
                    >
                      <td className="p-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {timeAgo(a.hours_ago)}
                      </td>
                      <td className="p-3 max-w-[300px] truncate text-xs">
                        {a.title}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${labelBg(a.sentiment_label)}`}
                        >
                          {a.sentiment_label}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-mono text-right">
                        {a.decay_weight.toFixed(4)}
                      </td>
                      <td className="p-3">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500/60 rounded-full transition-all"
                            style={{
                              width: `${a.decay_weight * 100}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td
                        className={`p-3 text-xs font-mono text-right font-bold ${
                          a.contribution > 0
                            ? "text-emerald-400"
                            : a.contribution < 0
                              ? "text-red-400"
                              : "text-zinc-500"
                        }`}
                      >
                        {a.contribution > 0 ? "+" : ""}
                        {a.contribution.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* riga aggregata */}
                <tfoot>
                  <tr className="border-t-2 bg-muted/20">
                    <td
                      colSpan={3}
                      className="p-3 text-xs font-mono text-muted-foreground"
                    >
                      &Sigma;(score &times; direction &times; weight) /{" "}
                      &Sigma;(weights)
                    </td>
                    <td className="p-3 text-xs font-mono text-right font-bold">
                      &Sigma; {stats?.sum_weight?.toFixed(4) ?? "0"}
                    </td>
                    <td className="p-3">
                      <div className="text-[10px] text-muted-foreground text-center">
                        {">"}+0.15 = BUY &nbsp; {"<"}-0.15 = SELL
                      </div>
                    </td>
                    <td
                      className={`p-3 text-sm font-mono text-right font-bold ${
                        (stats?.weighted_score ?? 0) > 0
                          ? "text-emerald-400"
                          : (stats?.weighted_score ?? 0) < 0
                            ? "text-red-400"
                            : "text-zinc-400"
                      }`}
                    >
                      {(stats?.weighted_score ?? 0) > 0 ? "+" : ""}
                      {(stats?.weighted_score ?? 0).toFixed(4)}{" "}
                      <span
                        className={`ml-2 px-2 py-0.5 rounded text-xs text-white ${signalBg(stats?.signal ?? "HOLD")}`}
                      >
                        {stats?.signal ?? "HOLD"}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ══════ SEZIONE 5: Confronto run ══════ */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-sm">
                Confronto run &mdash; Ultimi 5 segnali per {data?.ticker}
              </h2>
            </div>
            {(data?.recent_runs ?? []).length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-sm">
                Nessun segnale storico trovato
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                        Timestamp
                      </th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                        Segnale
                      </th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground">
                        Confidence
                      </th>
                      <th className="p-3 text-xs font-medium text-muted-foreground">
                        Confidence bar
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(data?.recent_runs ?? []).map((run) => (
                      <tr
                        key={run.id}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <td className="p-3 text-xs font-mono text-muted-foreground">
                          {new Date(run.created_at).toLocaleString("it-IT")}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs text-white font-bold ${signalBg(run.signal)}`}
                          >
                            {run.signal}
                          </span>
                        </td>
                        <td className="p-3 text-xs font-mono text-right">
                          {((run.confidence ?? 0) * 100).toFixed(1)}%
                        </td>
                        <td className="p-3">
                          <div className="h-2 bg-muted rounded-full overflow-hidden w-32">
                            <div
                              className={`h-full rounded-full ${signalBg(run.signal)}`}
                              style={{
                                width: `${(run.confidence ?? 0) * 100}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
