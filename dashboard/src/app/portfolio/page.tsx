"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ── Types ─────────────────────────────────────────────── */

interface Account {
  equity: number;
  cash: number;
  buying_power: number;
  daily_pl: number;
  daily_pl_pct: number;
  total_pl: number;
  total_pl_pct: number;
}

interface Position {
  ticker: string;
  qty: number;
  side: string;
  entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  stop_loss: number | null;
  take_profit: number | null;
  trailing_activation: number | null;
}

interface EquityHistory {
  timestamps: number[];
  equity: number[];
}

interface Trade {
  id: string;
  ticker: string;
  side: string;
  qty: number;
  filled_price: number;
  filled_at: string;
  type: string;
  status: string;
}

interface PortfolioData {
  account: Account;
  positions: Position[];
  equity_history: EquityHistory;
  trades: Trade[];
  is_market_open: boolean;
  error?: string;
}

interface ChartPoint {
  time: string;
  timestamp: number;
  equity: number;
}

/* ── Constants ─────────────────────────────────────────── */

const INITIAL_EQUITY = 1000;

const PERIOD_CONFIG = {
  "1D": { period: "1D", timeframe: "5Min" },
  "1W": { period: "1W", timeframe: "15Min" },
  // 1H timeframe on a paper account <30 days old can return empty/error from Alpaca.
  // Using 1D timeframe for the 1M view is more reliable and readable.
  "1M": { period: "1M", timeframe: "1D" },
  "3M": { period: "3M", timeframe: "1D" },
  ALL: { period: "all", timeframe: "1D" },
} as const;
type PeriodKey = keyof typeof PERIOD_CONFIG;

// Mobile shows only the three most useful periods
const MOBILE_PERIODS: PeriodKey[] = ["1D", "1W", "1M"];

/* ── Helpers ───────────────────────────────────────────── */

