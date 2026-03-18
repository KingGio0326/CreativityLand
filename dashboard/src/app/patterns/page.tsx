"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

const TICKERS = [
  "AAPL", "TSLA", "NVDA", "BTC-USD",
  "ETH-USD", "MSFT", "XOM", "GLD",
];

/* ── types ─────────────────────────────────────────────── */
interface OutcomeStats {
  mean: number;
  median: number;
  positive_rate: number;
  count: number;
}

interface SimilarPattern {
  start_date: string;
  end_date: string;
  prices: number[];
  outcome_5d: number | null;
  outcome_10d: number | null;
  outcome_20d: number | null;
  similarity: number;
}

interface PatternData {
  ticker: string;
  current: {
    prices: number[];
    dates: string[];
    current_price: number;
    change_30d_pct: number;
  };
  market_regime?: string;
  vix_approx?: number | null;
  spy_trend_30d?: number | null;
  similar: SimilarPattern[];
  analysis: {
    patterns_found: number;
    best_similarity: number;
    best_match_date: string | null;
    outcomes: {
      "5d": OutcomeStats | null;
      "10d": OutcomeStats | null;
      "20d": OutcomeStats | null;
    };
    recommendation: {
      signal: string;
      reason: string;
      mean_return?: number;
      positive_rate?: number;
      sample_size?: number;
    };
  };
  pipeline_signal: {
    signal: string | null;
    confidence: number | null;
    combined_signal: string;
  };
}

