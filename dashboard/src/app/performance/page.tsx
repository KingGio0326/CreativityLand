"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TICKERS } from "@/lib/constants";

/* ── types ─────────────────────────────────────────────── */
interface Evaluation {
  id: number;
  signal_type: string;
  confidence: number;
  entry_date: string;
  entry_price: number;
  return_6h: number;
  return_24h: number;
  return_72h: number;
  return_168h: number;
  score_6h: number;
  score_24h: number;
  score_72h: number;
  score_168h: number;
}

interface HorizonStats {
  count: number;
  hit_rate: number;
  avg_score: string;
  avg_return: string;
  chart_data: { date: string; cumulative_score: number; signal: string; confidence: number; score: number; return: number }[];
  signals: { date: string; signal: string; confidence: number; score: number; return: number }[];
}

interface Stats {
  total_signals: number;
  hit_rate: number;
  avg_score: number;
  cumulative_score: number;
  avg_return_168h: number;
  positive_signals: number;
  alpha: number;
  best_signal: { date: string; ticker: string; return: number } | null;
  worst_signal: { date: string; ticker: string; return: number } | null;
}

interface ChartPoint {
  date: string;
  cumulative_score: number;
  spy_cumulative: number;
}

interface MLValidation {
  ticker: string;
  avg_accuracy: number;
  std_accuracy: number;
  min_accuracy: number;
  max_accuracy: number;
  n_splits: number;
  fold_accuracies: number[];
  is_reliable: boolean;
  updated_at: string;
}

interface PerfData {
  ticker: string;
  evaluations: Evaluation[];
  horizons: Record<string, HorizonStats>;
  stats: Stats;
  chart_data: ChartPoint[];
  ml_validation: MLValidation | null;
}

type Horizon = "6h" | "24h" | "72h" | "168h";

const HORIZON_LABELS: Record<Horizon, string> = {
  "6h": "6 ore",
  "24h": "24 ore",
  "72h": "3 giorni",
  "168h": "7 giorni",
};

interface EquityPoint {
  date: string;
  cumulative_pnl: number;
  signal: string;
  pnl: number;
  entry_price: number;
  exit_price: number;
}

type EquityCurveData = Record<string, Record<string, EquityPoint[]>>;

const TICKER_COLORS: Record<string, string> = {
  // Mega cap
  AAPL: "#3b82f6", TSLA: "#ef4444", NVDA: "#10b981", MSFT: "#06b6d4",
  AMZN: "#ff9900", GOOG: "#4285f4", META: "#1877f2",
  // Semiconduttori
  AMD: "#ed1c24", INTC: "#0071c5", AVGO: "#cc0000", TSM: "#e60012", MU: "#003da5",
  // Finanziari
  JPM: "#0c2340", GS: "#7399c6", BAC: "#012169", V: "#1a1f71", MA: "#eb001b",
  // Energia
  XOM: "#f97316", CVX: "#0066b2", COP: "#c41230", OXY: "#cf202e",
  // Difesa
  LMT: "#003366", RTX: "#00205b", NOC: "#003b71",
  // Healthcare
  JNJ: "#d51900", PFE: "#0093d0", LLY: "#d52b1e",
  // Retail / Consumer
  WMT: "#0071ce", COST: "#e31837", DIS: "#113ccf",
  // ETF macro
  GLD: "#eab308", SPY: "#78909c", QQQ: "#9575cd", XLE: "#ff8f00",
  XLF: "#5c6bc0", SLV: "#90a4ae", USO: "#6d4c41", TLT: "#26a69a",
  // Crypto
  "BTC-USD": "#f59e0b", "ETH-USD": "#8b5cf6",
  "SOL-USD": "#9945ff", "XRP-USD": "#00aae4", "DOGE-USD": "#c2a633",
};

