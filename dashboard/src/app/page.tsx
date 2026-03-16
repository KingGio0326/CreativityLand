"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface Signal {
  id: string;
  ticker: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  created_at: string;
}

interface Article {
  id: string;
  title: string;
  source: string;
  ticker: string;
  sentiment_label: string;
  published_at: string;
}

const TICKERS = ["AAPL", "TSLA", "NVDA", "BTC-USD"];

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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs text-muted-foreground">
          Last update: {lastUpdate || "loading..."}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TICKERS.map((ticker) => {
          const sig = latestSignal(ticker);
          if (loading)
            return (
              <Card key={ticker}>
                <CardHeader>
                  <Skeleton className="h-6 w-20" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            );
          return (
            <Card key={ticker}>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-xl">{ticker}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge className={signalColor(sig?.signal ?? "HOLD")}>
                  {sig?.signal ?? "HOLD"}
                </Badge>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Confidence</span>
                    <span>{Math.round((sig?.confidence ?? 0) * 100)}%</span>
                  </div>
                  <Progress value={(sig?.confidence ?? 0) * 100} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {sig?.reasoning?.slice(0, 80) ?? "No data yet"}
                </p>
                {sig?.created_at && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(sig.created_at).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

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
