"use client";

import { useEffect, useState } from "react";
import { returnColor } from "@/lib/signal-styles";

/* ── Types ─────────────────────────────────────────────── */

interface Position {
  id: string;
  ticker: string;
  side: string;
  entry_price: number;
  shares: number;
  allocated_usd: number;
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string;
  status: string;
}

interface Trade {
  id: string;
  ticker: string;
  side: string;
  entry_price: number;
  exit_price: number | null;
  shares: number;
  pnl_usd: number | null;
  pnl_pct: number | null;
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

interface PortfolioSummary {
  capitale_investito: number;
  posizioni_aperte: number;
  pnl_totale: number;
  pnl_giornaliero: number;
  trade_totali: number;
  win_rate: number;
}

interface AlpacaPosition {
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

interface TradesData {
  positions: Position[];
  trades: Trade[];
  summary: PortfolioSummary;
}

const CLOSE_REASON_LABELS: Record<string, string> = {
  signal: "Signal",
  stop_loss: "Stop Loss",
  take_profit: "Take Profit",
  manual: "Manual",
  circuit_breaker: "Circuit Breaker",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtUsd(v: number) {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/* ── Summary Card ──────────────────────────────────────── */

function SummaryCard({
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
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.06em" }}>
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
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────── */

export default function TradesPage() {
  const [data, setData] = useState<TradesData | null>(null);
  const [alpaca, setAlpaca] = useState<AlpacaPosition[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"positions" | "history">("positions");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/portfolio").then((r) => r.json()).catch(() => ({ positions: [] })),
    ])
      .then(([tradesRes, portfolioRes]) => {
        if (tradesRes.error) setError(tradesRes.error);
        else setData(tradesRes);
        if (portfolioRes.positions) setAlpaca(portfolioRes.positions);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary ?? {
    capitale_investito: 0,
    posizioni_aperte: 0,
    pnl_totale: 0,
    pnl_giornaliero: 0,
    trade_totali: 0,
    win_rate: 0,
  };

  const positions = data?.positions ?? [];
  const trades = data?.trades ?? [];
  const alpacaPositions = alpaca ?? [];

  const hasAlpaca = alpacaPositions.length > 0;

  // Compute live stats from Alpaca when available, fallback to Supabase view
  const liveInvested = hasAlpaca
    ? alpacaPositions.reduce((s, p) => s + Math.abs(p.market_value), 0)
    : summary.capitale_investito;
  const livePositions = hasAlpaca ? alpacaPositions.length : summary.posizioni_aperte;
  const livePnl = hasAlpaca
    ? alpacaPositions.reduce((s, p) => s + p.unrealized_pl, 0)
    : summary.pnl_totale;
  const liveDayPnl = hasAlpaca
    ? alpacaPositions.reduce((s, p) => s + p.change_today * Math.abs(p.market_value), 0)
    : summary.pnl_giornaliero;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold tracking-tight">Trading</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="INVESTED"
          value={fmtUsd(liveInvested)}
          sub={`${livePositions} open position${livePositions !== 1 ? "s" : ""}`}
        />
        <SummaryCard
          title="UNREALIZED P&L"
          value={`${livePnl >= 0 ? "+" : ""}${fmtUsd(livePnl)}`}
          color={livePnl >= 0 ? "#10b981" : "#ef4444"}
          sub={hasAlpaca ? "Live from Alpaca" : `${summary.trade_totali} trades`}
        />
        <SummaryCard
          title="24H P&L"
          value={`${liveDayPnl >= 0 ? "+" : ""}${fmtUsd(liveDayPnl)}`}
          color={liveDayPnl >= 0 ? "#10b981" : "#ef4444"}
        />
        <SummaryCard
          title="WIN RATE"
          value={`${summary.win_rate}%`}
          color={summary.win_rate >= 50 ? "#10b981" : summary.win_rate > 0 ? "#ef4444" : "var(--text-secondary)"}
          sub={summary.trade_totali > 0 ? `${summary.trade_totali} completed` : "No trades yet"}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 0 }}>
        {(["positions", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              color: tab === t ? "#a855f7" : "var(--text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid #a855f7" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {t === "positions" ? "Open Positions" : "Trade History"}
          </button>
        ))}
      </div>

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

      {!loading && !error && tab === "positions" && (
        <>
          {/* Alpaca live positions */}
          {hasAlpaca && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b flex items-center gap-2">
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                <p className="text-sm font-semibold">Alpaca Live Positions</p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs data-table">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Symbol</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Qty</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Entry</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Current</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Mkt Value</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alpacaPositions.map((p) => (
                      <tr key={p.symbol} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-bold">{p.symbol}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{p.qty}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.avg_entry_price)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.current_price)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.market_value)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${returnColor(p.unrealized_pl)}`}>
                          {p.unrealized_pl >= 0 ? "+" : ""}{fmtUsd(p.unrealized_pl)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${returnColor(p.unrealized_plpc * 100)}`}>
                          {(p.unrealized_plpc * 100) >= 0 ? "+" : ""}{(p.unrealized_plpc * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DB positions */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-semibold">Bot Positions</p>
            </div>
            {positions.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full text-xs data-table">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ticker</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Side</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Entry</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Shares</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Allocated</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Stop Loss</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-bold">{p.ticker}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold border"
                            style={{
                              color: p.side === "long" ? "#10b981" : "#ef4444",
                              borderColor: p.side === "long" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
                              background: p.side === "long" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                            }}
                          >
                            {p.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.entry_price)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{p.shares.toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(p.allocated_usd)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                          {p.stop_loss ? fmtUsd(p.stop_loss) : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{fmtDate(p.opened_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-muted-foreground text-sm">No open positions</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Positions will appear here when the executor opens trades
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !error && tab === "history" && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b">
            <p className="text-sm font-semibold">Completed Trades</p>
          </div>
          {trades.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-xs data-table">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ticker</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Side</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Entry</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Exit</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Shares</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">P&L %</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-bold">{t.ticker}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold border"
                          style={{
                            color: t.side === "long" ? "#10b981" : "#ef4444",
                            borderColor: t.side === "long" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
                            background: t.side === "long" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          }}
                        >
                          {t.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtUsd(t.entry_price)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {t.exit_price != null ? fmtUsd(t.exit_price) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{t.shares.toFixed(4)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold ${returnColor(t.pnl_usd ?? 0)}`}>
                        {t.pnl_usd != null
                          ? `${t.pnl_usd >= 0 ? "+" : ""}${fmtUsd(t.pnl_usd)}`
                          : "—"}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${returnColor(t.pnl_pct ?? 0)}`}>
                        {t.pnl_pct != null
                          ? `${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {t.close_reason && (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold border"
                            style={{
                              color:
                                t.close_reason === "stop_loss" || t.close_reason === "circuit_breaker"
                                  ? "#ef4444"
                                  : t.close_reason === "take_profit"
                                    ? "#10b981"
                                    : "#a855f7",
                              borderColor: "rgba(255,255,255,0.1)",
                              background: "rgba(255,255,255,0.04)",
                            }}
                          >
                            {CLOSE_REASON_LABELS[t.close_reason] ?? t.close_reason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {t.closed_at ? fmtDate(t.closed_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-muted-foreground text-sm">No completed trades</p>
              <p className="text-xs text-muted-foreground mt-1">
                Trades will appear here when positions are closed
              </p>
            </div>
          )}
        </div>
      )}

      {/* Status banner */}
      {!loading && !error && summary.trade_totali === 0 && positions.length === 0 && !hasAlpaca && (
        <div
          style={{
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.2)",
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <p style={{ color: "#a855f7", fontSize: 14, fontWeight: 600 }}>Auto-trading not active</p>
          <p style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>
            The positions and trades tables are ready. Once the execution engine (Fase 3)
            is implemented and TRADING_ENABLED=true, trades will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
