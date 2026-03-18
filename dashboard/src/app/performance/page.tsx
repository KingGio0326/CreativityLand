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
} from "recharts";

const TICKERS = [
  "AAPL", "TSLA", "NVDA", "BTC-USD",
  "ETH-USD", "MSFT", "XOM", "GLD",
];

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

interface PerfData {
  ticker: string;
  evaluations: Evaluation[];
  stats: Stats;
  chart_data: ChartPoint[];
}

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

/* ── page ─────────────────────────────────────────────── */
export default function PerformancePage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {/* Header badges */}
      {data && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Segnali: <span className="font-bold">{stats.total_signals}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Hit rate:{" "}
            <span className={`font-bold ${stats.hit_rate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
              {stats.hit_rate}%
            </span>
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Score:{" "}
            <span className={`font-bold ${stats.cumulative_score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {stats.cumulative_score >= 0 ? "+" : ""}{stats.cumulative_score}
            </span>
          </span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-mono border bg-card">
            Alpha:{" "}
            <span className={`font-bold ${stats.alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {stats.alpha >= 0 ? "+" : ""}{stats.alpha}%
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
          {/* ── SECTION 1: Cumulative Score Chart ──────── */}
          {chartData.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold mb-4">Score Cumulativo vs SPY</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval={Math.max(0, Math.floor(chartData.length / 8))}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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

          {/* ── SECTION 2: Evaluations Table ──────────── */}
          {evaluations.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b">
                <p className="text-sm font-semibold">Ultimi Segnali Valutati</p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Segnale</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Conf.</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">+6h</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">+24h</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">+72h</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">+7gg</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Score</th>
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
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${signalBadge(ev.signal_type)}`}>
                            {ev.signal_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {Math.round((ev.confidence > 1 ? ev.confidence : ev.confidence * 100))}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${returnColor(ev.return_6h)}`}>
                          {ev.return_6h >= 0 ? "+" : ""}{ev.return_6h}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${returnColor(ev.return_24h)}`}>
                          {ev.return_24h >= 0 ? "+" : ""}{ev.return_24h}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${returnColor(ev.return_72h)}`}>
                          {ev.return_72h >= 0 ? "+" : ""}{ev.return_72h}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-medium ${returnColor(ev.return_168h)}`}>
                          {ev.return_168h >= 0 ? "+" : ""}{ev.return_168h}%
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${returnColor(ev.score_168h)}`}>
                          {ev.score_168h >= 0 ? "+" : ""}{ev.score_168h}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SECTION 3: Stats Cards ────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-5 space-y-1">
              <p className="text-[11px] text-muted-foreground">Hit Rate</p>
              <p className={`text-2xl font-bold font-mono ${stats.hit_rate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.hit_rate}%
              </p>
              <p className="text-[10px] text-muted-foreground">
                {stats.positive_signals}/{stats.total_signals} corretti
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5 space-y-1">
              <p className="text-[11px] text-muted-foreground">Avg Score</p>
              <p className={`text-2xl font-bold font-mono ${stats.avg_score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.avg_score >= 0 ? "+" : ""}{stats.avg_score}
              </p>
              <p className="text-[10px] text-muted-foreground">per segnale</p>
            </div>
            <div className="rounded-xl border bg-card p-5 space-y-1">
              <p className="text-[11px] text-muted-foreground">Avg Return</p>
              <p className={`text-2xl font-bold font-mono ${stats.avg_return_168h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.avg_return_168h >= 0 ? "+" : ""}{stats.avg_return_168h}%
              </p>
              <p className="text-[10px] text-muted-foreground">a 7 giorni</p>
            </div>
            <div className="rounded-xl border bg-card p-5 space-y-1">
              <p className="text-[11px] text-muted-foreground">Alpha</p>
              <p className={`text-2xl font-bold font-mono ${stats.alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.alpha >= 0 ? "+" : ""}{stats.alpha}%
              </p>
              <p className="text-[10px] text-muted-foreground">vs SPY</p>
            </div>
          </div>

          {/* ── SECTION 4: Status message ─────────────── */}
          <div className={`rounded-xl border p-5 ${
            stats.total_signals >= 30
              ? "bg-emerald-500/5 border-emerald-500/25"
              : stats.total_signals >= 10
                ? "bg-zinc-500/5 border-zinc-500/25"
                : "bg-amber-500/5 border-amber-500/25"
          }`}>
            {stats.total_signals < 10 && (
              <p className="text-sm text-amber-400">
                Servono almeno 10 segnali completati per risultati statisticamente significativi.
                Attualmente: <span className="font-bold">{stats.total_signals}</span> segnali valutati.
              </p>
            )}
            {stats.total_signals >= 10 && stats.total_signals < 30 && (
              <p className="text-sm text-muted-foreground">
                Risultati preliminari basati su <span className="font-bold text-foreground">{stats.total_signals}</span> segnali.
                Servono almeno 30 segnali per un&apos;analisi affidabile.
              </p>
            )}
            {stats.total_signals >= 30 && (
              <p className="text-sm text-emerald-400">
                Analisi statistica affidabile disponibile — <span className="font-bold">{stats.total_signals}</span> segnali valutati.
              </p>
            )}
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
