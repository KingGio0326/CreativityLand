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
import { returnColor } from "@/lib/signal-styles";

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

/* ── Helpers ───────────────────────────────────────────── */

const INITIAL_EQUITY = 1000;

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

function fmtChartTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function plColor(v: number): string {
  if (v > 0) return "#10b981";
  if (v < 0) return "#ef4444";
  return "var(--text-secondary)";
}

/* ── StatCard ──────────────────────────────────────────── */

function StatCard({
  title,
  value,
  sub,
  color,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 6,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: "var(--font-barlow-condensed), sans-serif",
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: color ?? "var(--text-primary)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ── Side Badge ────────────────────────────────────────── */

function SideBadge({ side }: { side: string }) {
  const isBuy = side.toLowerCase() === "buy" || side.toLowerCase() === "long";
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold border"
      style={{
        color: isBuy ? "#10b981" : "#ef4444",
        borderColor: isBuy
          ? "rgba(16,185,129,0.3)"
          : "rgba(239,68,68,0.3)",
        background: isBuy
          ? "rgba(16,185,129,0.1)"
          : "rgba(239,68,68,0.1)",
      }}
    >
      {side.toUpperCase()}
    </span>
  );
}

/* ── Custom Tooltip ────────────────────────────────────── */

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: "rgba(15,15,20,0.95)",
        border: "1px solid rgba(168,85,247,0.3)",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>{d.time}</div>
      <div style={{ fontWeight: 700, color: "#a855f7", fontSize: 16 }}>
        {fmtUsd(d.equity)}
      </div>
      <div style={{ color: plColor(d.equity - INITIAL_EQUITY), fontSize: 11, marginTop: 2 }}>
        {fmtUsd(d.equity - INITIAL_EQUITY)} ({fmtPct(((d.equity - INITIAL_EQUITY) / INITIAL_EQUITY) * 100)})
      </div>
    </div>
  );
}

