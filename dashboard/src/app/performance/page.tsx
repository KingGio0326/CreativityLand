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
  ComposedChart,
  Bar,
} from "recharts";
import { TICKERS } from "@/lib/constants";
import TickerSelector from "@/components/TickerSelector";
import { signalBadgeClasses, returnColor } from "@/lib/signal-styles";

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
  "6h": "6 hours",
  "24h": "24 hours",
  "72h": "3 days",
  "168h": "7 days",
};

interface PortfolioPoint {
  date: string;
  portfolio_value: number;
  ticker: string;
  signal: string;
  pnl: number;
  allocated: number;
  position_size_pct: number;
  entry_price: number;
  exit_price: number;
}

interface EquityHorizon {
  portfolio: PortfolioPoint[];
  by_ticker: Record<string, number>;
}

type EquityCurveData = Record<string, EquityHorizon>;

interface SltpTrade {
  date: string;
  portfolio_value: number;
  ticker: string;
  signal: string;
  entry_price: number;
  exit_price: number;
  exit_reason: "sl" | "tp" | "trailing" | "horizon";
  pnl: number;
  allocated: number;
  position_size_pct: number;
  sl: number | null;
  tp: number | null;
  rr: number | null;
}

interface SltpStats {
  total_trades: number;
  final_value: number;
  return_pct: number;
  win_rate: number;
  sl_hits: number;
  tp_hits: number;
  trailing_hits: number;
  horizon_hits: number;
  sl_rate: number;
  tp_rate: number;
  avg_rr: number;
  best_trade: { ticker: string; pnl: number; pct: number } | null;
  worst_trade: { ticker: string; pnl: number; pct: number } | null;
}

interface SltpData {
  trades: SltpTrade[];
  stats: SltpStats;
}

const INITIAL_PORTFOLIO = 1000;

const TICKER_COLORS: Record<string, string> = {
  // Mega cap
  AAPL: "#3b82f6", TSLA: "#ef4444", NVDA: "#10b981", MSFT: "#06b6d4",
  AMZN: "#ff9900", GOOG: "#4285f4", META: "#1877f2",
  // Semiconductors
  AMD: "#ed1c24", INTC: "#0071c5", AVGO: "#cc0000", TSM: "#e60012", MU: "#003da5",
  // Financials
  JPM: "#0c2340", GS: "#7399c6", BAC: "#012169", V: "#1a1f71", MA: "#eb001b",
  // Energy
  XOM: "#f97316", CVX: "#0066b2", COP: "#c41230", OXY: "#cf202e",
  // Defense
  LMT: "#003366", RTX: "#00205b", NOC: "#003b71",
  // Healthcare
  JNJ: "#d51900", PFE: "#0093d0", LLY: "#d52b1e",
  // Retail / Consumer
  WMT: "#0071ce", COST: "#e31837", DIS: "#113ccf",
  // Macro ETFs
  GLD: "#eab308", SPY: "#78909c", QQQ: "#9575cd", XLE: "#ff8f00",
  XLF: "#5c6bc0", SLV: "#90a4ae", USO: "#6d4c41", TLT: "#26a69a",
  // Crypto
  "BTC-USD": "#f59e0b", "ETH-USD": "#8b5cf6",
  "SOL-USD": "#9945ff", "XRP-USD": "#00aae4", "DOGE-USD": "#c2a633",
};

