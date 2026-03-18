export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/* ── Alpha Vantage: fetch last 30 daily closes ────────── */
interface AVDaily {
  [date: string]: {
    "1. open": string;
    "2. high": string;
    "3. low": string;
    "4. close": string;
    "5. volume": string;
  };
}

async function fetchPricesYahoo(
  ticker: string,
): Promise<{ dates: string[]; prices: number[] } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2mo`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      console.error("Yahoo Finance HTTP error:", res.status);
      return null;
    }
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) {
      console.error("Yahoo Finance no result");
      return null;
    }
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const filtered: { date: string; price: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        const d = new Date(timestamps[i] * 1000);
        filtered.push({
          date: d.toISOString().slice(0, 10),
          price: closes[i] as number,
        });
      }
    }
    const last30 = filtered.slice(-30);
    if (last30.length < 20) {
      console.error("Yahoo Finance insufficient data:", last30.length);
      return null;
    }
    console.log("Yahoo Finance fallback OK:", last30.length, "closes for", ticker);
    return {
      dates: last30.map((d) => d.date),
      prices: last30.map((d) => d.price),
    };
  } catch (err) {
    console.error("Yahoo Finance fetch error:", err);
    return null;
  }
}

async function fetchPrices(
  ticker: string,
): Promise<{ dates: string[]; prices: number[] } | null> {
  const key = process.env.ALPHA_VANTAGE_KEY ?? process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    console.error("ALPHA_VANTAGE_KEY not set, trying Yahoo fallback");
    return fetchPricesYahoo(ticker);
  }

  const url =
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
    `&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${key}`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    console.error("Alpha Vantage HTTP error:", res.status, "— trying Yahoo fallback");
    return fetchPricesYahoo(ticker);
  }

  const json = await res.json();
  const series: AVDaily | undefined = json["Time Series (Daily)"];
  if (!series) {
    console.error("Alpha Vantage no data:", JSON.stringify(json).slice(0, 200), "— trying Yahoo fallback");
    return fetchPricesYahoo(ticker);
  }

  // Sorted descending by date — take 30 most recent then reverse to ascending
  const entries = Object.entries(series).slice(0, 30).reverse();
  return {
    dates: entries.map(([d]) => d),
    prices: entries.map(([, v]) => parseFloat(v["4. close"])),
  };
}

/* ── Fetch SPY data for regime detection ─────────────── */
async function fetchSpyCloses(): Promise<number[]> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=12mo";
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      console.error("SPY fetch HTTP error:", res.status);
      return [];
    }
    const json = await res.json();
    const closes: (number | null)[] =
      json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return closes.filter((v): v is number => v != null);
  } catch (err) {
    console.error("SPY fetch error:", err);
    return [];
  }
}

/* ── Market regime detection (TypeScript port) ───────── */
function calcRegime(closes: number[]): {
  regime: string;
  vix_approx: number;
  spy_trend_30d: number;
} {
  const last = closes[closes.length - 1];
  const ma200Slice = closes.slice(-200);
  const ma200 = ma200Slice.reduce((a, b) => a + b, 0) / ma200Slice.length;

  const returns30 = closes
    .slice(-31)
    .map((v, i, arr) => (i === 0 ? 0 : Math.log(v / arr[i - 1])))
    .slice(1);

  const vix =
    Math.sqrt(returns30.reduce((a, b) => a + b * b, 0) / returns30.length) *
    Math.sqrt(252) *
    100;

  const spy_trend_30d =
    closes.length >= 30
      ? ((last - closes[closes.length - 30]) / closes[closes.length - 30]) * 100
      : 0;

  let regime = "sideways";
  if (last > ma200 && vix < 25) regime = "bull";
  else if (last < ma200 && vix > 25) regime = "bear";
  else if (last > ma200 && vix >= 25) regime = "volatile_bull";

  return {
    regime,
    vix_approx: Math.round(vix * 100) / 100,
    spy_trend_30d: Math.round(spy_trend_30d * 100) / 100,
  };
}

/* ── Normalize prices to [-1,1] relative to first, resample to 30 ── */
function normalizePattern(prices: number[]): number[] {
  const base = prices[0];
  const returns = prices.map((p) => (p - base) / base);

  // Simple linear interpolation to exactly 30 points
  if (returns.length === 30) return returns;

  const out: number[] = [];
  for (let i = 0; i < 30; i++) {
    const srcIdx = (i / 29) * (returns.length - 1);
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, returns.length - 1);
    const frac = srcIdx - lo;
    out.push(returns[lo] * (1 - frac) + returns[hi] * frac);
  }
  return out;
}

/* ── Stats helper ──────────────────────────────────────── */
function outcomeStats(vals: number[]) {
  if (vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const median =
    vals.length % 2 === 1
      ? sorted[Math.floor(vals.length / 2)]
      : (sorted[vals.length / 2 - 1] + sorted[vals.length / 2]) / 2;
  const positiveRate = (vals.filter((v) => v > 0).length / vals.length) * 100;

  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    positive_rate: Math.round(positiveRate * 10) / 10,
    count: vals.length,
  };
}

/* ── Recommendation logic ─────────────────────────────── */
function generateRecommendation(stats10d: ReturnType<typeof outcomeStats>) {
  if (!stats10d || stats10d.count < 3) {
    return {
      signal: "HOLD" as const,
      reason: stats10d
        ? `Solo ${stats10d.count} pattern simili — confidenza bassa`
        : "Dati insufficienti",
    };
  }

  const { mean, positive_rate, count } = stats10d;

  if (mean > 2.0 && positive_rate > 65) {
    return {
      signal: "BUY" as const,
      mean_return: mean,
      positive_rate,
      sample_size: count,
      reason:
        `Pattern simili hanno prodotto +${mean.toFixed(1)}% ` +
        `in media nei 10gg successivi ` +
        `(${positive_rate.toFixed(0)}% dei casi positivi)`,
    };
  }

  if (mean < -2.0 && positive_rate < 35) {
    return {
      signal: "SELL" as const,
      mean_return: mean,
      positive_rate,
      sample_size: count,
      reason:
        `Pattern simili hanno prodotto ${mean.toFixed(1)}% ` +
        `in media nei 10gg successivi ` +
        `(${(100 - positive_rate).toFixed(0)}% dei casi negativi)`,
    };
  }

  return {
    signal: "HOLD" as const,
    mean_return: mean,
    positive_rate,
    sample_size: count,
    reason:
      `Pattern simili con rendimento medio ${mean.toFixed(1)}% ` +
      `— segnale non chiaro`,
  };
}

/* ── Combined signal logic ────────────────────────────── */
function combineSignals(
  pipelineSignal: string | null,
  patternSignal: string,
): string {
  if (!pipelineSignal) return patternSignal;

  if (pipelineSignal === "BUY" && patternSignal === "BUY") return "STRONG BUY";
  if (pipelineSignal === "SELL" && patternSignal === "SELL")
    return "STRONG SELL";
  if (pipelineSignal === patternSignal) return pipelineSignal;
  return "HOLD";
}

/* ── Main handler ─────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "AAPL";

  try {
    // 1. Fetch current prices, SPY for regime, and latest pipeline signal in parallel
    const [priceData, spyCloses, signalRes] = await Promise.all([
      fetchPrices(ticker),
      fetchSpyCloses(),
      supabase
        .from("signals")
        .select("signal, confidence")
        .eq("ticker", ticker)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (!priceData || priceData.prices.length < 5) {
      return NextResponse.json(
        { error: `Dati prezzi non disponibili per ${ticker}` },
        { status: 404 },
      );
    }

    const { dates, prices } = priceData;
    const currentPrice = prices[prices.length - 1];
    const change30d = ((currentPrice - prices[0]) / prices[0]) * 100;

    // 2. Calculate market regime from SPY data
    const regimeData =
      spyCloses.length >= 30
        ? calcRegime(spyCloses)
        : { regime: "bull", vix_approx: 20, spy_trend_30d: 0 };

    console.log("Market regime detected:", regimeData);

    // 3. Normalize and search similar patterns via RPC
    const vector = normalizePattern(prices);

    console.log("Current vector length:", vector?.length);
    console.log("Current vector sample:", vector?.slice(0, 5));

    // Tentativo 1: cerca nel regime corrente
    interface MatchedPattern {
      start_date: string;
      end_date: string;
      pattern_vector: number[];
      outcome_5d: number | null;
      outcome_10d: number | null;
      outcome_20d: number | null;
      similarity: number;
      market_regime?: string;
      vix_approx?: number;
      spy_trend_30d?: number;
      is_crisis?: boolean;
    }

    let matchRes = await supabase.rpc("match_patterns", {
      query_vector: vector,
      match_ticker: ticker,
      match_count: 10,
      filter_regime: regimeData.regime,
      include_crises: true,
    });

    let similar: MatchedPattern[] = matchRes.data ?? [];

    console.log("RPC attempt 1 (regime:", regimeData.regime, ") count:", similar.length);
    console.log("RPC error:", matchRes.error);

    // Tentativo 2: se meno di 3 risultati, cerca in tutti i regimi
    if (similar.length < 3) {
      console.log("Fallback: searching all regimes...");
      const fallbackRes = await supabase.rpc("match_patterns", {
        query_vector: vector,
        match_ticker: ticker,
        match_count: 10,
        filter_regime: null,
        include_crises: true,
      });

      if (fallbackRes.data && fallbackRes.data.length > 0) {
        similar = fallbackRes.data;
        console.log("RPC fallback count:", similar.length);
      }
      console.log("RPC fallback error:", fallbackRes.error);
    }

    console.log("RPC first result:", similar[0]);

    // 4. Compute outcome stats
    const o5 = similar
      .filter((p) => p.outcome_5d != null)
      .map((p) => p.outcome_5d as number);
    const o10 = similar
      .filter((p) => p.outcome_10d != null)
      .map((p) => p.outcome_10d as number);
    const o20 = similar
      .filter((p) => p.outcome_20d != null)
      .map((p) => p.outcome_20d as number);

    const stats10 = outcomeStats(o10);
    const recommendation = generateRecommendation(stats10);

    const bestMatch = similar[0] ?? null;

    // 5. Pipeline signal
    const pipelineRow = signalRes.data?.[0] ?? null;

    const combinedSignal = combineSignals(
      pipelineRow?.signal ?? null,
      recommendation.signal,
    );

    return NextResponse.json({
      ticker,
      current: {
        prices,
        dates,
        current_price: Math.round(currentPrice * 100) / 100,
        change_30d_pct: Math.round(change30d * 100) / 100,
      },
      market_regime: regimeData.regime,
      vix_approx: regimeData.vix_approx,
      spy_trend_30d: regimeData.spy_trend_30d,
      similar: similar.slice(0, 3).map((p) => ({
        start_date: p.start_date,
        end_date: p.end_date,
        prices: p.pattern_vector,
        outcome_5d: p.outcome_5d,
        outcome_10d: p.outcome_10d,
        outcome_20d: p.outcome_20d,
        similarity: Math.round(p.similarity * 10000) / 10000,
        market_regime: p.market_regime ?? "unknown",
        is_crisis: p.is_crisis ?? false,
      })),
      analysis: {
        patterns_found: similar.length,
        best_similarity: bestMatch
          ? Math.round(bestMatch.similarity * 10000) / 10000
          : 0,
        best_match_date: bestMatch?.end_date ?? null,
        outcomes: {
          "5d": outcomeStats(o5),
          "10d": stats10,
          "20d": outcomeStats(o20),
        },
        recommendation,
      },
      pipeline_signal: {
        signal: pipelineRow?.signal ?? null,
        confidence: pipelineRow?.confidence ?? null,
        combined_signal: combinedSignal,
      },
      debug: {
        vector_length: vector?.length,
        regime_detected: regimeData.regime,
        patterns_found: similar.length,
        spy_data_points: spyCloses.length,
      },
    });
  } catch (err) {
    console.error("Pattern API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