/* ── Loading Skeleton ──────────────────────────────────── */

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: "18px 20px",
              height: 88,
            }}
          />
        ))}
      </div>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          height: 350,
        }}
      />
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          height: 200,
        }}
      />
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────── */

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      const json = await res.json();
      if (json.error && !json.account) {
        setError(json.error);
      } else {
        setData(json);
        setError(json.error ?? null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s when market is open
  useEffect(() => {
    if (!data) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (data.is_market_open) {
      intervalRef.current = setInterval(fetchData, 60_000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data, fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <Skeleton />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <div
          style={{
            background: "rgba(239,68,68,0.05)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 16,
            padding: "24px 28px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#ef4444", fontWeight: 600, fontSize: 14 }}>
            Impossibile connettersi ad Alpaca
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>
            {error}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchData();
            }}
            style={{
              marginTop: 16,
              padding: "8px 24px",
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const account = data?.account ?? {
    equity: 0,
    cash: 0,
    buying_power: 0,
    daily_pl: 0,
    daily_pl_pct: 0,
    total_pl: 0,
    total_pl_pct: 0,
  };
  const positions = data?.positions ?? [];
  const trades = data?.trades ?? [];
  const equityHistory = data?.equity_history ?? { timestamps: [], equity: [] };
  const isMarketOpen = data?.is_market_open ?? false;

  // Build chart data
  const chartData: ChartPoint[] = equityHistory.timestamps.map((ts, i) => ({
    time: fmtDate(ts),
    timestamp: ts,
    equity: equityHistory.equity[i] ?? 0,
  }));

  // Chart Y domain
  const equityValues = chartData.map((d) => d.equity).filter(Boolean);
  const minEquity = equityValues.length > 0 ? Math.min(...equityValues) : INITIAL_EQUITY;
  const maxEquity = equityValues.length > 0 ? Math.max(...equityValues) : INITIAL_EQUITY;
  const yPad = Math.max((maxEquity - minEquity) * 0.15, 5);
  const yMin = Math.floor(minEquity - yPad);
  const yMax = Math.ceil(maxEquity + yPad);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "3px 10px",
            borderRadius: 6,
            background: "rgba(124,58,237,0.15)",
            color: "#a855f7",
            border: "1px solid rgba(124,58,237,0.3)",
          }}
        >
          PAPER
        </span>
        {isMarketOpen ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "3px 10px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(16,185,129,0.1)",
              color: "#10b981",
              border: "1px solid rgba(16,185,129,0.3)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 6px #10b981",
              }}
            />
            MARKET OPEN
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "3px 10px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.05)",
              color: "var(--text-muted)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            MARKET CLOSED
          </span>
        )}
        {error && (
          <span style={{ fontSize: 11, color: "#ef4444" }}>
            {error}
          </span>
        )}
      </div>

      {/* ── Stat Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Equity"
          value={fmtUsd(account.equity)}
          color={account.equity >= INITIAL_EQUITY ? "#10b981" : "#ef4444"}
        />
        <StatCard
          title="Cash"
          value={fmtUsd(account.cash)}
          sub={`Buying power: ${fmtUsd(account.buying_power)}`}
        />
        <StatCard
          title="Daily P&L"
          value={`${account.daily_pl >= 0 ? "+" : ""}${fmtUsd(account.daily_pl)}`}
          sub={fmtPct(account.daily_pl_pct)}
          color={plColor(account.daily_pl)}
        />
        <StatCard
          title="Total P&L"
          value={`${account.total_pl >= 0 ? "+" : ""}${fmtUsd(account.total_pl)}`}
          sub={fmtPct(account.total_pl_pct)}
          color={plColor(account.total_pl)}
        />
        <StatCard
          title="Positions"
          value={String(positions.length)}
          sub={positions.length > 0
            ? `${fmtUsd(positions.reduce((s, p) => s + p.market_value, 0))} invested`
            : "No open positions"
          }
        />
      </div>

      {/* ── Equity Curve ────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          padding: "20px 20px 12px",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: "var(--font-barlow-condensed), sans-serif",
            color: "var(--text-muted)",
            marginBottom: 16,
          }}
        >
          Equity Curve
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                tickFormatter={fmtChartTime}
                stroke="rgba(255,255,255,0.15)"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={60}
              />
              <YAxis
                domain={[yMin, yMax]}
                stroke="rgba(255,255,255,0.15)"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                width={70}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine
                y={INITIAL_EQUITY}
                stroke="rgba(255,255,255,0.15)"
                strokeDasharray="6 4"
                label={{
                  value: `$${INITIAL_EQUITY.toLocaleString()}`,
                  fill: "rgba(255,255,255,0.25)",
                  fontSize: 10,
                  position: "right",
                }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#7c3aed"
                strokeWidth={2}
                fill="url(#equityGrad)"
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: "#a855f7",
                  strokeWidth: 2,
                  fill: "#0f0f14",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              height: 320,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No equity history available yet
          </div>
        )}
      </div>

      {/* ── Open Positions ──────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {positions.length > 0 && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 8px #10b981",
              }}
            />
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              color: "var(--text-muted)",
            }}
          >
            Open Positions
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            ({positions.length})
          </span>
        </div>

        {positions.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ticker</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Side</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Entry</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Current</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Mkt Value</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L ($)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L (%)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">SL</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">TP</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr
                    key={p.ticker}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono font-bold">{p.ticker}</td>
                    <td className="px-4 py-2.5 text-center">
                      <SideBadge side={p.side} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{p.qty.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.entry_price)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.current_price)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.market_value)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${returnColor(p.unrealized_pl)}`}>
                      {p.unrealized_pl >= 0 ? "+" : ""}{fmtUsd(p.unrealized_pl)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono ${returnColor(p.unrealized_pl_pct)}`}>
                      {fmtPct(p.unrealized_pl_pct)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono" style={{ color: p.stop_loss ? "#ef4444" : "var(--text-muted)" }}>
                      {p.stop_loss ? fmtUsd(p.stop_loss) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono" style={{ color: p.take_profit ? "#10b981" : "var(--text-muted)" }}>
                      {p.take_profit ? fmtUsd(p.take_profit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Nessuna posizione aperta
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              Le posizioni appariranno qui quando il bot eseguira trade
            </p>
          </div>
        )}
      </div>

      {/* ── Trade History ───────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              color: "var(--text-muted)",
            }}
          >
            Trade History
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
            ({trades.length})
          </span>
        </div>

        {trades.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ticker</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Side</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Price</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr
                    key={t.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {t.filled_at ? fmtDate(t.filled_at) : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold">{t.ticker}</td>
                    <td className="px-4 py-2.5 text-center">
                      <SideBadge side={t.side} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{t.qty.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(t.filled_price)}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Nessun trade eseguito
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              I trade appariranno qui quando il bot aprira e chiudera posizioni
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
