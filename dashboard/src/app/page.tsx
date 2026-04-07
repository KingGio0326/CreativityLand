"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import AgentChat from "@/components/AgentChat";
import TickerSelector from "@/components/TickerSelector";
import { TICKERS } from "@/lib/constants";
import { signalFilledClasses, signalDotClass } from "@/lib/signal-styles";
import { TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, GRID_STROKE } from "@/lib/chart-styles";

/* ── Types ─────────────────────────────────────────────── */

interface Signal {
  id: string;
  ticker: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  created_at: string;
  consensus_level?: string;
  agents_agree?: number;
  agents_total?: number;
}

/* ── Constants ─────────────────────────────────────────── */

const QUICK_LINKS = [
  {
    href: "/agents",
    icon: "🤖",
    title: "Agents",
    desc: "View all agents and their detailed votes",
  },
  {
    href: "/patterns",
    icon: "🔮",
    title: "Patterns",
    desc: "Historical patterns with matching and ML predictions",
  },
  {
    href: "/performance",
    icon: "🏆",
    title: "Performance",
    desc: "Agent metrics and hit-rate over time",
  },
  {
    href: "/guide",
    icon: "📖",
    title: "Guide",
    desc: "How each agent works and how to read the signals",
  },
];

/* ── Helpers ───────────────────────────────────────────── */

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatConfidenceLabel(isoStr: string): string {
  const d = new Date(isoStr);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  if (d.toDateString() === new Date().toDateString()) return `${hh}:${mm}`;
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
}