/* ── helpers ──────────────────────────────────────────── */

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
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
  const [sltpData, setSltpData] = useState<SltpData | null>(null);

  useEffect(() => {
    fetch("/api/equity-curve")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setEquityData(d); })
      .catch(() => {});
    fetch("/api/equity-curve-sltp")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setSltpData(d); })
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
        <TickerSelector value={ticker} onChange={setTicker} />
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
            HORIZON
          </span>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as Horizon)}
            aria-label="Time horizon"
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
            <option value="6h">6 hours</option>
            <option value="24h">24 hours</option>
            <option value="72h">72 hours (3 days)</option>
            <option value="168h">168 hours (7 days)</option>
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
          <p className="text-red-400 text-sm font-medium">Error</p>
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
              subtitle={`${currentStats.count ?? 0} BUY/SELL signals`}
              color={
                (currentStats.hit_rate ?? 0) >= 50 ? "#10b981" : "#ef4444"
              }
              formula="hit_rate = correct_signals / total_signals × 100"
              explanation="Percentage of BUY/SELL signals that correctly predicted the price direction. A SELL signal is 'correct' if the price dropped within the selected horizon. HOLD signals are excluded as they are not actionable trades. Above 50% means the bot beats random chance."
            />
            <StatCard
              title="Avg Score"
              value={`${parseFloat(currentStats.avg_score) >= 0 ? "+" : ""}${currentStats.avg_score ?? 0}`}
              subtitle={`at ${HORIZON_LABELS[horizon]}`}
              color={
                parseFloat(currentStats.avg_score) >= 0
                  ? "#10b981"
                  : "#ef4444"
              }
              formula="score = (return × confidence) + direction_bonus"
              explanation="Measures signal quality weighted by confidence. The direction_bonus is +1 if the direction was correct, -1 if wrong. A SELL signal with 60% confidence leading to -2% price = (0.02 × 0.6) + 1 = +1.012. Positive score = useful signal, negative = harmful."
            />
            <StatCard
              title="Avg Return"
              value={`${parseFloat(currentStats.avg_return) >= 0 ? "+" : ""}${currentStats.avg_return ?? 0}%`}
              subtitle={`at ${HORIZON_LABELS[horizon]}`}
              color={
                parseFloat(currentStats.avg_return) >= 0
                  ? "#10b981"
                  : "#ef4444"
              }
              formula="return = (future_price - entry_price) / entry_price × 100"
              explanation="Average percentage price change over the selected time horizon. For a SELL signal, a negative return is positive (price dropped as predicted). Does not account for commissions or slippage — it is the raw market movement."
            />
            <StatCard
              title="Alpha"
              value={`${stats.alpha >= 0 ? "+" : ""}${stats.alpha ?? 0}%`}
              subtitle="vs SPY"
              color={stats.alpha >= 0 ? "#10b981" : "#ef4444"}
              formula="alpha = signal_return - SPY_return (same period)"
              explanation="Compares the signal return with the S&P 500 (SPY) return over the same period. Positive alpha = the bot outperformed the market. Negative alpha = better to buy a passive ETF. This is the most important metric to evaluate whether the system adds real value vs simple buy&hold."
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
                          ? "6 HOURS"
                          : h === "24h"
                            ? "24 HOURS"
                            : h === "72h"
                              ? "72 HOURS"
                              : "7 DAYS"}
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
                      Waiting for data...
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
                Cumulative Score vs SPY
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
                  Latest Evaluated Signals
                </p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs data-table">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">
                        Signal
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
                        +7d
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
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${signalBadgeClasses(ev.signal_type)}`}
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
                  ML Reliability (Walk-Forward)
                </p>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    data.ml_validation.is_reliable
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}
                >
                  {data.ml_validation.is_reliable
                    ? "Reliable"
                    : "Unreliable"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Avg Accuracy
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
                  Last updated:{" "}
                  {new Date(data.ml_validation.updated_at).toLocaleString("en-US")}
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
              Evaluable signals (BUY/SELL): 0 &mdash; HOLD signals are not counted in performance.
              No BUY/SELL signals evaluated at {HORIZON_LABELS[horizon]}.
              {horizon === "6h" && " Available ~6h after each run."}
              {horizon === "24h" && " Available ~24h after each run."}
              {horizon === "72h" && " Available ~3 days after each run."}
              {horizon === "168h" && " Available ~7 days after each run."}
            </div>
          )}
          {currentStats.count > 0 && currentStats.count < 10 && (
            <div
              className={`rounded-xl border p-5 bg-amber-500/5 border-amber-500/25`}
            >
              <p className="text-sm text-amber-400">
                Evaluable signals (BUY/SELL): {currentStats.count} &mdash; HOLD
                signals are not counted. At least 10 signals are needed for
                statistically significant results.
              </p>
            </div>
          )}
          {currentStats.count >= 10 && currentStats.count < 30 && (
            <div
              className={`rounded-xl border p-5 bg-zinc-500/5 border-zinc-500/25`}
            >
              <p className="text-sm text-muted-foreground">
                Evaluable signals (BUY/SELL):{" "}
                <span className="font-bold text-foreground">
                  {currentStats.count}
                </span>{" "}
                at {HORIZON_LABELS[horizon]}. HOLD signals are not counted.
                At least 30 are needed for reliable analysis.
              </p>
            </div>
          )}
          {currentStats.count >= 30 && (
            <div
              className={`rounded-xl border p-5 bg-emerald-500/5 border-emerald-500/25`}
            >
              <p className="text-sm text-emerald-400">
                Statistically reliable analysis &mdash;{" "}
                <span className="font-bold">{currentStats.count}</span> BUY/SELL
                signals evaluated at {HORIZON_LABELS[horizon]}. HOLD signals are
                excluded.
              </p>
            </div>
          )}
        </>
      )}

      {/* No data */}
      {!loading && !error && !data && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No data for{" "}
            <span className="font-mono font-medium">{ticker}</span>
          </p>
        </div>
      )}

      {/* ── EQUITY CURVES ──────────────────────────────────── */}
      {equityData && (() => {
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
            <h2 className="text-xl font-bold tracking-tight">Portfolio Simulation</h2>
            <div className="flex gap-1.5">
              {([["7d", "7d"], ["30d", "30d"], ["90d", "90d"], ["all", "All"]] as const).map(([val, label]) => (
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
              const horizonData = equityData[h];
              if (!horizonData) return null;

              const allPoints = horizonData.portfolio ?? [];
              const byTicker = horizonData.by_ticker ?? {};

              // Build full chart series (portfolio only, no per-ticker lines)
              const fullSeries = allPoints.map((pt) => ({
                date: pt.date,
                portfolio: pt.portfolio_value,
                _ticker: pt.ticker,
                _signal: pt.signal,
                _pnl: pt.pnl,
                _allocated: pt.allocated,
                _position_size_pct: pt.position_size_pct,
              }));

              // Filter display points by period (portfolio values stay correct)
              const chartPoints = cutoffDate
                ? fullSeries.filter((pt) => pt.date >= cutoffDate)
                : fullSeries;

              // Always show final portfolio value from the FULL series
              const finalValue = fullSeries.length > 0
                ? fullSeries[fullSeries.length - 1].portfolio
                : INITIAL_PORTFOLIO;
              const returnPct = ((finalValue - INITIAL_PORTFOLIO) / INITIAL_PORTFOLIO) * 100;

              // Sort tickers by absolute contribution for tags
              const sortedTickers = Object.keys(byTicker)
                .filter((t) => (byTicker[t] ?? 0) !== 0)
                .sort((a, b) => Math.abs(byTicker[b] ?? 0) - Math.abs(byTicker[a] ?? 0));

              return (
                <div key={h} className="rounded-xl border bg-card p-5">
                  {/* Header with portfolio value */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold">
                        Portfolio &mdash; {HORIZON_LABELS[h]}
                      </p>
                      {chartPoints.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          (waiting for data)
                        </span>
                      )}
                    </div>
                    {chartPoints.length > 0 && (
                      <div className="text-right">
                        <div
                          className="text-lg font-bold font-mono"
                          style={{
                            color: returnPct >= 0 ? "#10b981" : "#ef4444",
                          }}
                        >
                          ${finalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div
                          className="text-xs font-mono"
                          style={{
                            color: returnPct >= 0 ? "#10b981" : "#ef4444",
                          }}
                        >
                          {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {chartPoints.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartPoints}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#6b6b85" }}
                          interval={Math.max(0, Math.floor(chartPoints.length / 6))}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#6b6b85" }}
                          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                          domain={["dataMin - 10", "dataMax + 10"]}
                        />
                        <ReferenceLine
                          y={INITIAL_PORTFOLIO}
                          stroke="#4a4a6a"
                          strokeDasharray="4 4"
                          label={{
                            value: "$1,000",
                            position: "left",
                            fill: "#4a4a6a",
                            fontSize: 10,
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#12122a",
                            border: "1px solid rgba(139,92,246,0.3)",
                            borderRadius: 10,
                            fontSize: 11,
                            color: "#f0f0ff",
                          }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const portfolioEntry = payload.find((p) => p.dataKey === "portfolio");
                            const pt = portfolioEntry?.payload;
                            if (!pt) return null;
                            return (
                              <div
                                style={{
                                  backgroundColor: "#12122a",
                                  border: "1px solid rgba(139,92,246,0.3)",
                                  borderRadius: 10,
                                  padding: "10px 14px",
                                  fontSize: 11,
                                  color: "#f0f0ff",
                                  lineHeight: 1.8,
                                }}
                              >
                                <div style={{ fontWeight: 700, marginBottom: 4, color: "#8b8ba8" }}>
                                  {label}
                                </div>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>
                                  Portfolio: ${(pt.portfolio as number).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </div>
                                <div>
                                  Ticker: <span style={{ fontWeight: 600 }}>{pt._ticker}</span>
                                  {" "}&middot;{" "}
                                  <span style={{ color: pt._signal === "BUY" ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                                    {pt._signal}
                                  </span>
                                </div>
                                <div>
                                  Allocated: ${(pt._allocated as number).toFixed(2)}
                                  {" "}({(pt._position_size_pct as number).toFixed(1)}%)
                                </div>
                                <div style={{ color: (pt._pnl as number) >= 0 ? "#10b981" : "#ef4444" }}>
                                  P&L: {(pt._pnl as number) >= 0 ? "+" : ""}${(pt._pnl as number).toFixed(2)}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="portfolio"
                          stroke="#a855f7"
                          strokeWidth={3}
                          dot={false}
                          name="Total Portfolio"
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      style={{
                        height: 260,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        fontStyle: "italic",
                      }}
                    >
                      No signals evaluated at {HORIZON_LABELS[h]}
                    </div>
                  )}

                  {/* Top contributors */}
                  {sortedTickers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {sortedTickers.slice(0, 8).map((t) => {
                        const v = byTicker[t] ?? 0;
                        return (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-2 py-0.5 rounded border"
                            style={{
                              color: v >= 0 ? "#10b981" : "#ef4444",
                              borderColor: v >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
                              background: v >= 0 ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                            }}
                          >
                            {t} {v >= 0 ? "+" : ""}${v.toFixed(2)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* ── SL/TP MANAGED PORTFOLIO CHART ─────────────────── */}
      {sltpData && sltpData.trades.length > 0 && (() => {
        const cutoffDate = equityPeriod === "all"
          ? null
          : (() => {
              const d = new Date();
              d.setDate(d.getDate() - ({ "7d": 7, "30d": 30, "90d": 90 } as const)[equityPeriod]);
              return d.toISOString().slice(0, 10);
            })();

        const allTrades = sltpData.trades;
        const chartTrades = cutoffDate
          ? allTrades.filter((t) => t.date >= cutoffDate)
          : allTrades;

        const stats = sltpData.stats;
        const returnPct = stats.return_pct;

        const EXIT_COLORS: Record<string, string> = {
          sl: "#ef4444",
          tp: "#10b981",
          trailing: "#f59e0b",
          horizon: "#8b5cf6",
        };
        const EXIT_LABELS: Record<string, string> = {
          sl: "Stop Loss",
          tp: "Take Profit",
          trailing: "Trailing Stop",
          horizon: "Horizon Exit",
        };

        return (
          <div className="rounded-xl border bg-card p-5 mt-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold">
                  Portfolio &mdash; SL/TP Managed
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Simulated exits using ExitStrategyAgent levels
                </p>
              </div>
              {chartTrades.length > 0 && (
                <div className="text-right">
                  <div
                    className="text-lg font-bold font-mono"
                    style={{ color: returnPct >= 0 ? "#10b981" : "#ef4444" }}
                  >
                    ${stats.final_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className="text-xs font-mono"
                    style={{ color: returnPct >= 0 ? "#10b981" : "#ef4444" }}
                  >
                    {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            {/* Stats badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#10b981", borderColor: "rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.06)" }}>
                TP hit: {stats.tp_hits} ({stats.tp_rate}%)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)" }}>
                SL hit: {stats.sl_hits} ({stats.sl_rate}%)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.06)" }}>
                Trailing: {stats.trailing_hits}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#8b5cf6", borderColor: "rgba(139,92,246,0.25)", background: "rgba(139,92,246,0.06)" }}>
                Horizon: {stats.horizon_hits}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#e0e0ff", borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                Win rate: {stats.win_rate}%
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#e0e0ff", borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                Avg R:R {stats.avg_rr.toFixed(1)}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                style={{ color: "#e0e0ff", borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                Trades: {stats.total_trades}
              </span>
            </div>

            {/* Chart */}
            {chartTrades.length > 0 ? (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={chartTrades}>
                  <defs>
                    <linearGradient id="sltpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#6b6b85" }}
                    interval={Math.max(0, Math.floor(chartTrades.length / 8))}
                  />
                  <YAxis
                    yAxisId="portfolio"
                    tick={{ fontSize: 10, fill: "#6b6b85" }}
                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                    domain={["dataMin - 10", "dataMax + 10"]}
                  />
                  <YAxis
                    yAxisId="pnl"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#6b6b85" }}
                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                    hide
                  />
                  <ReferenceLine
                    yAxisId="portfolio"
                    y={INITIAL_PORTFOLIO}
                    stroke="#4a4a6a"
                    strokeDasharray="4 4"
                    label={{ value: "$1,000", position: "left", fill: "#4a4a6a", fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload as SltpTrade;
                      if (!pt) return null;
                      const reasonColor = EXIT_COLORS[pt.exit_reason] ?? "#888";
                      return (
                        <div
                          style={{
                            backgroundColor: "#12122a",
                            border: "1px solid rgba(139,92,246,0.3)",
                            borderRadius: 10,
                            padding: "10px 14px",
                            fontSize: 11,
                            color: "#f0f0ff",
                            lineHeight: 1.8,
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 4, color: "#8b8ba8" }}>
                            {pt.date}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            Portfolio: ${pt.portfolio_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </div>
                          <div>
                            <span style={{ fontWeight: 600 }}>{pt.ticker}</span>
                            {" "}&middot;{" "}
                            <span style={{ color: pt.signal === "BUY" ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                              {pt.signal}
                            </span>
                          </div>
                          <div>
                            Entry: ${pt.entry_price.toFixed(2)} → Exit: ${pt.exit_price.toFixed(2)}
                          </div>
                          <div style={{ color: reasonColor, fontWeight: 600 }}>
                            Exit: {EXIT_LABELS[pt.exit_reason] ?? pt.exit_reason}
                          </div>
                          <div>
                            Allocated: ${pt.allocated.toFixed(2)} ({pt.position_size_pct.toFixed(1)}%)
                          </div>
                          <div style={{ color: pt.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                            P&L: {pt.pnl >= 0 ? "+" : ""}${pt.pnl.toFixed(2)}
                          </div>
                          {pt.sl != null && (
                            <div style={{ fontSize: 10, color: "#ef4444" }}>
                              SL: ${pt.sl.toFixed(2)}
                            </div>
                          )}
                          {pt.tp != null && (
                            <div style={{ fontSize: 10, color: "#10b981" }}>
                              TP: ${pt.tp.toFixed(2)}
                            </div>
                          )}
                          {pt.rr != null && (
                            <div style={{ fontSize: 10, color: "#8b8ba8" }}>
                              R:R {pt.rr.toFixed(1)}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Portfolio line */}
                  <Area
                    yAxisId="portfolio"
                    type="monotone"
                    dataKey="portfolio_value"
                    stroke="#a855f7"
                    strokeWidth={3}
                    fill="url(#sltpGrad)"
                    dot={(props: Record<string, unknown>) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: SltpTrade };
                      if (!payload) return <></>;
                      const color = EXIT_COLORS[payload.exit_reason] ?? "#888";
                      const isSl = payload.exit_reason === "sl";
                      const isTp = payload.exit_reason === "tp";
                      // SL = down triangle, TP = up triangle, others = circle
                      if (isSl) {
                        return (
                          <polygon
                            key={`dot-${cx}-${cy}`}
                            points={`${cx},${cy + 5} ${cx - 4},${cy - 3} ${cx + 4},${cy - 3}`}
                            fill={color}
                            stroke="none"
                          />
                        );
                      }
                      if (isTp) {
                        return (
                          <polygon
                            key={`dot-${cx}-${cy}`}
                            points={`${cx},${cy - 5} ${cx - 4},${cy + 3} ${cx + 4},${cy + 3}`}
                            fill={color}
                            stroke="none"
                          />
                        );
                      }
                      return (
                        <circle
                          key={`dot-${cx}-${cy}`}
                          cx={cx}
                          cy={cy}
                          r={3}
                          fill={color}
                          stroke="none"
                        />
                      );
                    }}
                    name="Portfolio"
                  />
                  {/* P&L bars */}
                  <Bar
                    yAxisId="pnl"
                    dataKey="pnl"
                    name="Trade P&L"
                    maxBarSize={6}
                    opacity={0.5}
                    fill="#a855f7"
                    shape={(props: Record<string, unknown>) => {
                      const { x, y, width, height, payload } = props as {
                        x: number; y: number; width: number; height: number; payload: SltpTrade;
                      };
                      return (
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={Math.abs(height)}
                          fill={payload?.pnl >= 0 ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}
                          rx={1}
                        />
                      );
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: 340,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  fontStyle: "italic",
                }}
              >
                No SL/TP signals in selected period
              </div>
            )}

            {/* Exit reason legend */}
            <div className="flex flex-wrap gap-4 mt-3" style={{ fontSize: 10 }}>
              {Object.entries(EXIT_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div
                    style={{
                      width: key === "sl" ? 0 : key === "tp" ? 0 : 8,
                      height: key === "sl" ? 0 : key === "tp" ? 0 : 8,
                      borderRadius: key === "sl" || key === "tp" ? 0 : "50%",
                      background: key === "sl" || key === "tp" ? "transparent" : EXIT_COLORS[key],
                      borderLeft: key === "sl" ? "4px solid transparent" : key === "tp" ? "4px solid transparent" : "none",
                      borderRight: key === "sl" ? "4px solid transparent" : key === "tp" ? "4px solid transparent" : "none",
                      borderTop: key === "sl" ? `6px solid ${EXIT_COLORS[key]}` : "none",
                      borderBottom: key === "tp" ? `6px solid ${EXIT_COLORS[key]}` : "none",
                    }}
                  />
                  <span style={{ color: EXIT_COLORS[key] }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Best/Worst trade */}
            {(stats.best_trade || stats.worst_trade) && (
              <div className="flex gap-4 mt-3">
                {stats.best_trade && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                    style={{ color: "#10b981", borderColor: "rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.06)" }}>
                    Best: {stats.best_trade.ticker} +${stats.best_trade.pnl.toFixed(2)}
                  </span>
                )}
                {stats.worst_trade && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
                    style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)" }}>
                    Worst: {stats.worst_trade.ticker} ${stats.worst_trade.pnl.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
