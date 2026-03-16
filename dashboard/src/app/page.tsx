"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import AgentChat from "@/components/AgentChat";

interface VoteDetail {
  signal: string;
  confidence: number;
}

interface Signal {
  id: string;
  ticker: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  created_at: string;
  vote_breakdown?: Record<string, VoteDetail>;
  consensus_level?: string;
  agents_agree?: number;
  agents_total?: number;
  dominant_factor?: string;
  macro_adjusted?: boolean;
  macro_events?: string[];
}

interface Article {
  id: string;
  title: string;
  source: string;
  ticker: string;
  sentiment_label: string;
  published_at: string;
}

const TICKERS = ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "MSFT", "XOM", "GLD"];

const signalColor = (s: string) =>
  s === "BUY" ? "bg-green-600" : s === "SELL" ? "bg-red-600" : "bg-gray-500";

const sentimentColor = (s: string) =>
  s === "positive"
    ? "bg-green-600"
    : s === "negative"
      ? "bg-red-600"
      : "bg-gray-500";

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState("AAPL");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sigRes, artRes] = await Promise.all([
        fetch("/api/signals"),
        fetch("/api/articles?limit=5"),
      ]);
      const sigData = await sigRes.json();
      const artData = await artRes.json();
      setSignals(Array.isArray(sigData) ? sigData : []);
      setArticles(Array.isArray(artData) ? artData : []);
      setLastUpdate(new Date().toLocaleString());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const latestSignal = (ticker: string) =>
    signals.find((s) => s.ticker === ticker);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs text-muted-foreground">
          Last update: {lastUpdate || "loading..."}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Signal Cards */}
        <div className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TICKERS.map((ticker) => {
              const sig = latestSignal(ticker);
              const isSelected = ticker === selectedTicker;
              if (loading)
                return (
                  <Card key={ticker}>
                    <CardHeader>
                      <Skeleton className="h-6 w-20" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-5 w-14" />
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                );
              return (
                <Card
                  key={ticker}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "ring-2 ring-primary shadow-md" : ""
                  }`}
                  onClick={() => setSelectedTicker(ticker)}
                >
                  <CardHeader className="pb-1.5 pt-3 px-4">
                    <CardTitle className="font-mono text-base flex items-center justify-between">
                      {ticker}
                      {sig?.consensus_level && sig.consensus_level !== "?" && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] border ${
                            sig.consensus_level === "strong"
                              ? "border-green-500 text-green-600"
                              : sig.consensus_level === "moderate"
                                ? "border-yellow-500 text-yellow-600"
                                : "border-red-500 text-red-600"
                          }`}
                        >
                          {sig.consensus_level}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-3 px-4">
                    <div className="flex items-center gap-2">
                      <Badge className={`${signalColor(sig?.signal ?? "HOLD")} text-xs`}>
                        {sig?.signal ?? "HOLD"}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {Math.round((sig?.confidence ?? 0) * 100)}%
                      </span>
                    </div>
                    <Progress value={(sig?.confidence ?? 0) * 100} className="h-1.5" />
                    <p className="text-[11px] text-muted-foreground truncate">
                      {sig?.reasoning?.slice(0, 60) ?? "No data yet"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right: Agent Chat */}
        <div className="lg:col-span-2">
          {/* Ticker pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTicker(t)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-mono transition-colors ${
                  t === selectedTicker
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <AgentChat ticker={selectedTicker} />
        </div>
      </div>

      {/* Latest News */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Latest News</h2>
        <div className="space-y-2">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))
            : articles.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between border rounded-md px-4 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.source} &middot; {a.ticker}
                    </p>
                  </div>
                  <Badge
                    className={`ml-3 shrink-0 ${sentimentColor(a.sentiment_label)}`}
                  >
                    {a.sentiment_label ?? "n/a"}
                  </Badge>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
