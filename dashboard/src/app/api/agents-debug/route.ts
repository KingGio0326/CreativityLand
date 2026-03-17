export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "AAPL";

  try {
    const [signalRes, articlesRes] = await Promise.all([
      supabase
        .from("signals")
        .select("*")
        .eq("ticker", ticker)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("articles")
        .select("*")
        .eq("ticker", ticker)
        .not("sentiment_label", "is", null)
        .order("published_at", { ascending: false })
        .limit(50),
    ]);

    if (signalRes.error) {
      return NextResponse.json(
        { error: signalRes.error.message },
        { status: 500 },
      );
    }
    if (articlesRes.error) {
      return NextResponse.json(
        { error: articlesRes.error.message },
        { status: 500 },
      );
    }

    const allSignals = signalRes.data ?? [];
    const signal = allSignals[0] ?? null;
    const articles = articlesRes.data ?? [];

    // Parse reasoning
    let reasoning: string[] = [];
    if (signal?.reasoning) {
      reasoning =
        typeof signal.reasoning === "string"
          ? signal.reasoning.split(" | ")
          : Array.isArray(signal.reasoning)
            ? signal.reasoning
            : [];
    }

    // Debug log — temporary
    console.log("=== REASONING ARRAY ===");
    console.log(JSON.stringify(signal?.reasoning, null, 2));

    // Sentiment stats from articles (server-side, not from reasoning)
    const positive = articles.filter(
      (a) => a.sentiment_label === "positive",
    ).length;
    const negative = articles.filter(
      (a) => a.sentiment_label === "negative",
    ).length;
    const neutral = articles.filter(
      (a) => a.sentiment_label === "neutral",
    ).length;

    let weightedSum = 0;
    let weightTotal = 0;
    let articlesWithEmbedding = 0;

    for (const a of articles) {
      const hoursAgo =
        (Date.now() - new Date(a.published_at as string).getTime()) / 3600000;
      const w = Math.exp(-hoursAgo / 24);
      const dir =
        a.sentiment_label === "positive"
          ? 1
          : a.sentiment_label === "negative"
            ? -1
            : 0;
      weightedSum += ((a.sentiment_score as number) ?? 0) * dir * w;
      weightTotal += w;

      if (a.embedding != null) {
        articlesWithEmbedding++;
      }
    }

    const sentimentScore =
      weightTotal > 0
        ? Math.round((weightedSum / weightTotal) * 10000) / 10000
        : 0;

    const topArticles = articles.slice(0, 5).map((a) => ({
      title: ((a.title as string) ?? "").substring(0, 60),
      label: a.sentiment_label as string,
      score: a.sentiment_score as number,
      source: a.source as string,
    }));

    // Build history from all signals
    const history = allSignals.map((s) => {
      let r: string[] = [];
      if (s.reasoning) {
        r =
          typeof s.reasoning === "string"
            ? s.reasoning.split(" | ")
            : Array.isArray(s.reasoning)
              ? s.reasoning
              : [];
      }
      // Extract sentiment score from SentimentAgent reasoning line
      const sentLine = r.find((l: string) => l.startsWith("SentimentAgent:")) ?? "";
      const scoreMatch = sentLine.match(/score=([\d.-]+)/);
      const sentimentScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;

      return {
        signal: s.signal,
        confidence: s.confidence,
        created_at: s.created_at,
        sentiment_score: sentimentScore,
      };
    });

    return NextResponse.json({
      ticker,
      signal: signal
        ? {
            signal: signal.signal,
            confidence: signal.confidence,
            created_at: signal.created_at,
            reasoning,
          }
        : null,
      sentiment: {
        articles_analyzed: articles.length,
        positive,
        negative,
        neutral,
        weighted_score: sentimentScore,
        top_articles: topArticles,
      },
      stats: {
        total: articles.length,
        positive,
        negative,
        neutral,
        weighted_score: sentimentScore,
        articles_with_embedding: articlesWithEmbedding,
      },
      history,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