function fmtUsd(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtDate(d: string | number): string {
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtXAxis(ts: number, period: PeriodKey): string {
  const d = new Date(ts * 1000);
  switch (period) {
    case "1D":
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    case "1W":
      return (
        d.toLocaleDateString("en-US", { weekday: "short" }) +
        " " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      );
    case "1M":
    case "3M":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "ALL":
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
}

function fmtTooltipTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function plColor(v: number): string {
  if (v > 0) return "#10b981";
  if (v < 0) return "#ef4444";
  return "var(--text-secondary)";
}

function plGlow(v: number): string {
  if (v > 0) return "0 0 12px rgba(16,185,129,0.35)";
  if (v < 0) return "0 0 12px rgba(239,68,68,0.35)";
  return "none";
}

/** Returns [pct, color] where pct is 0-100 showing price position between SL and TP */
function calcSlTpProgress(
  p: Position
): { pct: number; color: string } | null {
  const { stop_loss: sl, take_profit: tp, current_price: price, side } = p;
  if (!sl || !tp) return null;
  const isLong = side === "long" || side === "buy";
  const lo = isLong ? sl : tp;
  const hi = isLong ? tp : sl;
  if (hi <= lo) return null;
  const raw = ((price - lo) / (hi - lo)) * 100;
  const pct = Math.max(0, Math.min(100, raw));
  const color = isLong
    ? pct > 60 ? "#10b981" : pct > 30 ? "#f59e0b" : "#ef4444"
    : pct < 40 ? "#10b981" : pct < 70 ? "#f59e0b" : "#ef4444";
  return { pct, color };
}

function timeAgoStr(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── useIsMobile ───────────────────────────────────────── */

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

/* ── Desktop Components (unchanged) ───────────────────── */

function StatCard({
  title,
  value,
  sub,
  color,
  variant = "neutral",
  icon,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
  variant?: "positive" | "negative" | "neutral";
  icon?: string;
}) {
  return (
    <div className={`stat-card ${variant}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="stat-label">{title}</div>
        {icon && (
          <span style={{ fontSize: 14, opacity: 0.5 }}>{icon}</span>
        )}
      </div>
      <div className="stat-value" style={{ color: color ?? "var(--text-primary)" }}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const isLong = side.toLowerCase() === "buy" || side.toLowerCase() === "long";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        border: `1px solid ${isLong ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
        background: isLong ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
        color: isLong ? "#10b981" : "#ef4444",
      }}
    >
      {isLong ? "▲" : "▼"} {side.toUpperCase()}
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const pl = d.equity - INITIAL_EQUITY;
  const plPct = ((d.equity - INITIAL_EQUITY) / INITIAL_EQUITY) * 100;
  return (
    <div
      style={{
        background: "rgba(10,10,20,0.97)",
        border: "1px solid rgba(168,85,247,0.35)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 6, fontSize: 11 }}>
        {fmtTooltipTime(d.timestamp)}
      </div>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#e0e0ff", fontVariantNumeric: "tabular-nums" }}>
        {fmtUsd(d.equity)}
      </div>
      <div style={{ color: plColor(pl), fontSize: 11, marginTop: 3, fontWeight: 600 }}>
        {pl >= 0 ? "+" : ""}{fmtUsd(pl)} ({fmtPct(plPct)})
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="shimmer" style={{ borderRadius: 16, height: 96 }} />
        ))}
      </div>
      <div className="shimmer" style={{ borderRadius: 20, height: 370 }} />
      <div className="shimmer" style={{ borderRadius: 20, height: 200 }} />
    </div>
  );
}

function PositionRow({ p }: { p: Position }) {
  const progress = calcSlTpProgress(p);
  const isLong = p.side === "long" || p.side === "buy";

  return (
    <tr className="data-row">
      <td style={{ padding: "10px 16px" }}>
        <span className="ticker-badge">{p.ticker}</span>
      </td>
      <td style={{ padding: "10px 16px", textAlign: "center" }}>
        <SideBadge side={p.side} />
      </td>
      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontSize: 12 }}>
        {p.qty % 1 === 0 ? p.qty.toFixed(0) : p.qty.toFixed(4)}
      </td>
      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
        {fmtUsd(p.entry_price)}
      </td>
      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
        {fmtUsd(p.current_price)}
      </td>
      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
        {fmtUsd(p.market_value)}
      </td>
      <td style={{ padding: "10px 16px", textAlign: "right" }}>
        <div
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: plColor(p.unrealized_pl),
            textShadow: plGlow(p.unrealized_pl),
          }}
        >
          {p.unrealized_pl >= 0 ? "+" : ""}{fmtUsd(p.unrealized_pl)}
        </div>
        <div style={{ fontSize: 10, color: plColor(p.unrealized_pl_pct), marginTop: 1 }}>
          {fmtPct(p.unrealized_pl_pct)}
        </div>
      </td>
      <td style={{ padding: "10px 16px", minWidth: 120 }}>
        {progress ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", marginBottom: 4 }}>
              <span style={{ color: "#ef4444" }}>SL</span>
              <span style={{ color: "#10b981" }}>TP</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${progress.pct}%`,
                  background: progress.color,
                  boxShadow: `0 0 6px ${progress.color}`,
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-geist-mono)" }}>
              <span style={{ color: "#ef4444" }}>{fmtUsd(isLong ? p.stop_loss! : p.take_profit!)}</span>
              <span style={{ color: "#10b981" }}>{fmtUsd(isLong ? p.take_profit! : p.stop_loss!)}</span>
            </div>
          </div>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
        )}
      </td>
    </tr>
  );
}

/* ── Mobile: position card ─────────────────────────────── */

function MobilePositionCard({ p }: { p: Position }) {
  const isLong = p.side === "long" || p.side === "buy";
  const progress = calcSlTpProgress(p);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding: "14px 16px",
    }}>
      {/* Row 1: ticker + side badge + P&L */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 15, fontWeight: 800, color: "#FAFAFA",
            fontFamily: "var(--font-geist-mono)", letterSpacing: "0.01em",
          }}>
            {p.ticker}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "2px 7px", borderRadius: 4,
            background: isLong ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: isLong ? "#10b981" : "#ef4444",
            border: `1px solid ${isLong ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)"}`,
          }}>
            {isLong ? "LONG" : "SHORT"}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 15, fontWeight: 700,
            color: plColor(p.unrealized_pl),
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
          }}>
            {p.unrealized_pl >= 0 ? "+" : ""}{fmtUsd(p.unrealized_pl)}
          </div>
          <div style={{ fontSize: 11, color: plColor(p.unrealized_pl_pct), marginTop: 1, fontWeight: 600 }}>
            {fmtPct(p.unrealized_pl_pct)}
          </div>
        </div>
      </div>

      {/* Row 2: entry → current + qty */}
      <div style={{
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontFamily: "var(--font-geist-mono)",
      }}>
        <span style={{ color: "rgba(250,250,250,0.35)" }}>{fmtUsd(p.entry_price)}</span>
        <span style={{ color: "rgba(250,250,250,0.2)" }}>→</span>
        <span style={{ color: "rgba(250,250,250,0.7)", fontWeight: 600 }}>{fmtUsd(p.current_price)}</span>
        <span style={{ marginLeft: "auto", color: "rgba(250,250,250,0.28)", fontSize: 10 }}>
          {p.qty % 1 === 0 ? p.qty.toFixed(0) : p.qty.toFixed(4)}
        </span>
      </div>

      {/* SL → TP progress bar */}
      {progress && (
        <div style={{ marginTop: 10 }}>
          <div className="progress-track" style={{ height: 3 }}>
            <div
              className="progress-fill"
              style={{ width: `${progress.pct}%`, background: progress.color }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 9, color: "#ef4444", fontFamily: "var(--font-geist-mono)" }}>
              SL {fmtUsd(isLong ? p.stop_loss! : p.take_profit!)}
            </span>
            <span style={{ fontSize: 9, color: "#10b981", fontFamily: "var(--font-geist-mono)" }}>
              TP {fmtUsd(isLong ? p.take_profit! : p.stop_loss!)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mobile: loading skeleton ──────────────────────────── */

function MobileSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero */}
      <div style={{ paddingTop: 8 }}>
        <div className="shimmer" style={{ height: 14, width: "40%", borderRadius: 6, marginBottom: 10 }} />
        <div className="shimmer" style={{ height: 44, width: "65%", borderRadius: 8, marginBottom: 10 }} />
        <div className="shimmer" style={{ height: 18, width: "50%", borderRadius: 6 }} />
      </div>
      {/* Chart placeholder */}
      <div className="shimmer" style={{ height: 168, borderRadius: 14 }} />
      {/* Position cards */}
      <div className="shimmer" style={{ height: 12, width: "35%", borderRadius: 4 }} />
      {[0, 1].map((i) => (
        <div key={i} className="shimmer" style={{ height: 88, borderRadius: 14 }} />
      ))}
    </div>
  );
}