/* ── Component ─────────────────────────────────────────── */

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [chartData, setChartData] = useState<{ day: string; confidence: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartEmpty, setChartEmpty] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/signals");
      const data = await res.json();
      setSignals(Array.isArray(data) ? data : []);
    } catch {
      // signals table stays empty on error
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChartData = useCallback(async (ticker: string) => {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/signals?ticker=${encodeURIComponent(ticker)}&limit=10`);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const sigs: Signal[] = Array.isArray(data) ? data : [];
      // API returns descending order — reverse for chronological display
      const chronological = [...sigs].reverse();
      if (chronological.length >= 2) {
        setChartData(
          chronological.map((s) => ({
            day: formatConfidenceLabel(s.created_at),
            confidence: Math.round((s.confidence ?? 0) * 100),
          })),
        );
        setChartEmpty(false);
      } else {
        setChartData([]);
        setChartEmpty(true);
      }
    } catch {
      setChartData([]);
      setChartEmpty(true);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchChartData(selectedTicker);
    const interval = setInterval(() => {
      fetchData();
      fetchChartData(selectedTicker);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedTicker, fetchData, fetchChartData]);

  /* Compute stats */
  const latestPerTicker = TICKERS.map((t) => signals.find((s) => s.ticker === t)).filter(Boolean) as Signal[];
  const todaySignals = latestPerTicker.length;
  const buyCount = latestPerTicker.filter((s) => s.signal === "BUY").length;
  const sellCount = latestPerTicker.filter((s) => s.signal === "SELL").length;
  const avgConfidence =
    latestPerTicker.length > 0
      ? Math.round(
          (latestPerTicker.reduce((sum, s) => sum + (s.confidence ?? 0), 0) /
            latestPerTicker.length) *
            100,
        )
      : 0;

  const selectedSignal = signals.find((s) => s.ticker === selectedTicker);

  return (
    <div className="space-y-6">
      {/* ── Ticker Selector ─────────────────────────────── */}
      <TickerSelector
        value={selectedTicker}
        onChange={setSelectedTicker}
        signalDot={(t) => {
          const sig = signals.find((s) => s.ticker === t);
          return sig ? signalDotClass(sig.signal) : null;
        }}
      />

      {/* ── Stat Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon="📊"
          iconBg="rgba(168,85,247,0.15)"
          label="Signals today"
          value={loading ? "—" : String(todaySignals)}
          sub={`out of ${TICKERS.length} tickers`}
          trend={todaySignals > 0 ? "up" : "neutral"}
        />
        <StatCard
          icon="🟢"
          iconBg="var(--green-bg)"
          label="BUY"
          value={loading ? "—" : String(buyCount)}
          sub={todaySignals > 0 ? `${Math.round((buyCount / todaySignals) * 100)}% of total` : "—"}
          trend="up"
        />
        <StatCard
          icon="🔴"
          iconBg="var(--red-bg)"
          label="SELL"
          value={loading ? "—" : String(sellCount)}
          sub={todaySignals > 0 ? `${Math.round((sellCount / todaySignals) * 100)}% of total` : "—"}
          trend="down"
        />
        <StatCard
          icon="🎯"
          iconBg="rgba(245,158,11,0.12)"
          label="Avg Confidence"
          value={loading ? "—" : `${avgConfidence}%`}
          sub={avgConfidence >= 70 ? "High" : avgConfidence >= 50 ? "Moderate" : "Low"}
          trend={avgConfidence >= 60 ? "up" : "down"}
        />
      </div>

      {/* ── Main Grid: Table + Chart ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Signal Table */}
        <div className="lg:col-span-3 card-gradient rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[rgba(139,92,246,0.12)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Signals by ticker
            </h2>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {selectedSignal ? timeAgo(selectedSignal.created_at) : "—"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table" aria-label="Signals by ticker">
              <thead>
                <tr className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                  <th className="text-left px-5 py-2.5 font-medium">Ticker</th>
                  <th className="text-left px-3 py-2.5 font-medium">Signal</th>
                  <th className="text-left px-3 py-2.5 font-medium">Confidence</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Consensus</th>
                  <th className="text-right px-5 py-2.5 font-medium hidden md:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-5 py-3">
                          <div className="h-4 rounded bg-[rgba(255,255,255,0.04)] animate-pulse" />
                        </td>
                      </tr>
                    ))
                  : TICKERS.map((ticker, i) => {
                      const sig = signals.find((s) => s.ticker === ticker);
                      const conf = Math.round((sig?.confidence ?? 0) * 100);
                      const isSelected = ticker === selectedTicker;
                      return (
                        <tr
                          key={ticker}
                          tabIndex={0}
                          onClick={() => setSelectedTicker(ticker)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedTicker(ticker)
                            }
                          }}
                          className={`cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-light)] focus-visible:-outline-offset-2 ${
                            isSelected
                              ? "bg-[rgba(124,58,237,0.1)]"
                              : i % 2 === 0
                                ? "bg-[var(--bg-card)]"
                                : "bg-[var(--bg-secondary)]"
                          } hover:bg-[rgba(124,58,237,0.05)]`}
                        >
                          <td className="px-5 py-2.5">
                            <span className="font-mono font-semibold text-[var(--text-primary)]">
                              {ticker}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold ${signalFilledClasses(
                                sig?.signal ?? "HOLD",
                              )}`}
                            >
                              {sig?.signal ?? "HOLD"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[var(--accent-light)] transition-all"
                                  style={{ width: `${conf}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-[var(--text-secondary)]">
                                {conf}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            {sig?.consensus_level && sig.consensus_level !== "?" ? (
                              <span
                                className={`text-[11px] font-medium ${
                                  sig.consensus_level === "strong"
                                    ? "text-[var(--green)]"
                                    : sig.consensus_level === "moderate"
                                      ? "text-[var(--yellow)]"
                                      : "text-[var(--red)]"
                                }`}
                              >
                                {sig.consensus_level}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-right hidden md:table-cell">
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {sig ? timeAgo(sig.created_at) : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="lg:col-span-2 card-gradient rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Confidence trend
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {selectedTicker} — recent runs
              </p>
            </div>
            <span className="font-mono text-lg font-bold text-[var(--accent-light)]">
              {chartData.length > 0
                ? `${chartData[chartData.length - 1].confidence}%`
                : selectedSignal
                  ? `${Math.round((selectedSignal.confidence ?? 0) * 100)}%`
                  : "—"}
            </span>
          </div>
          <div className="flex-1 min-h-[200px]">
            {chartLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="h-4 w-40 rounded bg-[rgba(255,255,255,0.04)] animate-pulse" />
              </div>
            ) : chartEmpty ? (
              <div className="h-full flex items-center justify-center text-[12px] text-[var(--text-muted)] text-center px-4">
                Not enough recent runs to show a trend
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={GRID_STROKE}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#4a4a6a" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#4a4a6a" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(value: number) => [`${value}%`, "Confidence"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="confidence"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fill="url(#purpleGradient)"
                    dot={{ r: 3, fill: "#a855f7", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#a855f7", stroke: "#12122a", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Agent Chat ──────────────────────────────────── */}
      <div className="card-gradient rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[rgba(139,92,246,0.12)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Agent Chat — {selectedTicker}
          </h2>
        </div>
        <div className="p-0">
          <AgentChat ticker={selectedTicker} />
        </div>
      </div>

      {/* ── Quick Links ─────────────────────────────────── */}
      <div>
        <div className="section-title" style={{ marginBottom: 12 }}>Quick links</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{ textDecoration: "none" }}
            >
              <div className="stat-card" style={{ cursor: "pointer", height: "100%" }}>
                <span style={{ fontSize: 28, display: "block", marginBottom: 12 }}>{link.icon}</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  {link.title}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {link.desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Stat Card ─────────────────────────────────────────── */

function StatCard({
  icon,
  iconBg,
  label,
  value,
  sub,
  trend,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  trend: "up" | "down" | "neutral";
}) {
  const variant = trend === "up" ? "positive" : trend === "down" ? "negative" : "";
  return (
    <div className={`stat-card ${variant}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: iconBg }}>
          {icon}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--red)" : "var(--text-muted)",
        }}>
          {trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}
        </span>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}
