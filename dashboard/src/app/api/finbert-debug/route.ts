export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "AAPL";
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "50"),
    200,
  );

  try {
    /* ── fetch articles with sentiment ── */
    const { data: rows, error } = await supabase
      .from("articles")
      .select("*")
      .eq("ticker", ticker)
      .not("sentiment_label", "is", null)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const articles = (rows ?? []).map((r: Record<string, unknown>) => {
      const publishedAt = r.published_at
        ? new Date(r.published_at as string)
        : new Date();
      const hoursAgo =
        (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
      const decayWeight = Math.exp(-hoursAgo / 24);
      const label = (r.sentiment_label as string) ?? "neutral";
      const score = (r.sentiment_score as number) ?? 0;
      const direction =
        label === "positive" ? 1 : label === "negative" ? -1 : 0;
      const contribution = score * direction * decayWeight;

      return {
        id: r.id,
        title: r.title,
        content: r.content,
        url: r.url,
        source: r.source,
        ticker: r.ticker,
        published_at: r.published_at,
        sentiment_label: label,
        sentiment_score: score,
        hours_ago: Math.round(hoursAgo * 10) / 10,
        decay_weight: Math.round(decayWeight * 10000) / 10000,
        direction,
        contribution: Math.round(contribution * 10000) / 10000,
      };
    });

    /* ── aggregate stats ── */
    const distribution = { positive: 0, negative: 0, neutral: 0 };
    let sumContribution = 0;
    let sumWeight = 0;
    let mostImpactful = articles[0] ?? null;

    for (const a of articles) {
      distribution[a.sentiment_label as keyof typeof distribution] =
        (distribution[a.sentiment_label as keyof typeof distribution] ?? 0) + 1;
      sumContribution += a.contribution;
      sumWeight += a.decay_weight;
      if (
        mostImpactful &&
        Math.abs(a.contribution) > Math.abs(mostImpactful.contribution)
      ) {
        mostImpactful = a;
      }
    }

    const weightedScore =
      sumWeight > 0
        ? Math.round((sumContribution / sumWeight) * 10000) / 10000
        : 0;
    const signal =
      weightedScore > 0.15
        ? "BUY"
        : weightedScore < -0.15
          ? "SELL"
          : "HOLD";

    /* ── recent runs for comparison ── */
    const { data: recentSignals } = await supabase
      .from("signals")
      .select("*")
      .eq("ticker", ticker)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      ticker,
      articles,
      stats: {
        count: articles.length,
        weighted_score: weightedScore,
        signal,
        distribution,
        sum_contribution: Math.round(sumContribution * 10000) / 10000,
        sum_weight: Math.round(sumWeight * 10000) / 10000,
        most_impactful: mostImpactful
          ? {
              title: mostImpactful.title,
              label: mostImpactful.sentiment_label,
              score: mostImpactful.sentiment_score,
              contribution: mostImpactful.contribution,
            }
          : null,
      },
      recent_runs: (recentSignals ?? []).map((s: Record<string, unknown>) => ({
        id: s.id,
        signal: s.signal,
        confidence: s.confidence,
        created_at: s.created_at,
        reasoning: s.reasoning,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
