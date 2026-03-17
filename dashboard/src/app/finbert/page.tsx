"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ── constants ── */
const TICKERS = [
  "AAPL", "TSLA", "NVDA", "BTC-USD",
  "ETH-USD", "MSFT", "XOM", "GLD",
];

const PHASE_LABELS = ["Scraping", "Text Extract", "Sentiment", "Embeddings"] as const;
type TabId = "scraping" | "text" | "sentiment" | "embedding";
const TABS: { id: TabId; label: string }[] = [
  { id: "scraping", label: "Scraping" },
  { id: "text", label: "Testo" },
  { id: "sentiment", label: "Sentiment" },
  { id: "embedding", label: "Embedding" },
];

/* ── types ── */
interface ArticleData {
  id: string;
  scraping: {
    url: string;
    source: string;
    scraped_at: string | null;
    title: string;
    title_length: number;
    content_length: number;
    has_content: boolean;
    content_preview: string | null;
    content_full: string;
    published_at: string;
    hours_since_publish: number;
  };
  text_processing: {
    raw_text: string;
    char_count: number;
    estimated_tokens: number;
    was_truncated: boolean;
    truncated_text: string;
    sentences: string[];
    sentence_count: number;
  };
  sentiment: {
    label: string | null;
    score: number;
    processed: boolean;
    direction: number;
    hours_ago: number;
    decay_weight: number;
    contribution: number;
  };
  embeddings: {
    has_embedding: boolean;
    dimensions: number;
    vector_preview: number[] | null;
    vector_norm: number | null;
    vector_stats: {
      min: number;
      max: number;
      mean: number;
      nonzero: number;
    } | null;
    vector_full: number[] | null;
  };
}

interface PipelineData {
  ticker: string;
  total_articles: number;
  phases: {
    scraped: number;
    has_content: number;
    processed_sentiment: number;
    has_embedding: number;
  };
  pipeline_health: {
    content_rate: number;
    sentiment_rate: number;
    embedding_rate: number;
  };
  articles: ArticleData[];
  recent_signals: {
    id: string;
    signal: string;
    confidence: number;
    created_at: string;
    reasoning: string;
  }[];
}

type PhaseFilter = null | "scraped" | "has_content" | "processed_sentiment" | "has_embedding";

/* ── helpers ── */
const labelBg = (l: string | null) =>
  l === "positive"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : l === "negative"
      ? "bg-red-500/15 text-red-400 border-red-500/25"
      : "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";

const signalBg = (s: string) =>
  s === "BUY"
    ? "bg-emerald-500"
    : s === "SELL"
      ? "bg-red-500"
      : "bg-zinc-500";

function timeAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m fa`;
  if (hours < 24) return `${Math.round(hours)}h fa`;
  return `${Math.round(hours / 24)}d fa`;
}

function healthColor(pct: number): string {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function healthText(pct: number): string {
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 60) return "text-amber-400";
  return "text-red-400";
}

function parseLogEntries(reasoning: string): { time: string; event: string; detail: string }[] {
  if (!reasoning) return [];
  const parts = typeof reasoning === "string"
    ? reasoning.split(" | ")
    : Array.isArray(reasoning) ? reasoning : [];
  return parts.map((p, i) => {
    const colonIdx = p.indexOf(":");
    const event = colonIdx > 0 ? p.substring(0, colonIdx).trim() : "STEP";
    const detail = colonIdx > 0 ? p.substring(colonIdx + 1).trim() : p;
    const seconds = i * 2;
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return { time: `00:${mm}:${ss}`, event, detail };
  });
}

/* ═══════════════ COMPONENT ═══════════════ */
export default function FinBertDebugPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("scraping");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(null);
  const [expandContent, setExpandContent] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── fetch ── */
  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline-debug?ticker=${t}&limit=50`);
      const json: PipelineData = await res.json();
      setData(json);
      setSelectedId(null);
      setPhaseFilter(null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(ticker); }, [ticker, fetchData]);

  /* ── derived ── */
  const articles = data?.articles ?? [];
  const phases = data?.phases;
  const health = data?.pipeline_health;

  const filtered = useMemo(() => {
    if (!phaseFilter) return articles;
    return articles.filter((a) => {
      if (phaseFilter === "scraped") return true;
      if (phaseFilter === "has_content") return a.scraping.has_content;
      if (phaseFilter === "processed_sentiment") return a.sentiment.processed;
      if (phaseFilter === "has_embedding") return a.embeddings.has_embedding;
      return true;
    });
  }, [articles, phaseFilter]);

  const selected = articles.find((a) => a.id === selectedId) ?? null;

  const phaseRows: {
    label: string;
    count: number;
    total: number;
    pct: number;
    filterKey: PhaseFilter;
  }[] = phases
    ? [
        { label: "Scraping", count: phases.scraped, total: phases.scraped, pct: 100, filterKey: "scraped" },
        { label: "Text Extract", count: phases.has_content, total: phases.scraped, pct: health?.content_rate ?? 0, filterKey: "has_content" },
        { label: "Sentiment", count: phases.processed_sentiment, total: phases.scraped, pct: health?.sentiment_rate ?? 0, filterKey: "processed_sentiment" },
        { label: "Embeddings", count: phases.has_embedding, total: phases.scraped, pct: health?.embedding_rate ?? 0, filterKey: "has_embedding" },
      ]
    : [];

  /* ── copy to clipboard ── */
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Debug</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scraping → Text → FinBERT → Embeddings
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <button
            onClick={() => fetchData(ticker)}
            disabled={loading}
            className="px-4 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-all ml-2"
          >
            {loading ? "..." : "Ricarica"}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="h-40 rounded-xl bg-muted/30 animate-pulse" />
      ) : data ? (
        <>
          {/* ══════ PIPELINE HEALTH BAR ══════ */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-0">
              {phaseRows.map((ph, i) => (
                <div key={ph.label} className="flex items-center flex-1">
                  <button
                    onClick={() =>
                      setPhaseFilter(
                        phaseFilter === ph.filterKey ? null : ph.filterKey,
                      )
                    }
                    className={`flex flex-col items-center flex-1 p-2 rounded-lg transition-all ${
                      phaseFilter === ph.filterKey
                        ? "bg-muted ring-1 ring-primary/40"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    {/* circle */}
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all ${healthColor(ph.pct)}`}
                    >
                      {Math.round(ph.pct)}%
                    </div>
                    <span className="text-[11px] mt-1 font-medium">
                      {ph.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${healthText(ph.pct)} cursor-pointer`}
                    >
                      {ph.count}/{ph.total}
                    </span>
                  </button>
                  {i < phaseRows.length - 1 && (
                    <div className="h-0.5 w-6 bg-border shrink-0 -mx-1" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ══════ LIST + DETAIL ══════ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: 520 }}>
            {/* ── sidebar: article list ── */}
            <div className="lg:col-span-2 rounded-xl border bg-card flex flex-col max-h-[640px]">
              <div className="p-3 border-b text-xs text-muted-foreground">
                {filtered.length} articoli
                {phaseFilter && (
                  <button
                    onClick={() => setPhaseFilter(null)}
                    className="ml-2 text-primary hover:underline"
                  >
                    rimuovi filtro
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-border">
                {filtered.length === 0 && (
                  <p className="p-6 text-center text-muted-foreground text-sm">
                    Nessun articolo
                  </p>
                )}
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedId(a.id);
                      setActiveTab("scraping");
                      setExpandContent(false);
                    }}
                    className={`w-full text-left p-2.5 hover:bg-muted/40 transition-colors ${
                      selectedId === a.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <p className="text-xs leading-snug truncate mb-1.5">
                      {a.scraping.title.substring(0, 60)}
                      {a.scraping.title.length > 60 ? "..." : ""}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {a.sentiment.label && (
                        <span
                          className={`text-[9px] px-1 py-0.5 rounded border ${labelBg(a.sentiment.label)}`}
                        >
                          {a.sentiment.label?.substring(0, 3)}
                        </span>
                      )}
                      {/* phase icons */}
                      <span className="text-[9px] font-mono text-emerald-400" title="Scraped">SC✓</span>
                      <span
                        className={`text-[9px] font-mono ${a.scraping.has_content ? "text-emerald-400" : "text-red-400"}`}
                        title="Text extracted"
                      >
                        TX{a.scraping.has_content ? "✓" : "✗"}
                      </span>
                      <span
                        className={`text-[9px] font-mono ${a.sentiment.processed ? "text-emerald-400" : "text-red-400"}`}
                        title="Sentiment"
                      >
                        SE{a.sentiment.processed ? "✓" : "✗"}
                      </span>
                      <span
                        className={`text-[9px] font-mono ${a.embeddings.has_embedding ? "text-emerald-400" : "text-red-400"}`}
                        title="Embedding"
                      >
                        EM{a.embeddings.has_embedding ? "✓" : "✗"}
                      </span>
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {timeAgo(a.scraping.hours_since_publish)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── detail area ── */}
            <div className="lg:col-span-3 rounded-xl border bg-card flex flex-col max-h-[640px]">
              {!selected ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <p className="text-muted-foreground text-sm">
                    Seleziona un articolo dalla lista
                  </p>
                </div>
              ) : (
                <>
                  {/* tabs */}
                  <div className="flex border-b">
                    {TABS.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                          activeTab === tab.id
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="overflow-y-auto flex-1 p-4 space-y-4 agent-msg">
                    {/* ═══ TAB 1: SCRAPING ═══ */}
                    {activeTab === "scraping" && (
                      <>
                        {/* url */}
                        <div className="rounded-lg border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                            URL sorgente
                          </p>
                          <a
                            href={selected.scraping.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline break-all"
                          >
                            {selected.scraping.url}
                          </a>
                          <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground">
                            <span>Fonte: {selected.scraping.source}</span>
                            <span>Scraped: {selected.scraping.scraped_at ? timeAgo((Date.now() - new Date(selected.scraping.scraped_at).getTime()) / 3600000) : "N/A"}</span>
                            <span>Pubblicato: {timeAgo(selected.scraping.hours_since_publish)}</span>
                          </div>
                        </div>

                        {/* title */}
                        <div className="rounded-lg border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                            Titolo estratto
                          </p>
                          <p className="text-sm font-medium">
                            {selected.scraping.title}
                          </p>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            [{selected.scraping.title_length} chars]
                          </span>
                        </div>

                        {/* content */}
                        <div className="rounded-lg border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                            Contenuto estratto
                          </p>
                          {selected.scraping.has_content ? (
                            <>
                              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {expandContent
                                  ? selected.scraping.content_full
                                  : selected.scraping.content_preview}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  [{selected.scraping.content_length.toLocaleString()} chars]
                                </span>
                                {selected.scraping.content_length > 200 && (
                                  <button
                                    onClick={() => setExpandContent(!expandContent)}
                                    className="text-[10px] text-primary hover:underline"
                                  >
                                    {expandContent ? "nascondi ▲" : "mostra tutto ▼"}
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-red-400 italic">
                              Nessun contenuto estratto
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* ═══ TAB 2: TEXT PROCESSING ═══ */}
                    {activeTab === "text" && (
                      <>
                        {/* raw text stats */}
                        <div className="rounded-lg border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                            Testo grezzo
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto font-mono bg-muted/30 rounded p-2">
                            {selected.text_processing.raw_text.substring(0, 500)}
                            {selected.text_processing.raw_text.length > 500 ? "..." : ""}
                          </p>
                          <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground">
                            <span>
                              Caratteri:{" "}
                              <strong className="text-foreground">
                                {selected.text_processing.char_count.toLocaleString()}
                              </strong>
                            </span>
                            <span>
                              Token est:{" "}
                              <strong className="text-foreground">
                                ~{selected.text_processing.estimated_tokens}
                              </strong>
                            </span>
                            <span>
                              Troncato:{" "}
                              <strong
                                className={
                                  selected.text_processing.was_truncated
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                                }
                              >
                                {selected.text_processing.was_truncated
                                  ? "SI (> 512 token)"
                                  : "NO (< 512 token)"}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* sentences */}
                        <div className="rounded-lg border p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                            Frasi estratte ({selected.text_processing.sentence_count})
                          </p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {selected.text_processing.sentences.map((s, i) => (
                              <div key={i} className="flex gap-2 text-xs">
                                <span className="text-muted-foreground font-mono shrink-0 w-5 text-right">
                                  {i + 1}.
                                </span>
                                <span className="text-muted-foreground leading-snug">
                                  {s}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* finbert input */}
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              Testo inviato a FinBERT
                            </p>
                            <button
                              onClick={() =>
                                copyText(selected.text_processing.truncated_text)
                              }
                              className="text-[10px] text-primary hover:underline"
                            >
                              {copied ? "copiato ✓" : "copia negli appunti"}
                            </button>
                          </div>
                          <pre className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">
                            {selected.text_processing.truncated_text}
                          </pre>
                        </div>
                      </>
                    )}

                    {/* ═══ TAB 3: SENTIMENT ═══ */}
                    {activeTab === "sentiment" && (
                      <>
                        {!selected.sentiment.processed ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
                            <p className="text-amber-400 text-sm font-medium">
                              Sentiment non ancora elaborato
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              FinBERT non ha ancora processato questo articolo
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* model info */}
                            <div className="rounded-lg border p-3">
                              <p className="text-xs text-muted-foreground">
                                Input → <strong className="text-foreground">FinBERT</strong>{" "}
                                (ProsusAI/finbert)
                              </p>
                            </div>

                            {/* class scores */}
                            <div className="rounded-lg border p-3">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                                Output classi
                              </p>
                              <div className="space-y-2.5">
                                {(["positive", "negative", "neutral"] as const).map(
                                  (cls) => {
                                    const isWinner = selected.sentiment.label === cls;
                                    const val = isWinner
                                      ? selected.sentiment.score
                                      : (1 - selected.sentiment.score) *
                                        (cls === "neutral" ? 0.4 : 0.3);
                                    const barColor =
                                      cls === "positive"
                                        ? "bg-emerald-500"
                                        : cls === "negative"
                                          ? "bg-red-500"
                                          : "bg-zinc-500";
                                    const textColor =
                                      cls === "positive"
                                        ? "text-emerald-400"
                                        : cls === "negative"
                                          ? "text-red-400"
                                          : "text-zinc-400";
                                    return (
                                      <div
                                        key={cls}
                                        className="flex items-center gap-3"
                                      >
                                        <span
                                          className={`text-xs w-16 ${textColor}`}
                                        >
                                          {cls}
                                        </span>
                                        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className={`h-full ${barColor} rounded-full transition-all duration-700`}
                                            style={{
                                              width: `${val * 100}%`,
                                            }}
                                          />
                                        </div>
                                        <span className="text-xs font-mono w-12 text-right">
                                          {val.toFixed(3)}
                                        </span>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                              <p className="text-xs mt-3">
                                → Classificato:{" "}
                                <strong
                                  className={
                                    selected.sentiment.label === "positive"
                                      ? "text-emerald-400"
                                      : selected.sentiment.label === "negative"
                                        ? "text-red-400"
                                        : "text-zinc-400"
                                  }
                                >
                                  {(selected.sentiment.label ?? "N/A").toUpperCase()}
                                </strong>{" "}
                                <span className="font-mono">
                                  ({selected.sentiment.score.toFixed(4)})
                                </span>
                              </p>
                            </div>

                            {/* contribution formula */}
                            <div className="rounded-lg bg-muted/40 border p-4 font-mono text-xs leading-loose space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-sans">
                                Contributo al score aggregato
                              </p>
                              <p>
                                Ore dalla pubblicazione:{" "}
                                <span className="text-foreground font-bold">
                                  {selected.sentiment.hours_ago}h
                                </span>
                              </p>
                              <p>
                                Decay weight: e^(-{selected.sentiment.hours_ago}
                                /24) ={" "}
                                <span className="text-foreground font-bold">
                                  {selected.sentiment.decay_weight.toFixed(4)}
                                </span>
                              </p>
                              <p>
                                Direction:{" "}
                                <span className="text-foreground font-bold">
                                  {selected.sentiment.direction > 0
                                    ? "+1 (positive)"
                                    : selected.sentiment.direction < 0
                                      ? "-1 (negative)"
                                      : "0 (neutral)"}
                                </span>
                              </p>
                              <p>
                                Contributo:{" "}
                                <span className="text-foreground">
                                  {selected.sentiment.score.toFixed(4)} ×{" "}
                                  {selected.sentiment.direction} ×{" "}
                                  {selected.sentiment.decay_weight.toFixed(4)}
                                </span>
                              </p>
                              <p>
                                {"= "}
                                <span
                                  className={`font-bold text-sm ${
                                    selected.sentiment.contribution > 0
                                      ? "text-emerald-400"
                                      : selected.sentiment.contribution < 0
                                        ? "text-red-400"
                                        : "text-zinc-400"
                                  }`}
                                >
                                  {selected.sentiment.contribution > 0
                                    ? "+"
                                    : ""}
                                  {selected.sentiment.contribution.toFixed(4)}
                                </span>
                              </p>
                              <div className="border-t border-border mt-2 pt-2 text-muted-foreground">
                                <p>Soglie segnale:</p>
                                <p>
                                  score {">"} +0.15 →{" "}
                                  <span className="text-emerald-400">BUY</span>
                                </p>
                                <p>
                                  score {"<"} -0.15 →{" "}
                                  <span className="text-red-400">SELL</span>
                                </p>
                                <p>
                                  else →{" "}
                                  <span className="text-zinc-400">HOLD</span>
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {/* ═══ TAB 4: EMBEDDING ═══ */}
                    {activeTab === "embedding" && (
                      <>
                        {/* model info */}
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs">
                                Modello:{" "}
                                <strong className="text-foreground">
                                  all-MiniLM-L6-v2
                                </strong>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Dimensioni: {selected.embeddings.dimensions || 384}
                              </p>
                            </div>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-medium ${
                                selected.embeddings.has_embedding
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-red-500/15 text-red-400"
                              }`}
                            >
                              {selected.embeddings.has_embedding
                                ? "✓ generato"
                                : "✗ non generato"}
                            </span>
                          </div>
                        </div>

                        {!selected.embeddings.has_embedding ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
                            <p className="text-amber-400 text-sm">
                              Embedding non ancora generato
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* vector stats */}
                            <div className="rounded-lg border p-3">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                Statistiche vettore
                              </p>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                                <div>
                                  Min:{" "}
                                  <span className="text-red-400">
                                    {selected.embeddings.vector_stats?.min}
                                  </span>
                                </div>
                                <div>
                                  Max:{" "}
                                  <span className="text-emerald-400">
                                    +{selected.embeddings.vector_stats?.max}
                                  </span>
                                </div>
                                <div>
                                  Mean:{" "}
                                  <span className="text-foreground">
                                    {(selected.embeddings.vector_stats?.mean ?? 0) > 0 ? "+" : ""}
                                    {selected.embeddings.vector_stats?.mean}
                                  </span>
                                </div>
                                <div>
                                  Norma:{" "}
                                  <span className="text-foreground">
                                    {selected.embeddings.vector_norm}
                                  </span>
                                </div>
                                <div className="col-span-2">
                                  Valori non-zero:{" "}
                                  <span className="text-foreground">
                                    {selected.embeddings.vector_stats?.nonzero}/
                                    {selected.embeddings.dimensions} (
                                    {(
                                      ((selected.embeddings.vector_stats
                                        ?.nonzero ?? 0) /
                                        (selected.embeddings.dimensions || 1)) *
                                      100
                                    ).toFixed(1)}
                                    %)
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* vector preview */}
                            <div className="rounded-lg border p-3">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                Anteprima primi 8 valori
                              </p>
                              <div className="font-mono text-xs text-muted-foreground bg-muted/30 rounded p-2">
                                [{selected.embeddings.vector_preview?.join(", ")}, ...]
                              </div>
                            </div>

                            {/* heatmap */}
                            <div className="rounded-lg border p-3">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                                Visualizzazione vettore (24×16 heatmap)
                              </p>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(24, 1fr)",
                                  gap: "1px",
                                }}
                              >
                                {(
                                  selected.embeddings.vector_full ?? []
                                ).map((v, i) => (
                                  <div
                                    key={i}
                                    title={`dim ${i}: ${v.toFixed(4)}`}
                                    style={{
                                      height: "8px",
                                      borderRadius: "1px",
                                      background:
                                        v > 0
                                          ? `rgba(52,211,153,${Math.min(Math.abs(v) * 2, 1)})`
                                          : `rgba(248,113,113,${Math.min(Math.abs(v) * 2, 1)})`,
                                    }}
                                  />
                                ))}
                              </div>
                              <div className="flex justify-between mt-1.5 text-[9px] text-muted-foreground">
                                <span className="text-red-400">negativo ←</span>
                                <span>dim 0...383</span>
                                <span className="text-emerald-400">→ positivo</span>
                              </div>
                            </div>

                            {/* usage info */}
                            <div className="rounded-lg bg-muted/30 border p-3 text-xs text-muted-foreground space-y-1">
                              <p className="font-medium text-foreground">
                                Usato per:
                              </p>
                              <p>Semantic search su pgvector</p>
                              <p>
                                Operatore:{" "}
                                <code className="font-mono text-foreground">
                                  {"<->"}
                                </code>{" "}
                                (cosine distance)
                              </p>
                              <p>Index: IVFFlat con 100 liste</p>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ══════ SYSTEM LOG ══════ */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-sm">
                System Log — Ultima esecuzione per {data.ticker}
              </h2>
            </div>
            {(data.recent_signals ?? []).length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-sm">
                Nessun segnale storico trovato
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2.5 font-medium text-muted-foreground w-20">
                        Timestamp
                      </th>
                      <th className="text-left p-2.5 font-medium text-muted-foreground w-24">
                        Evento
                      </th>
                      <th className="text-left p-2.5 font-medium text-muted-foreground">
                        Dettaglio
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {data.recent_signals.slice(0, 1).map((sig) => {
                      const entries = parseLogEntries(sig.reasoning);
                      return entries.map((entry, i) => {
                        const evColor =
                          entry.event.includes("Scraper") || entry.event.includes("SCRAPE")
                            ? "text-blue-400"
                            : entry.event.includes("Sentiment") || entry.event.includes("FINBERT")
                              ? "text-purple-400"
                              : entry.event.includes("Signal") || entry.event.includes("Weighted")
                                ? "text-emerald-400"
                                : entry.event.includes("Risk") || entry.event.includes("Macro")
                                  ? "text-amber-400"
                                  : "text-zinc-400";
                        return (
                          <tr
                            key={`${sig.id}-${i}`}
                            className="hover:bg-muted/20"
                          >
                            <td className="p-2.5 text-muted-foreground">
                              {entry.time}
                            </td>
                            <td className={`p-2.5 font-medium ${evColor}`}>
                              {entry.event}
                            </td>
                            <td className="p-2.5 text-muted-foreground">
                              {entry.detail}
                            </td>
                          </tr>
                        );
                      });
                    })}
                    {/* final row */}
                    {data.recent_signals[0] && (
                      <tr className="bg-muted/20 border-t-2">
                        <td className="p-2.5 text-muted-foreground">
                          RESULT
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${signalBg(data.recent_signals[0].signal)}`}
                          >
                            {data.recent_signals[0].signal}
                          </span>
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          Confidence:{" "}
                          {(
                            (data.recent_signals[0].confidence ?? 0) * 100
                          ).toFixed(1)}
                          % — {new Date(data.recent_signals[0].created_at).toLocaleString("it-IT")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* recent runs comparison */}
            {(data.recent_signals ?? []).length > 1 && (
              <div className="border-t">
                <div className="p-3 border-b bg-muted/10">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Confronto ultimi {data.recent_signals.length} segnali
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {data.recent_signals.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <span className="text-[10px] font-mono text-muted-foreground w-32">
                        {new Date(run.created_at).toLocaleString("it-IT")}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${signalBg(run.signal)}`}
                      >
                        {run.signal}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${signalBg(run.signal)}`}
                          style={{
                            width: `${(run.confidence ?? 0) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">
                        {((run.confidence ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