/* ── helpers ──────────────────────────────────────────── */
function signalBadge(signal: string) {
  switch (signal) {
    case "BUY":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "SELL":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function returnColor(val: number) {
  if (val > 0) return "text-emerald-400";
  if (val < 0) return "text-red-400";
  return "text-zinc-400";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── StatCard ─────────────────────────────────────────── */
function StatCard({
  title,
  value,
  subtitle,
  color,
  explanation,
  formula,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: string;
  explanation: string;
  formula: string;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid",
        borderRadius: 16,
        padding: 20,
        position: "relative",
        transition: "border-color 0.2s",
        borderColor: showInfo
          ? "rgba(124,58,237,0.3)"
          : "rgba(255,255,255,0.07)",
      }}
    >
      <button
        onClick={() => setShowInfo(!showInfo)}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.15)",
          background: showInfo
            ? "rgba(124,58,237,0.3)"
            : "rgba(255,255,255,0.05)",
          color: showInfo ? "var(--accent-light)" : "var(--text-muted)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          lineHeight: 1,
        }}
      >
        i
      </button>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color,
          marginBottom: 4,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{subtitle}</div>

      <div
        style={{
          maxHeight: showInfo ? 300 : 0,
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: 12,
              color: "var(--accent-light)",
              marginBottom: 10,
              border: "1px solid rgba(124,58,237,0.2)",
              letterSpacing: "0.02em",
            }}
          >
            {formula}
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {explanation}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────── */
export default function PerformancePage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>("168h");
  const [equityData, setEquityData] = useState<EquityCurveData | null>(null);
  const [equityPeriod, setEquityPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

  useEffect(() => {
    fetch("/api/equity-curve")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setEquityData(d); })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/performance?ticker=${t}`);
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

  const stats = data?.stats ?? {
    total_signals: 0,
    hit_rate: 0,
    avg_score: 0,
    cumulative_score: 0,
    avg_return_168h: 0,
    positive_signals: 0,
    alpha: 0,
    best_signal: null,
    worst_signal: null,
  };
  const evaluations = data?.evaluations ?? [];
  const chartData = data?.chart_data ?? [];

  const currentStats = data?.horizons?.[horizon] ?? {
    count: 0,
    hit_rate: 0,
    avg_score: "0",
    avg_return: "0.00",
    chart_data: [],
    signals: [],
  };

  return (
    <div className="space-y-6">
      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
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

      {/* ── Horizon selector ─────────────────────────────── */}
      {data && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            ORIZZONTE
          </span>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as Horizon)}
            aria-label="Orizzonte temporale"
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: 10,
              color: "var(--accent-light)",
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.08em",
              padding: "8px 16px",
              cursor: "pointer",
              outline: "none",
              appearance: "none" as const,
              paddingRight: 32,
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a855f7' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            <option value="6h">6 ore</option>
            <option value="24h">24 ore</option>
            <option value="72h">72 ore (3 giorni)</option>
            <option value="168h">168 ore (7 giorni)</option>
          </select>

          {(["6h", "24h", "72h", "168h"] as const).map((h) => (
            <div
              key={h}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background:
                  (data?.horizons?.[h]?.count ?? 0) > 0
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  (data?.horizons?.[h]?.count ?? 0) > 0
                    ? "rgba(16,185,129,0.3)"
                    : "rgba(255,255,255,0.08)"
                }`,
                fontSize: 11,
                fontWeight: 700,
                color:
                  (data?.horizons?.[h]?.count ?? 0) > 0 ? "#10b981" : "var(--text-secondary)",
                fontFamily: "var(--font-barlow-condensed), sans-serif",
                letterSpacing: "0.06em",
              }}
            >
              {h}: {data?.horizons?.[h]?.count ?? 0}
            </div>
          ))}
        </div>
      )}

      {/* Header badges */}
      {data && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            BUY/SELL: <span className="font-bold">{currentStats.count}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Hit rate:{" "}
            <span
              className={`font-bold ${currentStats.hit_rate >= 50 ? "text-emerald-400" : "text-red-400"}`}
            >
              {currentStats.hit_rate}%
            </span>
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Score:{" "}
            <span
              className={`font-bold ${parseFloat(currentStats.avg_score) >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {parseFloat(currentStats.avg_score) >= 0 ? "+" : ""}
              {currentStats.avg_score}
            </span>
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Alpha:{" "}
            <span
              className={`font-bold ${stats.alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {stats.alpha >= 0 ? "+" : ""}
              {stats.alpha}%
            </span>
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border bg-card p-6">
          <div className="h-52 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-red-400 text-sm font-medium">Errore</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── SECTION 1: Stats Cards ──────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ alignItems: "start" }}>
            <StatCard
              title="Hit Rate"
              value={`${currentStats.hit_rate ?? 0}%`}
              subtitle={`${currentStats.count ?? 0} segnali BUY/SELL`}
              color={
                (currentStats.hit_rate ?? 0) >= 50 ? "#10b981" : "#ef4444"
              }
              formula="hit_rate = segnali_corretti / totale_segnali × 100"
              explanation="Percentuale di segnali BUY/SELL che hanno indovinato la direzione del prezzo. Un segnale SELL è 'corretto' se il prezzo è sceso nell'orizzonte considerato. Gli HOLD sono esclusi perché non sono trade azionabili. Sopra il 50% significa che il bot batte il caso."
            />
            <StatCard
              title="Avg Score"
              value={`${parseFloat(currentStats.avg_score) >= 0 ? "+" : ""}${currentStats.avg_score ?? 0}`}
              subtitle={`a ${HORIZON_LABELS[horizon]}`}
              color={
                parseFloat(currentStats.avg_score) >= 0
                  ? "#10b981"
                  : "#ef4444"
              }
              formula="score = (return × confidence) + direction_bonus"
              explanation="Misura la qualità del segnale pesata per la confidence. Il direction_bonus vale +1 se la direzione era giusta, -1 se era sbagliata. Un segnale SELL con 60% confidence che porta a -2% di prezzo = (0.02 × 0.6) + 1 = +1.012. Score positivo = segnale utile, negativo = dannoso."
            />
            <StatCard
              title="Avg Return"
              value={`${parseFloat(currentStats.avg_return) >= 0 ? "+" : ""}${currentStats.avg_return ?? 0}%`}
              subtitle={`a ${HORIZON_LABELS[horizon]}`}
              color={
                parseFloat(currentStats.avg_return) >= 0
                  ? "#10b981"
                  : "#ef4444"
              }
              formula="return = (prezzo_futuro - prezzo_entrata) / prezzo_entrata × 100"
              explanation="Variazione percentuale media del prezzo nell'orizzonte temporale selezionato. Per un segnale SELL, un return negativo è positivo (il prezzo è sceso come previsto). Non tiene conto delle commissioni o dello slippage — è il movimento grezzo del mercato."
            />
            <StatCard
              title="Alpha"
              value={`${stats.alpha >= 0 ? "+" : ""}${stats.alpha ?? 0}%`}
              subtitle="vs SPY"
              color={stats.alpha >= 0 ? "#10b981" : "#ef4444"}
              formula="alpha = return_segnale - return_SPY (stesso periodo)"
              explanation="Confronta il return del segnale con quello dell'indice S&P 500 (SPY) nello stesso periodo. Alpha positivo = il bot ha fatto meglio del mercato. Alpha negativo = meglio comprare un ETF passivo. È la metrica più importante per valutare se il sistema aggiunge valore reale rispetto al semplice buy&hold."
            />
          </div>

          {/* ── SECTION 2: Mini charts grid (4 horizons) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["6h", "24h", "72h", "168h"] as const).map((h) => {
              const hData = data?.horizons?.[h];
              const hChartData = hData?.chart_data ?? [];
              const hasData = hChartData.length > 0;
              const isSelected = h === horizon;

              return (
                <div
                  key={h}
                  role="button"
                  tabIndex={0}
                  onClick={() => setHorizon(h)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setHorizon(h)
                    }
                  }}
                  style={{
                    background: isSelected ? "var(--bg-card-hover)" : "var(--bg-card)",
                    border: `1px solid ${
                      isSelected
                        ? "rgba(124,58,237,0.4)"
                        : "rgba(255,255,255,0.07)"
                    }`,
                    borderRadius: 16,
                    padding: 16,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: isSelected
                      ? "0 0 20px rgba(124,58,237,0.15)"
                      : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontFamily: "var(--font-barlow-condensed), sans-serif",
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: isSelected ? "var(--accent-light)" : "var(--text-muted)",
                        }}
                      >
                        {h === "6h"
                          ? "6 ORE"
                          : h === "24h"
                            ? "24 ORE"
                            : h === "72h"
                              ? "72 ORE"
                              : "7 GIORNI"}
                      </span>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        {hData?.count ?? 0} BUY/SELL
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color:
                            (hData?.hit_rate ?? 0) >= 50
                              ? "#10b981"
                              : "#ef4444",
                        }}
                      >
                        {hData?.hit_rate ?? 0}%
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                        hit rate
                      </div>
                    </div>
                  </div>

                  {hasData ? (
                    <ResponsiveContainer width="100%" height={80}>
                      <AreaChart
                        data={hChartData}
                        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id={`grad_${h}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={isSelected ? "#7c3aed" : "#4a4a6a"}
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor={isSelected ? "#7c3aed" : "#4a4a6a"}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="cumulative_score"
                          stroke={isSelected ? "#a855f7" : "#4a4a6a"}
                          strokeWidth={isSelected ? 2 : 1}
                          fill={`url(#grad_${h})`}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      style={{
                        height: 80,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        fontStyle: "italic",
                      }}
                    >
                      In attesa di dati...
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── SECTION 3: Cumulative Score Chart ──────── */}
          {chartData.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold mb-4">
                Score Cumulativo vs SPY
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    interval={Math.max(
                      0,
                      Math.floor(chartData.length / 8),
                    )}
                  />
                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="cumulative_score"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Pipeline Score"
                  />
                  <Line
                    type="monotone"
                    dataKey="spy_cumulative"
                    stroke="#71717a"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    name="SPY Buy & Hold"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── SECTION 4: Evaluations Table ──────────── */}
          {evaluations.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b">
                <p className="text-sm font-semibold">
                  Ultimi Segnali Valutati
                </p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                        Data
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">
                        Segnale
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        Conf.
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        +6h
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        +24h
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        +72h
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        +7gg
                      </th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluations.map((ev) => (
                      <tr
                        key={ev.id}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {fmtDate(ev.entry_date)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${signalBadge(ev.signal_type)}`}
                          >
                            {ev.signal_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {Math.round(
                            ev.confidence > 1
                              ? ev.confidence
                              : ev.confidence * 100,
                          )}
                          %
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono ${returnColor(ev.return_6h)}`}
                        >
                          {ev.return_6h >= 0 ? "+" : ""}
                          {ev.return_6h}%
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono ${returnColor(ev.return_24h)}`}
                        >
                          {ev.return_24h >= 0 ? "+" : ""}
                          {ev.return_24h}%
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono ${returnColor(ev.return_72h)}`}
                        >
                          {ev.return_72h >= 0 ? "+" : ""}
                          {ev.return_72h}%
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-medium ${returnColor(ev.return_168h)}`}
                        >
                          {ev.return_168h >= 0 ? "+" : ""}
                          {ev.return_168h}%
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-bold ${returnColor(ev.score_168h)}`}
                        >
                          {ev.score_168h >= 0 ? "+" : ""}
                          {ev.score_168h}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SECTION 5: ML Walk-Forward Validation ── */}
          {data.ml_validation && (
            <div
              className={`rounded-xl border p-5 ${
                data.ml_validation.is_reliable
                  ? "bg-emerald-500/5 border-emerald-500/25"
                  : "bg-red-500/5 border-red-500/25"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">
                  Affidabilit&agrave; ML (Walk-Forward)
                </p>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    data.ml_validation.is_reliable
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {data.ml_validation.is_reliable
                    ? "Affidabile"
                    : "Non affidabile"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Accuracy media
                  </p>
                  <p className="text-lg font-bold font-mono">
                    {(data.ml_validation.avg_accuracy * 100).toFixed(1)}%
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      &plusmn;{" "}
                      {(data.ml_validation.std_accuracy * 100).toFixed(1)}%
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Range</p>
                  <p className="text-lg font-bold font-mono">
                    {(data.ml_validation.min_accuracy * 100).toFixed(1)}% -{" "}
                    {(data.ml_validation.max_accuracy * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Fold accuracies
                  </p>
                  <div className="flex items-end gap-0.5 h-6 mt-1">
                    {(data.ml_validation.fold_accuracies ?? []).map(
                      (acc, i) => (
                        <div
                          key={i}
                          className={`w-3 rounded-sm ${acc > 0.52 ? "bg-emerald-500" : "bg-red-500"}`}
                          style={{
                            height: `${Math.max(20, (acc - 0.4) * 200)}%`,
                          }}
                          title={`Fold ${i + 1}: ${(acc * 100).toFixed(1)}%`}
                        />
                      ),
                    )}
                  </div>
                </div>
              </div>
              {data.ml_validation.updated_at && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Ultimo aggiornamento:{" "}
                  {new Date(data.ml_validation.updated_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* ── SECTION 6: Status message ─────────────── */}
          {currentStats.count === 0 && (
            <div
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 12,
                padding: "16px 20px",
                color: "#f59e0b",
                fontSize: 14,
              }}
            >
              Segnali valutabili (BUY/SELL): 0 &mdash; Gli HOLD non vengono conteggiati nelle performance.
              Nessun segnale BUY/SELL valutato a {HORIZON_LABELS[horizon]}.
              {horizon === "6h" && " Disponibile ~6h dopo ogni run."}
              {horizon === "24h" && " Disponibile dal 20 marzo."}
              {horizon === "72h" && " Disponibile dal 22 marzo."}
              {horizon === "168h" && " Disponibile dal 26 marzo."}
            </div>
          )}
          {currentStats.count > 0 && currentStats.count < 10 && (
            <div
              className={`rounded-xl border p-5 bg-amber-500/5 border-amber-500/25`}
            >
              <p className="text-sm text-amber-400">
                Segnali valutabili (BUY/SELL): {currentStats.count} &mdash; Gli
                HOLD non vengono conteggiati. Servono almeno 10 segnali per
                risultati statisticamente significativi.
              </p>
            </div>
          )}
          {currentStats.count >= 10 && currentStats.count < 30 && (
            <div
              className={`rounded-xl border p-5 bg-zinc-500/5 border-zinc-500/25`}
            >
              <p className="text-sm text-muted-foreground">
                Segnali valutabili (BUY/SELL):{" "}
                <span className="font-bold text-foreground">
                  {currentStats.count}
                </span>{" "}
                a {HORIZON_LABELS[horizon]}. Gli HOLD non vengono conteggiati.
                Servono almeno 30 per un&apos;analisi affidabile.
              </p>
            </div>
          )}
          {currentStats.count >= 30 && (
            <div
              className={`rounded-xl border p-5 bg-emerald-500/5 border-emerald-500/25`}
            >
              <p className="text-sm text-emerald-400">
                Analisi statistica affidabile &mdash;{" "}
                <span className="font-bold">{currentStats.count}</span> segnali
                BUY/SELL valutati a {HORIZON_LABELS[horizon]}. Gli HOLD sono
                esclusi.
              </p>
            </div>
          )}
        </>
      )}

      {/* No data */}
      {!loading && !error && !data && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Nessun dato per{" "}
            <span className="font-mono font-medium">{ticker}</span>
          </p>
        </div>
      )}

      {/* ── EQUITY CURVES ──────────────────────────────────── */}
      {equityData && (() => {
        // Compute cutoff date for the selected period
        const cutoffDate = equityPeriod === "all"
          ? null
          : (() => {
              const d = new Date();
              d.setDate(d.getDate() - ({ "7d": 7, "30d": 30, "90d": 90 } as const)[equityPeriod]);
              return d.toISOString().slice(0, 10);
            })();

        return (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
            <h2 className="text-xl font-bold tracking-tight">Equity Curves</h2>
            <div className="flex gap-1.5">
              {([["7d", "7g"], ["30d", "30g"], ["90d", "90g"], ["all", "Tutto"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setEquityPeriod(val)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                    equityPeriod === val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(["6h", "24h", "72h", "168h"] as const).map((h) => {
              const horizonTickers = equityData[h] ?? {};
              const activeTickers = Object.keys(horizonTickers).filter(
                (t) => horizonTickers[t]?.length > 0,
              );

              // Filter by period and recalculate cumulative from $0
              const filteredByTicker: Record<string, EquityPoint[]> = {};
              for (const t of activeTickers) {
                const points = horizonTickers[t].filter(
                  (pt) => cutoffDate === null || pt.date >= cutoffDate,
                );
                if (points.length === 0) continue;
                let cum = 0;
                filteredByTicker[t] = points.map((pt) => {
                  cum += pt.pnl;
                  return { ...pt, cumulative_pnl: Math.round(cum * 100) / 100 };
                });
              }

              const filteredTickers = Object.keys(filteredByTicker);

              // Merge all ticker series into unified date-indexed array
              const dateMap = new Map<string, Record<string, number>>();
              for (const t of filteredTickers) {
                for (const pt of filteredByTicker[t]) {
                  if (!dateMap.has(pt.date)) dateMap.set(pt.date, {});
                  dateMap.get(pt.date)![t] = pt.cumulative_pnl;
                }
              }

              // Sort by date, forward-fill missing values
              const sortedDates = [...dateMap.keys()].sort();
              const lastVal: Record<string, number> = {};
              const merged = sortedDates.map((date) => {
                const row: Record<string, unknown> = { date };
                for (const t of filteredTickers) {
                  if (dateMap.get(date)![t] !== undefined) {
                    lastVal[t] = dateMap.get(date)![t];
                  }
                  row[t] = lastVal[t] ?? 0;
                }
                return row;
              });

              return (
                <div
                  key={h}
                  className="rounded-xl border bg-card p-5"
                >
                  <p className="text-sm font-semibold mb-4">
                    Equity Curve &mdash; {HORIZON_LABELS[h]}
                    {filteredTickers.length === 0 && (
                      <span className="text-muted-foreground font-normal ml-2">
                        (in attesa di dati)
                      </span>
                    )}
                  </p>
                  {merged.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={merged}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#6b6b85" }}
                          interval={Math.max(0, Math.floor(merged.length / 6))}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#6b6b85" }}
                          tickFormatter={(v: number) =>
                            `$${v >= 0 ? "+" : ""}${v.toFixed(0)}`
                          }
                        />
                        <ReferenceLine y={0} stroke="#4a4a6a" strokeDasharray="4 4" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#12122a",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 10,
                            fontSize: 11,
                          }}
                          formatter={(value: number, name: string) => {
                            return [`$${value >= 0 ? "+" : ""}${value.toFixed(2)}`, name];
                          }}
                          labelFormatter={(label: string) => `Data: ${label}`}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                        />
                        {filteredTickers.map((t) => (
                          <Line
                            key={t}
                            type="monotone"
                            dataKey={t}
                            stroke={TICKER_COLORS[t] ?? "#888"}
                            strokeWidth={2}
                            dot={false}
                            name={t}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      style={{
                        height: 240,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        fontStyle: "italic",
                      }}
                    >
                      Nessun segnale valutato a {HORIZON_LABELS[h]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
