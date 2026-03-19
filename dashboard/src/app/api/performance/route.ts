export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "AAPL";

  try {
    // 1. Completed evaluations (score_168h not null), last 30
    const evalsRes = await supabase
      .from("signal_evaluations")
      .select("*")
      .eq("ticker", ticker)
      .not("score_168h", "is", null)
      .order("entry_date", { ascending: false })
      .limit(30);

    const evaluations = (evalsRes.data ?? []).map(
      (e: Record<string, unknown>) => ({
        id: e.id,
        signal_type: e.signal_type,
        confidence: e.confidence,
        entry_date: e.entry_date,
        entry_price: e.entry_price,
        return_6h: e.return_6h ?? 0,
        return_24h: e.return_24h ?? 0,
        return_72h: e.return_72h ?? 0,
        return_168h: e.return_168h ?? 0,
        score_6h: e.score_6h ?? 0,
        score_24h: e.score_24h ?? 0,
        score_72h: e.score_72h ?? 0,
        score_168h: e.score_168h ?? 0,
      }),
    );

    // 2. Agent performance for this ticker
    const perfRes = await supabase
      .from("agent_performance")
      .select("*")
      .eq("ticker", ticker)
      .eq("agent_name", "pipeline")
      .order("date", { ascending: false })
      .limit(1);

    const perf = (perfRes.data ?? [])[0] as Record<string, unknown> | undefined;

    // 3. Compute stats from evaluations
    const total = evaluations.length;
    const positiveSignals = evaluations.filter(
      (e: { score_168h: number }) => e.score_168h > 0,
    ).length;
    const hitRate = total > 0 ? positiveSignals / total : 0;
    const scores168 = evaluations.map(
      (e: { score_168h: number }) => e.score_168h,
    );
    const returns168 = evaluations.map(
      (e: { return_168h: number }) => e.return_168h,
    );
    const avgScore =
      scores168.length > 0
        ? scores168.reduce((a: number, b: number) => a + b, 0) /
          scores168.length
        : 0;
    const cumulativeScore = scores168.reduce(
      (a: number, b: number) => a + b,
      0,
    );
    const avgReturn168 =
      returns168.length > 0
        ? returns168.reduce((a: number, b: number) => a + b, 0) /
          returns168.length
        : 0;

    // Best and worst signal
    let bestSignal = null;
    let worstSignal = null;
    if (evaluations.length > 0) {
      const sorted = [...evaluations].sort(
        (
          a: { return_168h: number },
          b: { return_168h: number },
        ) => b.return_168h - a.return_168h,
      );
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      bestSignal = {
        date: best.entry_date,
        ticker,
        return: best.return_168h,
      };
      worstSignal = {
        date: worst.entry_date,
        ticker,
        return: worst.return_168h,
      };
    }

    // 4. Build chart data (chronological order)
    const chronological = [...evaluations].reverse();
    let cumScore = 0;
    let cumSpy = 0;
    const chartData = chronological.map(
      (e: { entry_date: string; score_168h: number; return_168h: number }) => {
        cumScore += e.score_168h;
        // Use avg market return (~0.15% per week) as SPY proxy
        cumSpy += 0.15;
        const d = new Date(e.entry_date);
        return {
          date: d.toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
          }),
          cumulative_score: Math.round(cumScore * 100) / 100,
          spy_cumulative: Math.round(cumSpy * 100) / 100,
        };
      },
    );

    // 5. ML walk-forward validation
    let mlValidation = null;
    try {
      const mlRes = await supabase
        .from("ml_validation")
        .select("*")
        .eq("ticker", ticker)
        .maybeSingle();
      mlValidation = mlRes.data ?? null;
    } catch {
      // table may not exist yet
    }

    const alpha =
      perf?.alpha != null
        ? (perf.alpha as number)
        : total > 0
          ? avgReturn168 - 0.15
          : 0;

    return NextResponse.json({
      ticker,
      evaluations,
      stats: {
        total_signals: total,
        hit_rate: Math.round(hitRate * 1000) / 10,
        avg_score: Math.round(avgScore * 100) / 100,
        cumulative_score: Math.round(cumulativeScore * 100) / 100,
        avg_return_168h: Math.round(avgReturn168 * 100) / 100,
        positive_signals: positiveSignals,
        alpha: Math.round((alpha as number) * 100) / 100,
        best_signal: bestSignal,
        worst_signal: worstSignal,
      },
      chart_data: chartData,
      ml_validation: mlValidation,
    });
  } catch (err) {
    console.error("Performance API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