/* ── Mobile: tooltip for simplified chart ──────────────── */

function MobileChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const pl = d.equity - INITIAL_EQUITY;
  return (
    <div style={{
      background: "rgba(10,10,11,0.97)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 11,
      boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    }}>
      <div style={{ color: "rgba(250,250,250,0.4)", marginBottom: 3, fontSize: 10 }}>
        {fmtTooltipTime(d.timestamp)}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#FAFAFA", fontVariantNumeric: "tabular-nums" }}>
        {fmtUsd(d.equity)}
      </div>
      <div style={{ color: plColor(pl), fontSize: 10, marginTop: 2, fontWeight: 600 }}>
        {pl >= 0 ? "+" : ""}{fmtUsd(pl)}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────── */

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equityPeriod, setEquityPeriod] = useState<PeriodKey>("1M");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = useIsMobile();

  const fetchData = useCallback(async () => {
    try {
      const cfg = PERIOD_CONFIG[equityPeriod];
      const res = await fetch(
        `/api/portfolio?period=${cfg.period}&timeframe=${cfg.timeframe}`,
      );
      const json = await res.json();
      if (json.error && !json.account) {
        setError(json.error);
      } else {
        setData(json);
        setError(json.error ?? null);
        setLastUpdated(new Date());
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [equityPeriod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    // Crypto positions trade 24/7 — keep refreshing even when the US cash market is closed.
    // 60 s during market hours, 5 min outside (crypto still moves, no need to hammer the API).
    const hasCryptoPositions = data.positions.some((p) => p.ticker.includes("-USD"));
    if (data.is_market_open) {
      intervalRef.current = setInterval(fetchData, 60_000);
    } else if (hasCryptoPositions) {
      intervalRef.current = setInterval(fetchData, 5 * 60_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [data, fetchData]);

  /* ── Loading ─────────────────────────────────────────── */

  if (loading) {
    if (isMobile) {
      return (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#FAFAFA", letterSpacing: "-0.01em" }}>Portfolio</span>
            <div style={{ display: "flex", gap: 6 }}>
              <div className="shimmer" style={{ width: 48, height: 22, borderRadius: 6 }} />
              <div className="shimmer" style={{ width: 72, height: 22, borderRadius: 6 }} />
            </div>
          </div>
          <MobileSkeleton />
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Portfolio</h1>
        </div>
        <Skeleton />
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────── */

  if (error && !data) {
    return (
      <div className="space-y-5">
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Portfolio</h1>
        <div style={{
          background: "rgba(239,68,68,0.05)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 20,
          padding: "32px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: "#ef4444", fontWeight: 600, fontSize: 14 }}>
            Cannot connect to Alpaca
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); fetchData(); }}
            className="btn-primary"
            style={{ marginTop: 20 }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Shared data prep ────────────────────────────────── */

  const account = data?.account ?? { equity: 0, cash: 0, buying_power: 0, daily_pl: 0, daily_pl_pct: 0, total_pl: 0, total_pl_pct: 0 };
  const positions = data?.positions ?? [];
  const trades = data?.trades ?? [];
  const equityHistory = data?.equity_history ?? { timestamps: [], equity: [] };
  const isMarketOpen = data?.is_market_open ?? false;

  const chartData: ChartPoint[] = equityHistory.timestamps.map((ts, i) => ({
    time: fmtTooltipTime(ts),
    timestamp: ts,
    equity: equityHistory.equity[i] ?? 0,
  }));

  const lastEquity = chartData.length > 0 ? chartData[chartData.length - 1].equity : INITIAL_EQUITY;
  const isPositive = lastEquity >= INITIAL_EQUITY;
  const lineColor = isPositive ? "#10b981" : "#ef4444";

  const equityValues = chartData.map((d) => d.equity).filter(Boolean);
  const minEquity = equityValues.length > 0 ? Math.min(...equityValues, INITIAL_EQUITY) : INITIAL_EQUITY - 10;
  const maxEquity = equityValues.length > 0 ? Math.max(...equityValues, INITIAL_EQUITY) : INITIAL_EQUITY + 10;
  const yPad = Math.max((maxEquity - minEquity) * 0.15, 5);
  const yMin = Math.floor(minEquity - yPad);
  const yMax = Math.ceil(maxEquity + yPad);

  const totalPlFromBase = lastEquity - INITIAL_EQUITY;
  const totalPlPctFromBase = ((lastEquity - INITIAL_EQUITY) / INITIAL_EQUITY) * 100;
  const totalInvested = positions.reduce((s, p) => s + p.market_value, 0);
  const totalUnrealizedPl = positions.reduce((s, p) => s + p.unrealized_pl, 0);

  /* ══════════════════════════════════════════════════════
     MOBILE LAYOUT
     A clean, finance-app experience built for scanning
     portfolio health in seconds, not a compressed desktop.
  ══════════════════════════════════════════════════════ */

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── Header ─────────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#FAFAFA",
            letterSpacing: "-0.01em",
          }}>
            Portfolio
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* PAPER badge — amber, not purple */}
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
              padding: "3px 8px", borderRadius: 5,
              background: "rgba(245,158,11,0.12)",
              color: "#f59e0b",
              border: "1px solid rgba(245,158,11,0.25)",
            }}>
              PAPER
            </span>
            {/* Market status */}
            {isMarketOpen ? (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                padding: "3px 8px", borderRadius: 5,
                display: "flex", alignItems: "center", gap: 4,
                background: "rgba(16,185,129,0.1)",
                color: "#10b981",
                border: "1px solid rgba(16,185,129,0.22)",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                OPEN
              </span>
            ) : (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                padding: "3px 8px", borderRadius: 5,
                background: "rgba(255,255,255,0.05)",
                color: "rgba(250,250,250,0.3)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                CLOSED
              </span>
            )}
          </div>
        </div>

        {/* ── Hero equity ────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(250,250,250,0.3)",
            marginBottom: 6,
          }}>
            Total Equity
          </div>
          <div style={{
            fontSize: 40,
            fontWeight: 800,
            color: "#FAFAFA",
            letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {fmtUsd(account.equity)}
          </div>
          {/* Total P&L */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{
              fontSize: 17,
              fontWeight: 700,
              color: plColor(account.total_pl),
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
            }}>
              {account.total_pl >= 0 ? "+" : ""}{fmtUsd(account.total_pl)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: plColor(account.total_pl_pct) }}>
              {fmtPct(account.total_pl_pct)}
            </span>
            <span style={{ fontSize: 11, color: "rgba(250,250,250,0.28)", marginLeft: 1 }}>
              all time
            </span>
          </div>
          {/* Daily P&L — smaller, secondary */}
          {account.daily_pl !== 0 && (
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11, color: "rgba(250,250,250,0.3)" }}>Today</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: plColor(account.daily_pl), fontVariantNumeric: "tabular-nums" }}>
                {account.daily_pl >= 0 ? "+" : ""}{fmtUsd(account.daily_pl)}
              </span>
              <span style={{ fontSize: 10, color: plColor(account.daily_pl_pct) }}>
                {fmtPct(account.daily_pl_pct)}
              </span>
            </div>
          )}
        </div>

        {/* ── Chart section ──────────────────────────────── */}
        <div style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          padding: "14px 0 8px",
          marginBottom: 20,
        }}>
          {/* Period tabs */}
          <div style={{
            display: "flex",
            gap: 2,
            padding: "0 14px",
            marginBottom: 12,
          }}>
            {MOBILE_PERIODS.map((key) => (
              <button
                key={key}
                onClick={() => setEquityPeriod(key)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  border: "none",
                  background: equityPeriod === key
                    ? "rgba(255,255,255,0.1)"
                    : "transparent",
                  color: equityPeriod === key
                    ? "#FAFAFA"
                    : "rgba(250,250,250,0.3)",
                  transition: "all 0.15s",
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Chart — axis-free, shape only */}
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="mGradPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mGradNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Hidden Y axis to set the domain — needed for correct scaling */}
                <YAxis domain={[yMin, yMax]} hide />
                <Tooltip content={<MobileChartTooltip />} />
                <ReferenceLine
                  y={INITIAL_EQUITY}
                  stroke="rgba(255,255,255,0.1)"
                  strokeDasharray="4 3"
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={isPositive ? "url(#mGradPos)" : "url(#mGradNeg)"}
                  dot={false}
                  activeDot={{ r: 4, stroke: lineColor, strokeWidth: 2, fill: "#0A0A0B" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              height: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(250,250,250,0.2)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 24px",
            }}>
              No chart data yet for this period
            </div>
          )}
        </div>

        {/* ── Open positions ──────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 12,
          }}>
            {positions.length > 0 && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 7px #10b981",
                flexShrink: 0,
                display: "inline-block",
              }} />
            )}
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(250,250,250,0.38)",
            }}>
              Open Positions
            </span>
            <span style={{ fontSize: 11, color: "rgba(250,250,250,0.22)" }}>
              ({positions.length})
            </span>
            {positions.length > 0 && totalUnrealizedPl !== 0 && (
              <span style={{
                marginLeft: "auto",
                fontSize: 12,
                fontWeight: 700,
                color: plColor(totalUnrealizedPl),
                fontVariantNumeric: "tabular-nums",
              }}>
                {totalUnrealizedPl >= 0 ? "+" : ""}{fmtUsd(totalUnrealizedPl)}
              </span>
            )}
          </div>

          {positions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {positions.map((p) => (
                <MobilePositionCard key={p.ticker} p={p} />
              ))}
            </div>
          ) : (
            <div style={{
              padding: "32px 0",
              textAlign: "center",
              color: "rgba(250,250,250,0.2)",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>—</div>
              <div style={{ fontSize: 12 }}>No open positions</div>
            </div>
          )}
        </div>

        {/* ── Footer status bar ───────────────────────────── */}
        <div style={{
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 10,
          color: "rgba(250,250,250,0.25)",
          letterSpacing: "0.02em",
        }}>
          <span>
            {lastUpdated ? `Updated ${timeAgoStr(lastUpdated)}` : "Loading…"}
          </span>
          <span>
            {positions.length} open · {fmtUsd(account.cash)} cash
          </span>
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#ef4444", textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     DESKTOP LAYOUT — unchanged from before
  ══════════════════════════════════════════════════════ */

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
          Portfolio
        </h1>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          padding: "3px 10px", borderRadius: 6,
          background: "rgba(124,58,237,0.15)", color: "#a855f7",
          border: "1px solid rgba(124,58,237,0.3)",
        }}>
          PAPER
        </span>
        {isMarketOpen ? (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            padding: "3px 10px", borderRadius: 6,
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(16,185,129,0.1)", color: "#10b981",
            border: "1px solid rgba(16,185,129,0.3)",
          }}>
            <span className="live-pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
            MARKET OPEN
          </span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            padding: "3px 10px", borderRadius: 6,
            background: "rgba(255,255,255,0.05)", color: "var(--text-muted)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            MARKET CLOSED
          </span>
        )}
        {error && <span style={{ fontSize: 11, color: "#ef4444", marginLeft: 4 }}>{error}</span>}
      </div>

      {/* ── Stat Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          title="Equity"
          value={fmtUsd(account.equity)}
          sub={`Start: ${fmtUsd(INITIAL_EQUITY)}`}
          color={account.equity >= INITIAL_EQUITY ? "#10b981" : "#ef4444"}
          variant={account.equity >= INITIAL_EQUITY ? "positive" : "negative"}
          icon="💼"
        />
        <StatCard
          title="Cash"
          value={fmtUsd(account.cash)}
          sub={`Buying power: ${fmtUsd(account.buying_power)}`}
          icon="💵"
        />
        <StatCard
          title="Daily P&L"
          value={`${account.daily_pl >= 0 ? "+" : ""}${fmtUsd(account.daily_pl)}`}
          sub={fmtPct(account.daily_pl_pct)}
          color={plColor(account.daily_pl)}
          variant={account.daily_pl > 0 ? "positive" : account.daily_pl < 0 ? "negative" : "neutral"}
          icon="📅"
        />
        <StatCard
          title="Total P&L"
          value={`${account.total_pl >= 0 ? "+" : ""}${fmtUsd(account.total_pl)}`}
          sub={fmtPct(account.total_pl_pct)}
          color={plColor(account.total_pl)}
          variant={account.total_pl > 0 ? "positive" : account.total_pl < 0 ? "negative" : "neutral"}
          icon="📈"
        />
        <StatCard
          title="Positions"
          value={String(positions.length)}
          sub={positions.length > 0 ? `${fmtUsd(totalInvested)} invested` : "No open positions"}
          icon="🎯"
        />
      </div>

      {/* ── Equity Curve ─────────────────────────────────── */}
      <div className="section-card">
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Equity Curve</div>
              {chartData.length > 0 && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 28,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                    color: "var(--text-primary)",
                  }}>
                    {fmtUsd(lastEquity)}
                  </span>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: plColor(totalPlFromBase),
                    textShadow: plGlow(totalPlFromBase),
                  }}>
                    {totalPlFromBase >= 0 ? "+" : ""}{fmtUsd(totalPlFromBase)} ({fmtPct(totalPlPctFromBase)})
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 3, padding: "2px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
              {(Object.keys(PERIOD_CONFIG) as PeriodKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setEquityPeriod(key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                    border: "none",
                    background: equityPeriod === key ? "rgba(124,58,237,0.35)" : "transparent",
                    color: equityPeriod === key ? "#c084fc" : "var(--text-muted)",
                    transition: "all 0.15s",
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 0 4px" }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300} minHeight={260}>
              <AreaChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts: number) => fmtXAxis(ts, equityPeriod)}
                  stroke="rgba(255,255,255,0.08)"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={50}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  stroke="rgba(255,255,255,0.08)"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
                  width={68}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine
                  y={INITIAL_EQUITY}
                  stroke="rgba(139,92,246,0.3)"
                  strokeDasharray="6 4"
                  label={{ value: "$1k", fill: "rgba(139,92,246,0.6)", fontSize: 10, position: "left" }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={isPositive ? "url(#gradPos)" : "url(#gradNeg)"}
                  dot={false}
                  activeDot={{ r: 5, stroke: lineColor, strokeWidth: 2, fill: "#07070f" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              height: 300,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              gap: 8,
              padding: "0 20px",
            }}>
              <div style={{ fontSize: 36, opacity: 0.3 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Dati disponibili dal 30 marzo 2026</div>
              <div style={{ fontSize: 12, opacity: 0.6, textAlign: "center" }}>
                L&apos;equity curve apparira quando Alpaca avra dati nel periodo selezionato
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Open Positions ───────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          {positions.length > 0 && (
            <span className="live-pulse-dot" style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#10b981", boxShadow: "0 0 8px #10b981", flexShrink: 0,
            }} />
          )}
          <span className="section-title">Open Positions</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>({positions.length})</span>
          {positions.length > 0 && totalUnrealizedPl !== 0 && (
            <span style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 700,
              color: plColor(totalUnrealizedPl),
              fontVariantNumeric: "tabular-nums",
            }}>
              Unrealized: {totalUnrealizedPl >= 0 ? "+" : ""}{fmtUsd(totalUnrealizedPl)}
            </span>
          )}
        </div>

        {positions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Ticker", "Side", "Qty", "Entry", "Current", "Mkt Value", "P&L", "SL → TP"].map((h, i) => (
                    <th key={h} style={{
                      padding: "9px 16px",
                      textAlign: i === 0 ? "left" : i === 1 ? "center" : i === 7 ? "left" : "right",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-barlow-condensed), sans-serif",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <PositionRow key={p.ticker} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.25 }}>📭</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>Nessuna posizione aperta</p>
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 5, opacity: 0.6 }}>
              Le posizioni appariranno qui quando il bot eseguira trade
            </p>
          </div>
        )}
      </div>

      {/* ── Trade History ────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header">
          <span className="section-title">Trade History</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>({trades.length})</span>
        </div>

        {trades.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Date", "Ticker", "Side", "Qty", "Price", "Type"].map((h, i) => (
                    <th key={h} style={{
                      padding: "9px 16px",
                      textAlign: i === 0 || i === 1 || i === 5 ? "left" : i === 2 ? "center" : "right",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-barlow-condensed), sans-serif",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="data-row">
                    <td style={{ padding: "9px 16px", color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}>
                      {t.filled_at ? fmtDate(t.filled_at) : "—"}
                    </td>
                    <td style={{ padding: "9px 16px" }}>
                      <span className="ticker-badge">{t.ticker}</span>
                    </td>
                    <td style={{ padding: "9px 16px", textAlign: "center" }}>
                      <SideBadge side={t.side} />
                    </td>
                    <td style={{ padding: "9px 16px", textAlign: "right", fontFamily: "var(--font-geist-mono)" }}>
                      {t.qty % 1 === 0 ? t.qty.toFixed(0) : t.qty.toFixed(4)}
                    </td>
                    <td style={{ padding: "9px 16px", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontWeight: 600 }}>
                      {fmtUsd(t.filled_price)}
                    </td>
                    <td style={{ padding: "9px 16px", color: "var(--text-secondary)", fontFamily: "var(--font-geist-mono)", fontSize: 11 }}>
                      {t.type}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.25 }}>🔄</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>Nessun trade eseguito</p>
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 5, opacity: 0.6 }}>
              I trade appariranno qui quando il bot aprira e chiudera posizioni
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