/* ── regime badge helper ────────────────────────────────── */
function regimeStyle(regime: string) {
  switch (regime) {
    case "bull":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "bear":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "sideways":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "volatile_bull":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function regimeLabel(regime: string) {
  switch (regime) {
    case "bull":
      return "Bull Market";
    case "bear":
      return "Bear Market";
    case "sideways":
      return "Sideways";
    case "volatile_bull":
      return "Volatile Bull";
    default:
      return "Unknown";
  }
}

/* ── signal color helpers ─────────────────────────────── */
function signalStyle(signal: string) {
  switch (signal) {
    case "STRONG BUY":
      return "bg-emerald-500 text-white border-emerald-400";
    case "BUY":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    case "STRONG SELL":
      return "bg-red-500 text-white border-red-400";
    case "SELL":
      return "bg-red-500/20 text-red-400 border-red-500/40";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/40";
  }
}

function signalDot(signal: string | null) {
  if (!signal) return "bg-zinc-500";
  if (signal.includes("BUY")) return "bg-emerald-500";
  if (signal.includes("SELL")) return "bg-red-500";
  return "bg-zinc-500";
}

/* ── format date for display ──────────────────────────── */
function fmtDate(d: string) {
  const p = new Date(d);
  return p.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function fmtDateFull(d: string) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ── portfolio types ───────────────────────────────────── */
interface Position {
  symbol: string;
  qty: number;
  side: string;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  change_today: number;
}

/* ── TradingPanel ─────────────────────────────────────── */
function TradingPanel({
  ticker,
  currentPrice,
}: {
  ticker: string;
  currentPrice: number;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(1);
  const [stopLossPct, setStopLossPct] = useState(3);
  const [takeProfitPct, setTakeProfitPct] = useState(8);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState(currentPrice);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setLimitPrice(currentPrice);
  }, [currentPrice]);

  const stopLossPrice =
    side === "buy"
      ? Math.round(currentPrice * (1 - stopLossPct / 100) * 100) / 100
      : Math.round(currentPrice * (1 + stopLossPct / 100) * 100) / 100;

  const takeProfitPrice =
    side === "buy"
      ? Math.round(currentPrice * (1 + takeProfitPct / 100) * 100) / 100
      : Math.round(currentPrice * (1 - takeProfitPct / 100) * 100) / 100;

  const riskPerShare = Math.abs(currentPrice - stopLossPrice);
  const rewardPerShare = Math.abs(takeProfitPrice - currentPrice);
  const maxRisk = Math.round(riskPerShare * qty * 100) / 100;
  const targetGain = Math.round(rewardPerShare * qty * 100) / 100;

  const handleSubmit = async () => {
    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          side,
          qty,
          stop_loss_pct: stopLossPct,
          take_profit_pct: takeProfitPct,
          order_type: orderType,
          limit_price: orderType === "limit" ? limitPrice : undefined,
          current_price: currentPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore ordine");
      setToast({
        type: "success",
        message: `Ordine eseguito: ${side.toUpperCase()} ${qty} ${ticker} | Stop Loss: $${data.stop_loss_price} | Take Profit: $${data.take_profit_price}`,
      });
    } catch (err) {
      setToast({ type: "error", message: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <p className="text-sm font-semibold">Esegui Ordine</p>
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          PAPER MODE
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Side + Qty */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Direzione</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSide("buy")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                  side === "buy"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setSide("sell")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                  side === "sell"
                    ? "bg-red-500/20 text-red-400 border-red-500/40"
                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                SELL
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Quantita</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Stop Loss slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Stop Loss</span>
            <span className="font-mono text-red-400">
              -{stopLossPct}% (${stopLossPrice})
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={stopLossPct}
            onChange={(e) => setStopLossPct(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-muted/40 accent-red-500"
          />
        </div>

        {/* Take Profit slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Take Profit</span>
            <span className="font-mono text-emerald-400">
              +{takeProfitPct}% (${takeProfitPrice})
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={takeProfitPct}
            onChange={(e) => setTakeProfitPct(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-muted/40 accent-emerald-500"
          />
        </div>

        {/* Order type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Tipo ordine</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOrderType("market")}
                className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  orderType === "market"
                    ? "bg-primary/10 text-foreground border-primary/40"
                    : "bg-muted/30 text-muted-foreground border-border"
                }`}
              >
                Market
              </button>
              <button
                onClick={() => setOrderType("limit")}
                className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  orderType === "limit"
                    ? "bg-primary/10 text-foreground border-primary/40"
                    : "bg-muted/30 text-muted-foreground border-border"
                }`}
              >
                Limit
              </button>
            </div>
          </div>
          {orderType === "limit" && (
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Prezzo limite</label>
              <input
                type="number"
                step={0.01}
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="rounded-lg bg-muted/20 border p-3 space-y-1 text-[11px]">
          <p className="font-medium text-foreground">
            {side.toUpperCase()} {qty} {ticker} @{" "}
            {orderType === "market" ? "Market" : `$${limitPrice}`}
          </p>
          <p className="text-muted-foreground">
            Stop Loss: <span className="font-mono text-red-400">${stopLossPrice}</span> (-
            {stopLossPct}%)
          </p>
          <p className="text-muted-foreground">
            Take Profit:{" "}
            <span className="font-mono text-emerald-400">${takeProfitPrice}</span> (+
            {takeProfitPct}%)
          </p>
          <div className="flex gap-4 pt-1 border-t border-border/50 mt-1">
            <p className="text-red-400 font-mono">
              Rischio max: -${maxRisk}
            </p>
            <p className="text-emerald-400 font-mono">
              Target: +${targetGain}
            </p>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all ${
            side === "buy"
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "bg-red-500 hover:bg-red-600 text-white"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {submitting ? "Invio in corso..." : "CONFERMA ORDINE"}
        </button>
        <p className="text-[10px] text-center text-amber-400/70">
          Paper Trading Mode — nessun denaro reale
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mx-5 mb-4 p-3 rounded-lg text-[11px] font-mono ${
            toast.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {toast.type === "success" ? "+" : "x"} {toast.message}
        </div>
      )}
    </div>
  );
}

/* ── PortfolioPanel ───────────────────────────────────── */
function PortfolioPanel() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setPositions(d.positions ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <p className="text-sm font-semibold">Portfolio Aperto</p>
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          PAPER MODE
        </span>
      </div>

      {loading && (
        <div className="p-5">
          <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      )}

      {error && (
        <div className="p-5 text-xs text-red-400">{error}</div>
      )}

      {!loading && !error && positions.length === 0 && (
        <div className="p-5 text-xs text-muted-foreground text-center">
          Nessuna posizione aperta
        </div>
      )}

      {!loading && !error && positions.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  Simbolo
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  Qty
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  Ingresso
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  Attuale
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  P&L
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  P&L %
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const plColor =
                  p.unrealized_pl >= 0 ? "text-emerald-400" : "text-red-400";
                return (
                  <tr
                    key={p.symbol}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-bold">{p.symbol}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {p.qty}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                      ${p.avg_entry_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      ${p.current_price.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono font-medium ${plColor}`}
                    >
                      {p.unrealized_pl >= 0 ? "+" : ""}$
                      {p.unrealized_pl.toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono font-medium ${plColor}`}
                    >
                      {p.unrealized_plpc >= 0 ? "+" : ""}
                      {(p.unrealized_plpc * 100).toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── page ──────────────────────────────────────────────── */
export default function PatternsPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/patterns?ticker=${t}`);
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

  const best = data?.similar?.[0] ?? null;
  const rec = data?.analysis?.recommendation;
  const combined = data?.pipeline_signal?.combined_signal ?? "HOLD";

  /* ── chart data ──────────────────────────────────────── */
  const currentChartData = data
    ? data.current.dates.map((d, i) => ({
        date: fmtDate(d),
        price: Math.round(data.current.prices[i] * 100) / 100,
      }))
    : [];

  const historicChartData = best?.prices
    ? best.prices.map((p, i) => ({
        day: i + 1,
        value: Math.round(p * 10000) / 10000,
      }))
    : [];

  // Overlay: both normalized from 0%
  const overlayData = data
    ? Array.from({ length: 30 }, (_, i) => {
        const base0 = data.current.prices[0];
        const currentNorm =
          ((data.current.prices[i] ?? data.current.prices[data.current.prices.length - 1]) - base0) /
          base0 * 100;
        const historicNorm = best?.prices ? best.prices[i] * 100 : null;
        return {
          day: i + 1,
          current: Math.round(currentNorm * 100) / 100,
          historic: historicNorm != null ? Math.round(historicNorm * 100) / 100 : null,
        };
      })
    : [];

  return (
    <div className="space-y-6">
      {/* ── SECTION 1: Header ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Pattern Matching</h1>
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

      {/* Signal badges + Regime */}
      {data && (
        <div className="flex items-center gap-4 flex-wrap">
          {/* Regime badge */}
          {data.market_regime && data.market_regime !== "unknown" && (
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-bold border ${regimeStyle(data.market_regime)}`}
            >
              {regimeLabel(data.market_regime)}
            </span>
          )}

          {/* Pipeline signal */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${signalDot(data.pipeline_signal.signal)}`} />
            <span className="text-muted-foreground">Pipeline:</span>
            <span className="font-bold">
              {data.pipeline_signal.signal ?? "N/A"}
            </span>
            {data.pipeline_signal.confidence != null && (
              <span className="font-mono text-muted-foreground">
                ({Math.round(data.pipeline_signal.confidence * 100)}%)
              </span>
            )}
          </div>

          {/* Pattern signal */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${signalDot(rec?.signal ?? null)}`} />
            <span className="text-muted-foreground">Pattern:</span>
            <span className="font-bold">{rec?.signal ?? "N/A"}</span>
          </div>

          {/* Combined signal — large badge */}
          <div className="ml-auto">
            <span
              className={`px-5 py-2 rounded-lg text-sm font-black tracking-wide border ${signalStyle(combined)}`}
            >
              {combined}
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-6">
            <div className="h-52 rounded-lg bg-muted/30 animate-pulse" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <div className="h-52 rounded-lg bg-muted/30 animate-pulse" />
          </div>
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
          {/* ── SECTION 2: Dual charts ─────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current pattern */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm font-semibold">Pattern Attuale</p>
                <p className="text-xs text-muted-foreground font-mono">
                  ${data.current.current_price}{" "}
                  <span
                    className={
                      data.current.change_30d_pct >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {data.current.change_30d_pct >= 0 ? "+" : ""}
                    {data.current.change_30d_pct}%
                  </span>
                </p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={currentChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v: number) => [`$${v}`, "Prezzo"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Best similar pattern */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm font-semibold">Pattern Storico Simile</p>
                {best && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Similarity:{" "}
                    <span className="text-foreground font-medium">
                      {(best.similarity * 100).toFixed(1)}%
                    </span>
                  </p>
                )}
              </div>
              {best ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={historicChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        label={{
                          value: "Giorno",
                          position: "insideBottomRight",
                          offset: -5,
                          style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "Rendimento"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[11px] text-muted-foreground text-center mt-2">
                    Periodo: {fmtDateFull(best.start_date)} — {fmtDateFull(best.end_date)}
                  </p>
                </>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  Nessun pattern storico trovato
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 3: Overlay ─────────────────────── */}
          {best && (
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold mb-4">Overlay Comparativo</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={overlayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v: number, name: string) => [
                      `${v.toFixed(2)}%`,
                      name === "current" ? "Attuale" : `Storico (${fmtDateFull(best.end_date)})`,
                    ]}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === "current"
                        ? "Attuale"
                        : `Storico (${fmtDateFull(best.end_date)})`
                    }
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="current"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="historic"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Regime context note ────────────────────── */}
          {data.market_regime && data.market_regime !== "unknown" && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span
                  className={`px-2.5 py-1 rounded-md font-bold border ${regimeStyle(data.market_regime)}`}
                >
                  {regimeLabel(data.market_regime)}
                </span>
                <span className="text-muted-foreground">
                  Pattern cercati in regime:{" "}
                  <span className="text-foreground font-medium">{data.market_regime}</span>
                </span>
                {data.vix_approx != null && (
                  <span className="text-muted-foreground">
                    VIX stimato:{" "}
                    <span className="text-foreground font-mono">{data.vix_approx}%</span>
                  </span>
                )}
                {data.spy_trend_30d != null && (
                  <span className="text-muted-foreground">
                    SPY trend 30gg:{" "}
                    <span
                      className={`font-mono font-medium ${
                        data.spy_trend_30d >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {data.spy_trend_30d >= 0 ? "+" : ""}
                      {data.spy_trend_30d}%
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 4: Outcome stats ───────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["5d", "10d", "20d"] as const).map((horizon) => {
              const s = data.analysis.outcomes[horizon];
              const label =
                horizon === "5d" ? "5 giorni" : horizon === "10d" ? "10 giorni" : "20 giorni";
              return (
                <div key={horizon} className="rounded-xl border bg-card p-5 space-y-3">
                  <p className="text-sm font-semibold">Orizzonte {label}</p>
                  {s ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Media</span>
                        <span
                          className={`font-mono font-medium ${
                            s.mean >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {s.mean >= 0 ? "+" : ""}
                          {s.mean}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Mediana</span>
                        <span
                          className={`font-mono font-medium ${
                            s.median >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {s.median >= 0 ? "+" : ""}
                          {s.median}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Casi positivi</span>
                        <span className="font-mono font-medium">{s.positive_rate}%</span>
                      </div>
                      {/* visual bar */}
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            s.positive_rate >= 60
                              ? "bg-emerald-500"
                              : s.positive_rate <= 40
                                ? "bg-red-500"
                                : "bg-zinc-500"
                          }`}
                          style={{ width: `${s.positive_rate}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Campione</span>
                        <span className="font-mono">{s.count} casi</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Dati insufficienti</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── SECTION 5: Recommendation box ──────────── */}
          {rec && (
            <div
              className={`rounded-xl border p-5 ${
                combined.includes("BUY")
                  ? "bg-emerald-500/5 border-emerald-500/25"
                  : combined.includes("SELL")
                    ? "bg-red-500/5 border-red-500/25"
                    : "bg-zinc-500/5 border-zinc-500/25"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`w-3 h-3 rounded-full ${signalDot(combined)}`}
                />
                <p className="text-sm font-bold">Raccomandazione</p>
                <span
                  className={`ml-auto px-3 py-1 rounded-full text-xs font-bold border ${signalStyle(combined)}`}
                >
                  {combined}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {rec.reason}
                {data.pipeline_signal.signal &&
                  rec.signal !== "HOLD" && (
                    <>
                      {" "}
                      Combinato con il segnale{" "}
                      <span className="font-semibold text-foreground">
                        {data.pipeline_signal.signal}
                      </span>{" "}
                      della pipeline, il sistema suggerisce{" "}
                      <span className="font-semibold text-foreground">{combined}</span>.
                    </>
                  )}
                {data.pipeline_signal.signal &&
                  rec.signal === "HOLD" && (
                    <>
                      {" "}
                      La pipeline indica{" "}
                      <span className="font-semibold text-foreground">
                        {data.pipeline_signal.signal}
                      </span>
                      , ma il pattern matching non conferma.
                    </>
                  )}
              </p>
            </div>
          )}

          {/* ── SECTION 6: Trading Panel + Portfolio ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TradingPanel
              ticker={ticker}
              currentPrice={data.current.current_price}
            />
            <PortfolioPanel />
          </div>
        </>
      )}

      {/* No data */}
      {!loading && !error && !data && (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Nessun dato per <span className="font-mono font-medium">{ticker}</span>
          </p>
        </div>
      )}
    </div>
  );
}
