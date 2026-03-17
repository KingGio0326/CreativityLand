"use client";

import { useCallback, useEffect, useState } from "react";

const TICKERS = [
  "AAPL", "TSLA", "NVDA", "BTC-USD",
  "ETH-USD", "MSFT", "XOM", "GLD",
];

export default function AgentsPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents-debug?ticker=${t}`);
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Agent Monitor</h1>
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

      {loading && (
        <div className="rounded-xl border bg-card p-8">
          <div className="h-40 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <p className="text-red-400 text-sm font-medium">Errore</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Raw JSON — {ticker}
          </p>
          <pre className="text-xs font-mono text-muted-foreground bg-muted/30 rounded-lg p-4 overflow-auto max-h-[500px]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
