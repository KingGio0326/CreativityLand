"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

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

const TICKERS = ["AAPL", "TSLA", "NVDA", "BTC-USD"];

const signalColor = (s: string) =>
  s === "BUY" ? "bg-green-600" : s === "SELL" ? "bg-red-600" : "bg-gray-500";

const sentimentColor = (s: string) =>
  s === "positive"
    ? "bg-green-600"
    : s === "negative"
      ? "bg-red-600"
      : "bg-gray-500";

const consensusColor = (c: string) =>
  c === "strong"
    ? "bg-green-500"
    : c === "moderate"
      ? "bg-yellow-500"
      : "bg-red-500";

const consensusWidth = (c: string) =>
  c === "strong" ? "100%" : c === "moderate" ? "60%" : "30%";

function VoteIcon({ signal }: { signal: string }) {
  if (signal === "BUY") return <span className="text-green-500 font-bold">&#10003;</span>;
  if (signal === "SELL") return <span className="text-red-500 font-bold">&#10007;</span>;
  return <span className="text-gray-400">&mdash;</span>;
}

function AgentVotes({ sig }: { sig: Signal }) {
  const [open, setOpen] = useState(false);
  const votes = sig.vote_breakdown;
  if (!votes || Object.keys(votes).length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
      >
        <span>{open ? "\u25BC" : "\u25B6"}</span>
        Agent Votes ({sig.agents_agree ?? 0}/{sig.agents_total ?? 0})
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {/* Consensus bar */}
          {sig.consensus_level && (
            <div className="mb-2">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Consensus</span>
                <span className="capitalize">{sig.consensus_level}</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${consensusColor(sig.consensus_level)}`}
                  style={{ width: consensusWidth(sig.consensus_level) }}
                />
              </div>
            </div>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-1 mb-1">
            {sig.macro_adjusted && (
              <Badge className="bg-orange-500 text-[10px] px-1.5 py-0">MACRO ADJUSTED</Badge>
            )}
            {sig.macro_events && sig.macro_events.length > 0 && (
              <Badge className="bg-red-700 text-[10px] px-1.5 py-0">WAR/CONFLICT</Badge>
            )}
          </div>

          {/* Agent list */}
          {Object.entries(votes).map(([name, vote]) => (
            <div
              key={name}
              className={`flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded ${
                sig.dominant_factor === name ? "bg-blue-50 dark:bg-blue-950 font-semibold" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <VoteIcon signal={vote.signal} />
                <span className={sig.dominant_factor === name ? "font-bold" : ""}>
                  {name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={`${signalColor(vote.signal)} text-[9px] px-1 py-0`}
                  variant="default"
                >
                  {vote.signal}
                </Badge>
                <span className="text-muted-foreground w-8 text-right">
                  {Math.round(vote.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}

          {/* Dominant factor */}
          {sig.dominant_factor && sig.dominant_factor !== "?" && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Dominant: <strong>{sig.dominant_factor}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
                <div className="flex items-center gap-2">
                  <Badge className={signalColor(sig?.signal ?? "HOLD")}>
                    {sig?.signal ?? "HOLD"}
                  </Badge>
                  {sig?.consensus_level && sig.consensus_level !== "?" && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] border ${
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
                </div>
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
                {sig && <AgentVotes sig={sig} />}
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
