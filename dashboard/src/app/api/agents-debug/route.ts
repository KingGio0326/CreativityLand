export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Known agent prefixes for reconstructing fragmented pipe-separated reasoning
const AGENT_PREFIXES = [
  "SentimentAgent:", "SocialAgent:", "TechnicalAgent:",
  "FundamentalAgent:", "MacroAgent:", "MomentumAgent:",
  "MeanReversionAgent:", "MLAgent:", "ResearchAgent:",
  "RiskAgent:", "LiquidityAgent:", "OptionsAgent:", "WeightedVote:", "CriticAgent:",
];

function parseReasoning(raw: unknown): string[] {
  if (!raw) return [];

  // Already a proper array (jsonb column or parsed)
  if (Array.isArray(raw)) return raw;

  if (typeof raw !== "string") return [];

  // Try JSON parse first (new format: json.dumps([...]))
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not JSON — fall through to legacy pipe split
  }

  // Legacy format: pipe-separated string
  // Problem: WeightedVote lines contain " | " internally
  // Fix: split then rejoin fragments that don't start with a known prefix
  const fragments = raw.split(" | ");
  const lines: string[] = [];

  for (const frag of fragments) {
    const isAgentLine = AGENT_PREFIXES.some((p) => frag.startsWith(p));
    if (isAgentLine || lines.length === 0) {
      lines.push(frag);
    } else {
      // Append to previous line (it was fragmented by the split)
      lines[lines.length - 1] += " | " + frag;
    }
  }

  return lines;
}

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

    // Parse reasoning — handles JSON array, JSON string, or legacy pipe-separated
    const reasoning = parseReasoning(signal?.reasoning);

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
      const r = parseReasoning(s.reasoning);
      // Extract sentiment score from SentimentAgent reasoning line
      const sentLine = r.find((l: string) => l.startsWith("SentimentAgent:")) ?? "";
      const scoreMatch = sentLine.match(/score=([\d.-]+)/);
      const histSentScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;

      return {
        signal: s.signal,
        confidence: s.confidence,
        created_at: s.created_at,
        sentiment_score: histSentScore,
      };
    });

    // Extract research data from reasoning
    const researchLine = reasoning.find((l: string) => l.startsWith("ResearchAgent:")) ?? "";
    const paperCountMatch = researchLine.match(/(\d+)\s*paper\s*arXiv/i);
    const researchPapersCount = paperCountMatch ? parseInt(paperCountMatch[1]) : 0;

    // Extract research_context (the Claude insight text after the count prefix)
    let researchContext = "";
    const contextMatch = researchLine.match(/paper arXiv analizzati\.\s*(.*)/i);
    if (contextMatch) {
      researchContext = contextMatch[1].replace(/\.\.\.$/,"");
    }

    // Research papers are stored in the signal record if available
    const researchPapers: { title: string; url: string }[] =
      (signal as Record<string, unknown>)?.research_papers as { title: string; url: string }[] ?? [];

    // Extract liquidity data from reasoning
    const liquidityLine = reasoning.find((l: string) => l.startsWith("LiquidityAgent:")) ?? "";
    const liqScoreMatch = liquidityLine.match(/score=([\d.-]+)/);
    const liqSignalMatch = liquidityLine.match(/LiquidityAgent:\s*(BUY|SELL|HOLD)/);
    const liqConfMatch = liquidityLine.match(/\((\d+)%\)/);

    // Parse individual indicators from the reasoning line
    const fedBsMatch = liquidityLine.match(/Fed balance sheet (\w+) \(([^)]+)\)/);
    const fedRateMatch = liquidityLine.match(/Fed funds rate (\w+)/);
    const ycMatch = liquidityLine.match(/Yield curve invertita \(([^)]+)\)/);
    const vixMatch = liquidityLine.match(/VIX ([\d.]+) \((\w+)\)/);

    const liquidity = liquidityLine ? {
      signal: liqSignalMatch?.[1] ?? "HOLD",
      confidence: liqConfMatch ? parseInt(liqConfMatch[1]) : 0,
      score: liqScoreMatch ? parseFloat(liqScoreMatch[1]) : 0,
      direction: (liqScoreMatch ? (parseFloat(liqScoreMatch[1]) > 0.3 ? "bullish" : parseFloat(liqScoreMatch[1]) < -0.3 ? "bearish" : "neutral") : "neutral"),
      fed_balance_sheet: fedBsMatch ? { direction: fedBsMatch[1], change_pct: fedBsMatch[2] } : null,
      fed_funds_rate: fedRateMatch ? { direction: fedRateMatch[1] } : null,
      yield_curve: ycMatch ? { value: ycMatch[1], inverted: true } : { value: null, inverted: false },
      vix: vixMatch ? { value: parseFloat(vixMatch[1]), regime: vixMatch[2] } : null,
    } : null;

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
      liquidity,
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
      research: {
        papers_count: researchPapersCount,
        context: researchContext,
        papers: researchPapers,
      },
      history,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
