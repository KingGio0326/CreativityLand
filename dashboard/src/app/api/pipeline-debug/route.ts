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
    const { data: rows, error } = await supabase
      .from("articles")
      .select("*")
      .eq("ticker", ticker)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const articles = (rows ?? []).map((r: Record<string, unknown>) => {
      const title = (r.title as string) ?? "";
      const content = (r.content as string) ?? "";
      const url = (r.url as string) ?? "";
      const source = (r.source as string) ?? "";
      const publishedAt = r.published_at
        ? new Date(r.published_at as string)
        : new Date();
      const scrapedAt = r.scraped_at
        ? new Date(r.scraped_at as string)
        : null;
      const hoursAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
      const sentimentLabel = (r.sentiment_label as string) ?? null;
      const sentimentScore = (r.sentiment_score as number) ?? 0;
      const processed = !!(r.processed ?? (sentimentLabel !== null));
      const embedding = r.embedding as number[] | null;

      // --- PHASE 1: SCRAPING ---
      const scraping = {
        url,
        source,
        scraped_at: r.scraped_at ?? null,
        title,
        title_length: title.length,
        content_length: content.length,
        has_content: content.length > 0,
        content_preview: content.substring(0, 200) || null,
        content_full: content,
        published_at: r.published_at,
        hours_since_publish: Math.round(hoursAgo * 10) / 10,
      };

      // --- PHASE 2: TEXT PROCESSING ---
      const rawText = title + ". " + content;
      const charCount = rawText.length;
      const estimatedTokens = Math.round(charCount / 4);
      const wasTruncated = estimatedTokens > 512;
      const truncatedText = rawText.substring(0, 2048);
      const sentences = rawText
        .split(".")
        .map((s) => s.trim())
        .filter((s) => s.length > 10);

      const textProcessing = {
        raw_text: rawText,
        char_count: charCount,
        estimated_tokens: estimatedTokens,
        was_truncated: wasTruncated,
        truncated_text: truncatedText,
        sentences,
        sentence_count: sentences.length,
      };

      // --- PHASE 3: SENTIMENT ---
      const direction =
        sentimentLabel === "positive"
          ? 1
          : sentimentLabel === "negative"
            ? -1
            : 0;
      const decayWeight = Math.exp(-hoursAgo / 24);
      const contribution = sentimentScore * direction * decayWeight;

      const sentiment = {
        label: sentimentLabel,
        score: sentimentScore,
        processed,
        direction,
        hours_ago: Math.round(hoursAgo * 10) / 10,
        decay_weight: Math.round(decayWeight * 10000) / 10000,
        contribution: Math.round(contribution * 10000) / 10000,
      };

      // --- PHASE 4: EMBEDDINGS ---
      let embeddingsData: Record<string, unknown> = {
        has_embedding: false,
        dimensions: 0,
        vector_preview: null,
        vector_norm: null,
        vector_stats: null,
        vector_full: null,
      };

      if (embedding && Array.isArray(embedding) && embedding.length > 0) {
        const norm = Math.sqrt(
          embedding.reduce((s, v) => s + v * v, 0),
        );
        const min = Math.min(...embedding);
        const max = Math.max(...embedding);
        const mean = embedding.reduce((s, v) => s + v, 0) / embedding.length;
        const nonzero = embedding.filter(
          (v) => Math.abs(v) > 0.001,
        ).length;

        embeddingsData = {
          has_embedding: true,
          dimensions: embedding.length,
          vector_preview: embedding.slice(0, 8).map((v) => +v.toFixed(4)),
          vector_norm: +norm.toFixed(4),
          vector_stats: {
            min: +min.toFixed(4),
            max: +max.toFixed(4),
            mean: +mean.toFixed(4),
            nonzero,
          },
          vector_full: embedding.map((v) => +v.toFixed(4)),
        };
      }

      return {
        id: r.id,
        scraping,
        text_processing: textProcessing,
        sentiment,
        embeddings: embeddingsData,
      };
    });

    // --- GLOBAL STATS ---
    const total = articles.length;
    const hasContent = articles.filter(
      (a: { scraping: { has_content: boolean } }) => a.scraping.has_content,
    ).length;
    const processedSentiment = articles.filter(
      (a: { sentiment: { processed: boolean } }) => a.sentiment.processed,
    ).length;
    const hasEmbedding = articles.filter(
      (a: { embeddings: { has_embedding: boolean } }) =>
        a.embeddings.has_embedding,
    ).length;

    // --- RECENT SIGNALS (system log) ---
    const { data: recentSignals } = await supabase
      .from("signals")
      .select("*")
      .eq("ticker", ticker)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      ticker,
      total_articles: total,
      phases: {
        scraped: total,
        has_content: hasContent,
        processed_sentiment: processedSentiment,
        has_embedding: hasEmbedding,
      },
      pipeline_health: {
        content_rate: total > 0 ? Math.round((hasContent / total) * 1000) / 10 : 0,
        sentiment_rate: total > 0 ? Math.round((processedSentiment / total) * 1000) / 10 : 0,
        embedding_rate: total > 0 ? Math.round((hasEmbedding / total) * 1000) / 10 : 0,
      },
      articles,
      recent_signals: (recentSignals ?? []).map(
        (s: Record<string, unknown>) => ({
          id: s.id,
          signal: s.signal,
          confidence: s.confidence,
          created_at: s.created_at,
          reasoning: s.reasoning,
        }),
      ),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
