export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "AAPL";

  try {
    // 1. Fetch ALL evaluations that have at least an entry_price
    const evalsRes = await supabase
      .from("signal_evaluations")
      .select("*")
      .eq("ticker", ticker)
      .not("entry_price", "is", null)
      .order("entry_date", { ascending: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawEvals: any[] = evalsRes.data ?? [];

    // 2. Compute stats per horizon
    const horizons = ["6h", "24h", "72h", "168h"] as const;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const horizonStats: Record<string, any> = {};

    for (const h of horizons) {
      const scoreKey = `score_${h}`;
      const returnKey = `return_${h}`;

      const evaluated = rawEvals.filter(
        (e) => e[scoreKey] !== null && e[scoreKey] !== undefined,
      );

      if (evaluated.length === 0) {
        horizonStats[h] = {
          count: 0,
          hit_rate: 0,
          avg_score: 0,
          avg_return: "0.00",
          chart_data: [],
          signals: [],
        };
        continue;
      }

      const correct = evaluated.filter((e) => e[scoreKey] > 0).length;
      const hitRate = correct / evaluated.length;
      const avgScore =
        evaluated.reduce((s: number, e: Record<string, number>) => s + (e[scoreKey] ?? 0), 0) /
        evaluated.length;
      const avgReturn =
        evaluated.reduce((s: number, e: Record<string, number>) => s + (e[returnKey] ?? 0), 0) /
        evaluated.length;

      let cumulative = 0;
      const chartData = evaluated.map((e: Record<string, unknown>) => {
        cumulative += (e[scoreKey] as number) ?? 0;
        return {
          date: (e.entry_date as string)?.slice(0, 10),
          signal: e.signal_type,
          confidence: e.confidence,
          score: e[scoreKey],
          return: e[returnKey],
          cumulative_score: Math.round(cumulative * 100) / 100,
        };
      });

      horizonStats[h] = {
        count: evaluated.length,
        hit_rate: Math.round(hitRate * 100),
        avg_score: (Math.round(avgScore * 100) / 100).toString(),
        avg_return: (avgReturn * 100).toFixed(2),
        chart_data: chartData,
        signals: evaluated.map((e: Record<string, unknown>) => ({
          date: (e.entry_date as string)?.slice(0, 10),
          signal: e.signal_type,
          confidence: e.confidence,
          score: e[scoreKey],
          return: e[returnKey],
        })),
      };
    }

    // 3. Build legacy evaluations list (for the table) — use all evals
    const evaluations = rawEvals.map((e: Record<string, unknown>) => ({
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
    }));

    // 4. Legacy stats (168h) for backwards compat
    const total = evaluations.length;
    const h168 = horizonStats["168h"];
    const positiveSignals = h168.count > 0
      ? Math.round((h168.hit_rate / 100) * h168.count)
      : 0;

    // 5. Legacy chart data (168h cumulative)
    const chartData = h168.chart_data ?? [];

    // Add SPY proxy to chart data
    let cumSpy = 0;
    const chartDataWithSpy = chartData.map(
      (p: { date: string; cumulative_score: number }) => {
        cumSpy += 0.15;
        return {
          ...p,
          spy_cumulative: Math.round(cumSpy * 100) / 100,
        };
      },
    );

    // 6. ML walk-forward validation
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

    // 7. Alpha
    const perfRes = await supabase
      .from("agent_performance")
      .select("*")
      .eq("ticker", ticker)
      .eq("agent_name", "pipeline")
      .order("date", { ascending: false })
      .limit(1);

    const perf = (perfRes.data ?? [])[0] as Record<string, unknown> | undefined;

    const avgReturn168 = h168.count > 0 ? parseFloat(h168.avg_return) / 100 : 0;
    const alpha =
      perf?.alpha != null
        ? (perf.alpha as number)
        : total > 0
          ? avgReturn168 - 0.15
          : 0;

    return NextResponse.json({
      ticker,
      evaluations: evaluations.slice(-30).reverse(),
      horizons: horizonStats,
      stats: {
        total_signals: total,
        hit_rate: h168.hit_rate,
        avg_score: parseFloat(h168.avg_score) || 0,
        cumulative_score:
          h168.chart_data.length > 0
            ? h168.chart_data[h168.chart_data.length - 1].cumulative_score
            : 0,
        avg_return_168h: Math.round(avgReturn168 * 10000) / 100,
        positive_signals: positiveSignals,
        alpha: Math.round((alpha as number) * 100) / 100,
        best_signal: null,
        worst_signal: null,
      },
      chart_data: chartDataWithSpy,
      ml_validation: mlValidation,
    });
  } catch (err) {
    console.error("Performance API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
