"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { TICKERS } from "@/lib/constants";

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
  historical_prices_extended?: number[];
  historical_window?: number;
  reference_index?: number;
}

/* ── regime badge helper ────────────────────────────────── */
function regimeStyle(regime: string) {
  switch (regime) {
    case "bull":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "bear":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "crisis":
      return "bg-red-500/20 text-red-300 border-red-400/40";
    case "neutral":
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
    case "crisis":
      return "Crisis";
    case "neutral":
      return "Neutral";
    case "sideways":
      return "Sideways";
    case "volatile_bull":
      return "Volatile Bull";
    default:
      return "Unknown";
  }
}

/* ── parse prices (may arrive as JSON string) ────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePrices(prices: any): number[] {
  if (!prices) return [];
  if (Array.isArray(prices)) return prices;
  try { return JSON.parse(prices); }
  catch { return []; }
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

function fmtMonthYear(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function normalizeTo100(values: number[]): (number | null)[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => Math.round(((v - min) / range) * 10000) / 100);
}

/* ── Candlestick chart with real wicks ────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CandlestickChart({
  data,
  referenceIndex,
  totalLength,
}: {
  data: { value: number }[];
  referenceIndex?: number;
  totalLength?: number;
}) {
  const ohlc = data.map((d, i) => {
    const close = d.value;
    const prev = i > 0 ? data[i - 1].value : close;
    const open = prev;
    const change = close - open;
    const range = Math.abs(change) * 0.3 + Math.abs(close) * 0.002;
    const high = Math.max(open, close) + range * (0.4 + Math.random() * 0.6);
    const low = Math.min(open, close) - range * (0.4 + Math.random() * 0.6);
    return {
      name: i + 1,
      open,
      high,
      low,
      close,
      isUp: close >= open,
    };
  });

  const allPrices = ohlc.flatMap((d) => [d.high, d.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.05;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={ohlc}
        margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: "#4a4a6a", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={Math.floor(ohlc.length / 6)}
        />
        <YAxis
          domain={[minPrice - padding, maxPrice + padding]}
          tick={{ fill: "#4a4a6a", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v.toFixed(1)}`}
          width={55}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            return (
              <div
                style={{
                  background: "#0e0e1a",
                  border: "1px solid rgba(139,92,246,0.3)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  lineHeight: 1.8,
                }}
              >
                <div style={{ color: "#6b6b85", marginBottom: 4 }}>
                  Giorno {d.name}
                </div>
                <div style={{ color: "#10b981" }}>
                  O: {d.open?.toFixed(4)}
                </div>
                <div style={{ color: d.isUp ? "#10b981" : "#ef4444" }}>
                  C: {d.close?.toFixed(4)}
                </div>
                <div style={{ color: "#a855f7" }}>
                  H: {d.high?.toFixed(4)}
                </div>
                <div style={{ color: "#f59e0b" }}>
                  L: {d.low?.toFixed(4)}
                </div>
              </div>
            );
          }}
        />

        {referenceIndex !== undefined && (
          <ReferenceLine
            x={referenceIndex}
            stroke="#a855f7"
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{
              value: "\u25C0 ORA",
              position: "insideTopRight",
              fill: "#a855f7",
              fontSize: 11,
              fontWeight: 700,
            }}
          />
        )}
        {referenceIndex !== undefined && totalLength !== undefined && (
          <ReferenceArea
            x1={referenceIndex}
            x2={totalLength}
            fill="rgba(124,58,237,0.06)"
            stroke="rgba(124,58,237,0.1)"
            strokeDasharray="4 3"
          />
        )}

        <Bar
          dataKey="close"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          shape={(props: any) => {
            const { x, width, index } = props;
            const d = ohlc[index];
            if (!d || !width) return <g />;

            const domainMin = minPrice - padding;
            const domainMax = maxPrice + padding;
            const domainRange = domainMax - domainMin;

            // Get chart area from props.background
            const chartAreaY = props.background?.y ?? 10;
            const chartAreaH = props.background?.height ?? 260;

            const yScale = (val: number) =>
              chartAreaY +
              (1 - (val - domainMin) / domainRange) * chartAreaH;

            const highY = yScale(d.high);
            const lowY = yScale(d.low);
            const openY = yScale(d.open);
            const closeY = yScale(d.close);
            const bodyTopY = Math.min(openY, closeY);
            const bodyBottomY = Math.max(openY, closeY);
            const bodyHeight = Math.max(bodyBottomY - bodyTopY, 2);
            const centerX = x + width / 2;
            const candleW = Math.max(width * 0.6, 3);
            const color = d.isUp ? "#10b981" : "#ef4444";
            const wickColor = d.isUp ? "#22c55e" : "#f87171";

            return (
              <g key={index}>
                <line
                  x1={centerX}
                  y1={highY}
                  x2={centerX}
                  y2={bodyTopY}
                  stroke={wickColor}
                  strokeWidth={1.5}
                />
                <rect
                  x={centerX - candleW / 2}
                  y={bodyTopY}
                  width={candleW}
                  height={bodyHeight}
                  fill={color}
                  stroke={color}
                  strokeWidth={0.5}
                  rx={1}
                  opacity={0.9}
                />
                <line
                  x1={centerX}
                  y1={bodyBottomY}
                  x2={centerX}
                  y2={lowY}
                  stroke={wickColor}
                  strokeWidth={1.5}
                />
              </g>
            );
          }}
        >
          {ohlc.map((_, i) => (
            <Cell key={i} fill="transparent" />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
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
  const [kellySizing, setKellySizing] = useState<{
    suggested_pct: number;
    edge: number;
    win_rate: number;
  } | null>(null);

  useEffect(() => {
    setLimitPrice(currentPrice);
  }, [currentPrice]);

  useEffect(() => {
    fetch(`/api/agents-debug?ticker=${ticker}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.kelly_sizing) setKellySizing(d.kelly_sizing);
      })
      .catch(() => {});
  }, [ticker]);

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
    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(139,92,246,0.12)]">
        <p className="text-sm font-semibold flex items-center gap-2">
          <span>📊</span> Position Sizing
        </p>
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          PAPER MODE
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Side + Qty */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Direzione</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSide("buy")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                  side === "buy"
                    ? "bg-[rgba(16,185,129,0.2)] text-[#10b981] border-[rgba(16,185,129,0.4)]"
                    : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border-[rgba(139,92,246,0.12)] hover:bg-[rgba(255,255,255,0.08)]"
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setSide("sell")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                  side === "sell"
                    ? "bg-[rgba(239,68,68,0.2)] text-[#ef4444] border-[rgba(239,68,68,0.4)]"
                    : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border-[rgba(139,92,246,0.12)] hover:bg-[rgba(255,255,255,0.08)]"
                }`}
              >
                SELL
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Quantita</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border bg-[rgba(255,255,255,0.04)] border-[rgba(139,92,246,0.15)] focus:outline-none focus:ring-1 focus:ring-[#7c3aed]"
            />
          </div>
        </div>

        {/* Stop Loss slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Stop Loss</span>
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
            className="w-full h-1.5 rounded-full appearance-none bg-[rgba(255,255,255,0.06)] accent-[#ef4444]"
          />
        </div>

        {/* Take Profit slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Take Profit</span>
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
            className="w-full h-1.5 rounded-full appearance-none bg-[rgba(255,255,255,0.06)] accent-[#10b981]"
          />
        </div>

        {/* Kelly position sizing */}
        {kellySizing && (
          <div className="rounded-xl bg-[rgba(124,58,237,0.08)] border border-[rgba(139,92,246,0.2)] p-3 space-y-1 text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">
                Position sizing consigliato (Kelly)
              </span>
              <span className="text-2xl font-bold text-[#a855f7] font-mono">
                {kellySizing.suggested_pct}%
              </span>
            </div>
            <div className="flex gap-4 text-[var(--text-muted)]">
              <span>
                Edge:{" "}
                <span
                  className={`font-mono ${
                    kellySizing.edge > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {kellySizing.edge > 0 ? "+" : ""}
                  {kellySizing.edge.toFixed(3)}
                </span>
              </span>
              <span>
                Win rate:{" "}
                <span className="font-mono text-foreground">
                  {(kellySizing.win_rate * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Order type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Tipo ordine</label>
            <div className="flex gap-2">
              <button
                onClick={() => setOrderType("market")}
                className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  orderType === "market"
                    ? "bg-[rgba(124,58,237,0.15)] text-foreground border-[rgba(139,92,246,0.4)]"
                    : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border-[rgba(139,92,246,0.12)]"
                }`}
              >
                Market
              </button>
              <button
                onClick={() => setOrderType("limit")}
                className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                  orderType === "limit"
                    ? "bg-[rgba(124,58,237,0.15)] text-foreground border-[rgba(139,92,246,0.4)]"
                    : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border-[rgba(139,92,246,0.12)]"
                }`}
              >
                Limit
              </button>
            </div>
          </div>
          {orderType === "limit" && (
            <div className="space-y-1.5">
              <label className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">Prezzo limite</label>
              <input
                type="number"
                step={0.01}
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border bg-[rgba(255,255,255,0.04)] border-[rgba(139,92,246,0.15)] focus:outline-none focus:ring-1 focus:ring-[#7c3aed]"
              />
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="rounded-xl bg-[#07070f] border border-[rgba(139,92,246,0.12)] p-3 space-y-1 text-[11px]">
          <p className="font-medium text-foreground">
            {side.toUpperCase()} {qty} {ticker} @{" "}
            {orderType === "market" ? "Market" : `$${limitPrice}`}
          </p>
          <p className="text-[var(--text-muted)]">
            Stop Loss: <span className="font-mono text-red-400">${stopLossPrice}</span> (-
            {stopLossPct}%)
          </p>
          <p className="text-[var(--text-muted)]">
            Take Profit:{" "}
            <span className="font-mono text-emerald-400">${takeProfitPrice}</span> (+
            {takeProfitPct}%)
          </p>
          <div className="flex gap-4 pt-1 border-t border-[rgba(139,92,246,0.12)] mt-1">
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
              ? "bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-[0_4px_20px_rgba(16,185,129,0.3)]"
              : "bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white shadow-[0_4px_20px_rgba(239,68,68,0.3)]"
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
  const [closing, setClosing] = useState<string | null>(null);

  const fetchPortfolio = useCallback(() => {
    setLoading(true);
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setPositions(d.positions ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleClose = async (symbol: string) => {
    if (!confirm(`Chiudere posizione ${symbol}?`)) return;
    setClosing(symbol);
    try {
      const res = await fetch("/api/trade/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (res.ok) {
        fetchPortfolio();
      } else {
        const data = await res.json();
        alert(data.error ?? "Errore nella chiusura");
      }
    } catch {
      alert("Errore nella chiusura");
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(139,92,246,0.12)]">
        <p className="text-sm font-semibold">Portfolio Aperto</p>
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          PAPER MODE
        </span>
      </div>

      {loading && (
        <div className="p-5">
          <div className="h-16 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
        </div>
      )}

      {error && (
        <div className="p-5 text-xs text-red-400">{error}</div>
      )}

      {!loading && !error && positions.length === 0 && (
        <div className="p-5 text-xs text-[var(--text-muted)] text-center">
          Nessuna posizione aperta
        </div>
      )}

      {!loading && !error && positions.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[rgba(139,92,246,0.12)] bg-[rgba(255,255,255,0.03)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--text-muted)]">
                  Simbolo
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">
                  Qty
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">
                  Ingresso
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">
                  Attuale
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">
                  P&L
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]">
                  P&L %
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-[var(--text-muted)]" />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const plColor =
                  p.unrealized_pl >= 0 ? "text-emerald-400" : "text-red-400";
                return (
                  <tr
                    key={p.symbol}
                    className="border-b border-[rgba(139,92,246,0.12)] last:border-0 hover:bg-[rgba(124,58,237,0.05)] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-bold">{p.symbol}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {p.qty}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--text-muted)]">
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
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleClose(p.symbol)}
                        disabled={closing === p.symbol}
                        className="px-2 py-1 text-[10px] font-medium rounded border border-[rgba(239,68,68,0.3)] text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] transition-colors disabled:opacity-50"
                      >
                        {closing === p.symbol ? "..." : "Chiudi"}
                      </button>
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

/* ── Pattern Performance types ─────────────────────────── */
interface PatPerfData {
  has_data: boolean;
  total: number;
  hit_rate: number;
  avg_boost: number;
  by_regime: Record<string, { hit_rate: number; total: number }>;
  by_prediction: Record<string, { hit_rate: number; total: number }>;
  recent: {
    id: number;
    ticker: string;
    date: string;
    prediction: string;
    boost: number;
    patterns_matched: number;
    best_similarity: number;
    regime: string;
    regime_filtered: boolean;
    actual_return: number;
    correct: boolean;
  }[];
}

function hrColor(hr: number) {
  if (hr >= 60) return "text-emerald-400";
  if (hr >= 40) return "text-amber-400";
  return "text-red-400";
}
function hrBg(hr: number) {
  if (hr >= 60) return "bg-emerald-500";
  if (hr >= 40) return "bg-amber-500";
  return "bg-red-500";
}
function predIcon(p: string) {
  if (p === "bullish") return "\u2191";
  if (p === "bearish") return "\u2193";
  return "\u2194";
}
function predColor(p: string) {
  if (p === "bullish") return "text-emerald-400";
  if (p === "bearish") return "text-red-400";
  return "text-zinc-400";
}

/* ── Pattern Performance Section component ──────────────── */
function PatternPerformanceSection({ perfData }: { perfData: PatPerfData | null }) {
  if (!perfData) return null;

  if (!perfData.has_data) {
    return (
      <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.12)] p-6">
        <h2 className="text-lg font-bold tracking-tight mb-3">Pattern Matching Performance</h2>
        <div className="flex items-center gap-3 py-6 justify-center">
          <span className="text-2xl">&#9203;</span>
          <div>
            <p className="text-sm text-[var(--text-muted)]">
              Pattern evaluation in corso &mdash; i primi risultati saranno disponibili dal ~30 marzo
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">
              I pattern vengono valutati dopo 168h (7 giorni) dal segnale
            </p>
          </div>
        </div>
      </div>
    );
  }

  const regimeOrder = ["bull", "bear", "neutral", "crisis"];
  const regimeEntries = regimeOrder
    .filter((k) => perfData.by_regime[k])
    .map((k) => ({ regime: k, ...perfData.by_regime[k] }));

  // also include any regimes not in the standard order
  for (const [k, v] of Object.entries(perfData.by_regime)) {
    if (!regimeOrder.includes(k)) {
      regimeEntries.push({ regime: k, ...v });
    }
  }

  const predEntries = Object.entries(perfData.by_prediction).map(([k, v]) => ({
    prediction: k,
    ...v,
  }));

  const regimeChartData = regimeEntries.map((e) => ({
    name: e.regime.charAt(0).toUpperCase() + e.regime.slice(1),
    hit_rate: e.hit_rate,
    count: e.total,
  }));

  return (
    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.12)] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Pattern Matching Performance</h2>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {perfData.total} valutazioni
        </span>
      </div>

      {/* ── Stats row ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Hit Rate */}
        <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(139,92,246,0.1)] p-4 text-center">
          <p className="text-xs text-[var(--text-muted)] barlow uppercase tracking-wider mb-1">Hit Rate</p>
          <p className={`text-3xl font-bold font-mono ${hrColor(perfData.hit_rate)}`}>
            {perfData.hit_rate}%
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
            <div
              className={`h-full rounded-full ${hrBg(perfData.hit_rate)}`}
              style={{ width: `${perfData.hit_rate}%` }}
            />
          </div>
        </div>

        {/* Avg Boost */}
        <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(139,92,246,0.1)] p-4 text-center">
          <p className="text-xs text-[var(--text-muted)] barlow uppercase tracking-wider mb-1">Avg Boost</p>
          <p className="text-3xl font-bold font-mono text-[#a855f7]">
            {perfData.avg_boost.toFixed(1)}%
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">confidenza</p>
        </div>

        {/* Prediction breakdown */}
        {predEntries
          .filter((e) => e.prediction !== "neutral")
          .map((e) => (
            <div
              key={e.prediction}
              className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(139,92,246,0.1)] p-4 text-center"
            >
              <p className="text-xs text-[var(--text-muted)] barlow uppercase tracking-wider mb-1">
                {e.prediction === "bullish" ? "Bullish Acc." : "Bearish Acc."}
              </p>
              <p className={`text-3xl font-bold font-mono ${hrColor(e.hit_rate)}`}>
                {e.hit_rate}%
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                {e.total} segnali
              </p>
            </div>
          ))}
      </div>

      {/* ── Regime chart ──────────────────────────────── */}
      {regimeChartData.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-muted)] barlow uppercase tracking-wider mb-3">
            Hit Rate per Regime
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regimeChartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#8884d8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#4a4a6a", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: "#12122a",
                    border: "1px solid rgba(139,92,246,0.3)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, _name: string, props: { payload: { count: number } }) => [
                    `${value}% (${props.payload.count} pattern)`,
                    "Hit Rate",
                  ]}
                />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                <Bar dataKey="hit_rate" radius={[6, 6, 0, 0]}>
                  {regimeChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.hit_rate >= 60
                          ? "#10b981"
                          : entry.hit_rate >= 40
                            ? "#f59e0b"
                            : "#ef4444"
                      }
                      fillOpacity={0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Recent evaluations table ──────────────────── */}
      {perfData.recent.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-muted)] barlow uppercase tracking-wider mb-3">
            Ultime Valutazioni
          </p>
          <div className="overflow-x-auto rounded-xl border border-[rgba(139,92,246,0.1)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[rgba(139,92,246,0.1)] text-[var(--text-muted)]">
                  <th className="px-3 py-2 text-left font-medium">Ticker</th>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                  <th className="px-3 py-2 text-center font-medium">Pred.</th>
                  <th className="px-3 py-2 text-right font-medium">Boost</th>
                  <th className="px-3 py-2 text-center font-medium">Regime</th>
                  <th className="px-3 py-2 text-right font-medium">Return 7d</th>
                  <th className="px-3 py-2 text-center font-medium">Esito</th>
                </tr>
              </thead>
              <tbody>
                {perfData.recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[rgba(139,92,246,0.06)] hover:bg-[rgba(139,92,246,0.04)] transition-colors"
                  >
                    <td className="px-3 py-2 font-mono font-medium">{r.ticker}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {new Date(r.date).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className={`px-3 py-2 text-center font-bold ${predColor(r.prediction)}`}>
                      {predIcon(r.prediction)} {r.prediction}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.boost > 0 ? (
                        <span className="text-emerald-400">+{(r.boost * 100).toFixed(0)}%</span>
                      ) : r.boost < 0 ? (
                        <span className="text-red-400">{(r.boost * 100).toFixed(0)}%</span>
                      ) : (
                        <span className="text-zinc-500">0%</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${regimeStyle(r.regime)}`}
                      >
                        {r.regime}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={r.actual_return >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {r.actual_return >= 0 ? "+" : ""}
                        {r.actual_return.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-base">
                      {r.correct ? "\u2705" : "\u274c"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const [chartType, setChartType] = useState<"candle" | "line" | "area">("candle");
  const [perfData, setPerfData] = useState<PatPerfData | null>(null);

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

  // Fetch pattern performance (once, not per ticker)
  useEffect(() => {
    fetch("/api/patterns-performance")
      .then((r) => r.json())
      .then((d) => setPerfData(d))
      .catch(() => setPerfData(null));
  }, []);

  const best = data?.similar?.[0] ?? null;
  const rec = data?.analysis?.recommendation;
  const combined = data?.pipeline_signal?.combined_signal ?? "HOLD";

  /* ── chart data ──────────────────────────────────────── */
  const currentPrices = parsePrices(data?.current?.prices);
  const currentDates = data?.current?.dates ?? [];
  const similarList = data?.similar ?? [];
  const bestPrices = parsePrices(best?.prices);
  const match2 = similarList[1] ?? null;
  const match3 = similarList[2] ?? null;
  const match2Prices = parsePrices(match2?.prices);
  const match3Prices = parsePrices(match3?.prices);

  const currentChartData = currentDates.map((d, i) => ({
    date: fmtDate(d),
    price: Math.round((currentPrices[i] ?? 0) * 100) / 100,
  }));

  // Historical pattern — use extended prices from API if available, fallback to pattern_vector
  const currentLength = currentPrices.length;
  const extendedPrices = parsePrices(data?.historical_prices_extended);
  const historicalPrices = extendedPrices.length > bestPrices.length
    ? extendedPrices
    : bestPrices;
  const historicalLength = historicalPrices.length;

  const historicChartData = historicalPrices.map((p, i) => ({
    day: i + 1,
    value: Math.round(p * 10000) / 10000,
  }));

  // Overlay: all series normalized to 0-100 scale
  const curNorm = normalizeTo100(currentPrices);
  const m1Norm = normalizeTo100(bestPrices);
  const m2Norm = normalizeTo100(match2Prices);
  const m3Norm = normalizeTo100(match3Prices);

  const overlayData =
    currentPrices.length > 0
      ? Array.from({ length: 30 }, (_, i) => ({
          day: i + 1,
          current: curNorm[i] ?? null,
          match1: m1Norm[i] ?? null,
          match2: m2Norm[i] ?? null,
          match3: m3Norm[i] ?? null,
        }))
      : [];

  // Consensus stats
  const allMatches = [best, match2, match3].filter(Boolean) as SimilarPattern[];
  const positiveCount5d = allMatches.filter((m) => (m.outcome_5d ?? 0) > 0).length;
  const positiveCount10d = allMatches.filter((m) => (m.outcome_10d ?? 0) > 0).length;
  const positiveCount20d = allMatches.filter((m) => (m.outcome_20d ?? 0) > 0).length;
  const avg = (vals: number[]) => vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  const avgReturn5d = avg(allMatches.filter((m) => m.outcome_5d != null).map((m) => m.outcome_5d!));
  const avgReturn10d = avg(allMatches.filter((m) => m.outcome_10d != null).map((m) => m.outcome_10d!));
  const avgReturn20d = avg(allMatches.filter((m) => m.outcome_20d != null).map((m) => m.outcome_20d!));

  return (
    <div className="space-y-6">
      {/* ── SECTION 1: Header ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Pattern Matching</h1>
          {best && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[rgba(124,58,237,0.15)] text-[#a855f7] border border-[rgba(124,58,237,0.3)]">
              sim {(best.similarity * 100).toFixed(0)}%
            </span>
          )}
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

      {/* Signal badges + Regime */}
      {data && (
        <div className="card-gradient rounded-2xl p-4 border border-[rgba(139,92,246,0.2)]">
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
              <span className={`w-2 h-2 rounded-full ${signalDot(data?.pipeline_signal?.signal ?? null)}`} />
              <span className="text-[var(--text-muted)]">Pipeline:</span>
              <span className="font-bold">
                {data?.pipeline_signal?.signal ?? "N/A"}
              </span>
              {data?.pipeline_signal?.confidence != null && (
                <span className="font-mono text-[var(--text-muted)]">
                  ({Math.round(data.pipeline_signal.confidence * 100)}%)
                </span>
              )}
            </div>

            {/* Pattern signal */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${signalDot(rec?.signal ?? null)}`} />
              <span className="text-[var(--text-muted)]">Pattern:</span>
              <span className="font-bold">{rec?.signal ?? "N/A"}</span>
            </div>

            {/* Combined signal — large badge */}
            <div className="ml-auto">
              <span
                className={`px-5 py-2 rounded-lg text-sm font-black tracking-wide border shadow-[0_0_16px_rgba(124,58,237,0.2)] ${signalStyle(combined)}`}
              >
                {combined}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card-gradient rounded-2xl p-6">
            <div className="h-52 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
          </div>
          <div className="card-gradient rounded-2xl p-6">
            <div className="h-52 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] p-5">
          <p className="text-red-400 text-sm font-medium">Errore</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Chart type switcher ──────────────────── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["candle", "line", "area"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  border: "1px solid",
                  borderColor: chartType === type ? "#7c3aed" : "rgba(255,255,255,0.1)",
                  background: chartType === type ? "rgba(124,58,237,0.2)" : "transparent",
                  color: chartType === type ? "#a855f7" : "#6b6b85",
                  fontFamily: "var(--font-barlow-condensed), sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {type === "candle" ? "Candele" : type === "line" ? "Linea" : "Area"}
              </button>
            ))}
          </div>

          {/* ── SECTION 2: Dual charts ─────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current pattern */}
            <div style={{ background: "rgba(7,7,15,0.8)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 16, padding: 20 }}>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm font-semibold">Pattern Attuale</p>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  ${data?.current?.current_price ?? 0}{" "}
                  <span
                    className={
                      (data?.current?.change_30d_pct ?? 0) >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {(data?.current?.change_30d_pct ?? 0) >= 0 ? "+" : ""}
                    {data?.current?.change_30d_pct ?? 0}%
                  </span>
                </p>
              </div>
              {chartType === "candle" ? (
                <div style={{ height: 280 }}>
                  <CandlestickChart
                    data={currentChartData.map((d) => ({ value: d.price }))}
                  />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  {chartType === "area" ? (
                    <AreaChart data={currentChartData}>
                      <defs>
                        <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4a4a6a" }} interval={4} />
                      <YAxis tick={{ fontSize: 10, fill: "#4a4a6a" }} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v}`} />
                      <Tooltip contentStyle={{ backgroundColor: "#12122a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", color: "#f0f0ff", fontSize: "12px" }} formatter={(v: number) => [`$${v}`, "Prezzo"]} />
                      <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#gradCurrent)" />
                    </AreaChart>
                  ) : (
                    <LineChart data={currentChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4a4a6a" }} interval={4} />
                      <YAxis tick={{ fontSize: 10, fill: "#4a4a6a" }} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v}`} />
                      <Tooltip contentStyle={{ backgroundColor: "#12122a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", color: "#f0f0ff", fontSize: "12px" }} formatter={(v: number) => [`$${v}`, "Prezzo"]} />
                      <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>

            {/* Best similar pattern */}
            <div style={{ background: "rgba(7,7,15,0.8)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 16, padding: 20 }}>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-sm font-semibold">Pattern Storico Simile — {historicalLength} giorni</p>
                {best && (
                  <p className="text-xs text-[var(--text-muted)] font-mono">
                    Similarity:{" "}
                    <span className="text-foreground font-medium">
                      {(best.similarity * 100).toFixed(1)}%
                    </span>
                  </p>
                )}
              </div>
              {best ? (
                <>
                  {chartType === "candle" ? (
                    <div style={{ height: 280 }}>
                      <CandlestickChart
                        data={historicChartData.map((d) => ({ value: d.value }))}
                        referenceIndex={currentLength}
                        totalLength={historicalLength}
                      />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      {chartType === "area" ? (
                        <AreaChart data={historicChartData}>
                          <defs>
                            <linearGradient id="gradHistoric" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#4a4a6a" }} label={{ value: "Giorno", position: "insideBottomRight", offset: -5, style: { fontSize: 10, fill: "#4a4a6a" } }} />
                          <YAxis tick={{ fontSize: 10, fill: "#4a4a6a" }} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                          <Tooltip contentStyle={{ backgroundColor: "#12122a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", color: "#f0f0ff", fontSize: "12px" }} formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "Rendimento"]} />
                          <ReferenceLine x={currentLength} stroke="#a855f7" strokeDasharray="5 3" strokeWidth={2} label={{ value: "\u25C0 ORA", position: "insideTopRight", fill: "#a855f7", fontSize: 11, fontWeight: 700 }} />
                          <ReferenceArea x1={currentLength} x2={historicalLength} fill="rgba(124,58,237,0.06)" stroke="rgba(124,58,237,0.1)" strokeDasharray="4 3" />
                          <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} fill="url(#gradHistoric)" />
                        </AreaChart>
                      ) : (
                        <LineChart data={historicChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#4a4a6a" }} label={{ value: "Giorno", position: "insideBottomRight", offset: -5, style: { fontSize: 10, fill: "#4a4a6a" } }} />
                          <YAxis tick={{ fontSize: 10, fill: "#4a4a6a" }} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                          <Tooltip contentStyle={{ backgroundColor: "#12122a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", color: "#f0f0ff", fontSize: "12px" }} formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "Rendimento"]} />
                          <ReferenceLine x={currentLength} stroke="#a855f7" strokeDasharray="5 3" strokeWidth={2} label={{ value: "\u25C0 ORA", position: "insideTopRight", fill: "#a855f7", fontSize: 11, fontWeight: 700 }} />
                          <ReferenceArea x1={currentLength} x2={historicalLength} fill="rgba(124,58,237,0.06)" stroke="rgba(124,58,237,0.1)" strokeDasharray="4 3" />
                          <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={false} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  )}
                  <p className="text-[11px] text-[var(--text-muted)] text-center mt-2">
                    Periodo: {fmtDateFull(best.start_date)} — {fmtDateFull(best.end_date)}
                  </p>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-[var(--text-muted)]">
                  Nessun pattern storico trovato
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 3: Overlay top 3 patterns ────── */}
          {best && (
            <>
              <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-5">
                <p className="text-sm font-semibold mb-4">Overlay Comparativo — Top 3 Pattern</p>
                {/* Custom legend */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[rgba(59,130,246,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                    <span className="text-[#3b82f6]">Attuale</span>
                  </span>
                  {best && <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[rgba(245,158,11,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                    <span className="text-[#f59e0b]">Match #1 — {(best.similarity * 100).toFixed(0)}%</span>
                  </span>}
                  {match2 && <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[rgba(16,185,129,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                    <span className="text-[#10b981]">Match #2 — {(match2.similarity * 100).toFixed(0)}%</span>
                  </span>}
                  {match3 && <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[rgba(139,92,246,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                    <span className="text-[#8b5cf6]">Match #3 — {(match3.similarity * 100).toFixed(0)}%</span>
                  </span>}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={overlayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "#4a4a6a" }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#4a4a6a" }}
                      domain={[0, 100]}
                      tickFormatter={(v: number) => `${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#12122a",
                        border: "1px solid rgba(139,92,246,0.3)",
                        borderRadius: "8px",
                        color: "#f0f0ff",
                        fontSize: "12px",
                      }}
                      formatter={(v: number, name: string) => {
                        const label =
                          name === "current" ? "Attuale"
                            : name === "match1" ? "Match #1"
                              : name === "match2" ? "Match #2"
                                : "Match #3";
                        return [v != null ? v.toFixed(1) : "—", label];
                      }}
                    />
                    <Line type="monotone" dataKey="current" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="match1" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    {match2 && (
                      <Line type="monotone" dataKey="match2" stroke="#10B981" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    )}
                    {match3 && (
                      <Line type="monotone" dataKey="match3" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Consensus storico ──────────────────────── */}
              {allMatches.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Consensus Storico</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-4 space-y-1">
                      <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">5 giorni</p>
                      <p className={`text-2xl font-bold font-mono ${positiveCount5d > allMatches.length / 2 ? "text-emerald-400" : positiveCount5d < allMatches.length / 2 ? "text-red-400" : "text-zinc-400"}`}>
                        {positiveCount5d}/{allMatches.length} rialzo
                      </p>
                      {avgReturn5d != null && (
                        <p className={`text-xs font-mono ${avgReturn5d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          media: {avgReturn5d >= 0 ? "+" : ""}{avgReturn5d}%
                        </p>
                      )}
                    </div>
                    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-4 space-y-1">
                      <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">10 giorni</p>
                      <p className={`text-2xl font-bold font-mono ${positiveCount10d > allMatches.length / 2 ? "text-emerald-400" : positiveCount10d < allMatches.length / 2 ? "text-red-400" : "text-zinc-400"}`}>
                        {positiveCount10d}/{allMatches.length} rialzo
                      </p>
                      {avgReturn10d != null && (
                        <p className={`text-xs font-mono ${avgReturn10d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          media: {avgReturn10d >= 0 ? "+" : ""}{avgReturn10d}%
                        </p>
                      )}
                    </div>
                    <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-4 space-y-1">
                      <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">20 giorni</p>
                      <p className={`text-2xl font-bold font-mono ${positiveCount20d > allMatches.length / 2 ? "text-emerald-400" : positiveCount20d < allMatches.length / 2 ? "text-red-400" : "text-zinc-400"}`}>
                        {positiveCount20d}/{allMatches.length} rialzo
                      </p>
                      {avgReturn20d != null && (
                        <p className={`text-xs font-mono ${avgReturn20d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          media: {avgReturn20d >= 0 ? "+" : ""}{avgReturn20d}%
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {positiveCount5d === allMatches.length
                      ? `Tutti i ${allMatches.length} pattern storici simili hanno portato a un rialzo nei 5gg successivi`
                      : positiveCount5d === 0
                        ? `Nessuno dei ${allMatches.length} pattern storici simili ha portato a un rialzo nei 5gg successivi`
                        : `${positiveCount5d}/${allMatches.length} pattern storici simili hanno portato a un rialzo nei 5gg successivi`}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Regime context note ────────────────────── */}
          {data.market_regime && data.market_regime !== "unknown" && (
            <div className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-4">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span
                  className={`px-2.5 py-1 rounded-md font-bold border ${regimeStyle(data.market_regime)}`}
                >
                  {regimeLabel(data.market_regime)}
                </span>
                <span className="text-[var(--text-muted)]">
                  Pattern cercati in regime:{" "}
                  <span className="text-foreground font-medium">{data.market_regime}</span>
                </span>
                {data.vix_approx != null && (
                  <span className="text-[var(--text-muted)]">
                    VIX stimato:{" "}
                    <span className="text-foreground font-mono">{data.vix_approx}%</span>
                  </span>
                )}
                {data.spy_trend_30d != null && (
                  <span className="text-[var(--text-muted)]">
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
              const s = data?.analysis?.outcomes?.[horizon] ?? null;
              const label =
                horizon === "5d" ? "5 giorni" : horizon === "10d" ? "10 giorni" : "20 giorni";
              return (
                <div key={horizon} className="card-gradient rounded-2xl border border-[rgba(139,92,246,0.2)] p-5 space-y-3">
                  <p className="text-sm font-semibold">Orizzonte {label}</p>
                  {s ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">Media</span>
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
                        <span className="text-[var(--text-muted)]">Mediana</span>
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
                        <span className="text-[var(--text-muted)]">Casi positivi</span>
                        <span className="font-mono font-medium">{s.positive_rate}%</span>
                      </div>
                      {/* visual bar */}
                      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${s.positive_rate}%`,
                            background: s.positive_rate >= 60
                              ? "linear-gradient(90deg, #7c3aed, #a855f7)"
                              : s.positive_rate <= 40
                                ? "#ef4444"
                                : "#71717a",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">Campione</span>
                        <span className="font-mono">{s.count} casi</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">Dati insufficienti</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── SECTION 5: Recommendation box ──────────── */}
          {rec && (
            <div
              className={`rounded-2xl border p-5 ${
                combined.includes("BUY")
                  ? "bg-[rgba(16,185,129,0.05)] border-[rgba(16,185,129,0.2)]"
                  : combined.includes("SELL")
                    ? "bg-[rgba(239,68,68,0.05)] border-[rgba(239,68,68,0.2)]"
                    : "bg-[rgba(255,255,255,0.03)] border-[rgba(139,92,246,0.15)]"
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
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {rec.reason}
                {data?.pipeline_signal?.signal &&
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
                {data?.pipeline_signal?.signal &&
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

          {/* ── SECTION 5b: Pattern Performance ────────── */}
          <PatternPerformanceSection perfData={perfData} />

          {/* ── SECTION 6: Trading Panel + Portfolio ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TradingPanel
              ticker={ticker}
              currentPrice={data?.current?.current_price ?? 0}
            />
            <PortfolioPanel />
          </div>
        </>
      )}

      {/* No data */}
      {!loading && !error && !data && (
        <div className="card-gradient rounded-2xl p-8 text-center">
          <p className="text-[var(--text-muted)] text-sm">
            Nessun dato per <span className="font-mono font-medium">{ticker}</span>
          </p>
        </div>
      )}
    </div>
  );
}
