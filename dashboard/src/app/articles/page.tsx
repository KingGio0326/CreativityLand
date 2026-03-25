"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TICKERS } from "@/lib/constants";

interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  ticker: string;
  sentiment_label: string;
  sentiment_score: number;
  published_at: string;
}

const SENTIMENTS = ["", "positive", "negative", "neutral"];

const sentimentColor = (s: string) =>
  s === "positive"
    ? "bg-green-600"
    : s === "negative"
      ? "bg-red-600"
      : "bg-gray-500";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [ticker, setTicker] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (ticker) params.set("ticker", ticker);
    if (sentiment) params.set("sentiment", sentiment);

    try {
      const res = await fetch(`/api/articles?${params}`);
      const json = await res.json();
      const arr = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
      setArticles(arr);
      setCount(typeof json.count === "number" ? json.count : arr.length);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, ticker, sentiment]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const totalPages = Math.ceil(count / limit) || 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Articles</h1>

      <div className="flex gap-4">
        <select
          value={ticker}
          onChange={(e) => { setTicker(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
          aria-label="Filter by ticker"
        >
          <option value="">All tickers</option>
          {[...TICKERS, "SPY"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={sentiment}
          onChange={(e) => { setSentiment(e.target.value); setPage(1); }}
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
          aria-label="Filter by sentiment"
        >
          <option value="">All sentiments</option>
          {SENTIMENTS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Ticker</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Sentiment</TableHead>
            <TableHead>Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            : articles.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {a.published_at ? new Date(a.published_at).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.ticker}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{a.title}</TableCell>
                  <TableCell className="text-xs">{a.source}</TableCell>
                  <TableCell>
                    {a.sentiment_label ? (
                      <Badge className={sentimentColor(a.sentiment_label)}>
                        {a.sentiment_label}
                      </Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Open
                    </a>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages} ({count} articles)
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
