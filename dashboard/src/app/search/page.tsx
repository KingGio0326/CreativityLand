"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TICKERS } from "@/lib/constants";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  source: string;
  ticker: string;
  sentiment_label: string;
  similarity?: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ticker: ticker || undefined }),
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Semantic Search</h1>

      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search articles by meaning..."
          aria-label="Cerca articoli per significato"
          className="flex-1 border rounded-md px-4 py-2 text-sm bg-background"
        />
        <select
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
          aria-label="Filtra per ticker"
        >
          <option value="">All tickers</option>
          {TICKERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Button onClick={handleSearch} disabled={loading || !query.trim()}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-5 w-3/4" /></CardHeader>
                <CardContent><Skeleton className="h-4 w-full" /></CardContent>
              </Card>
            ))
          : results.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{r.title}</CardTitle>
                    {r.similarity != null && (
                      <Badge variant="outline">
                        {(r.similarity * 100).toFixed(1)}% match
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.source} &middot; {r.ticker}
                    {r.sentiment_label && (
                      <Badge
                        className={`ml-2 ${
                          r.sentiment_label === "positive"
                            ? "bg-green-600"
                            : r.sentiment_label === "negative"
                              ? "bg-red-600"
                              : "bg-gray-500"
                        }`}
                      >
                        {r.sentiment_label}
                      </Badge>
                    )}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {r.content?.slice(0, 200)}
                  </p>
                </CardContent>
              </Card>
            ))}
        {searched && !loading && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No results found.
          </p>
        )}
      </div>
    </div>
  );
}
