export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: evaluated, error: evalErr } = await supabase
      .from("pattern_evaluations")
      .select("*")
      .eq("evaluated", true)
      .order("signal_date", { ascending: false });

    if (evalErr) throw evalErr;

    const rows = evaluated ?? [];
    const total = rows.length;

    if (total === 0) {
      return NextResponse.json({
        has_data: false,
        total: 0,
        hit_rate: 0,
        avg_boost: 0,
        by_regime: {},
        by_prediction: {},
        recent: [],
      });
    }

    // Overall hit rate
    const correct = rows.filter((r) => r.pattern_correct === true).length;
    const hitRate = Math.round((correct / total) * 100);

    // Avg boost (absolute value)
    const avgBoost =
      Math.round(
        (rows.reduce((s, r) => s + Math.abs(r.pattern_boost ?? 0), 0) / total) *
          10000,
      ) / 100; // as percentage

    // By regime
    const regimeMap: Record<string, { correct: number; total: number }> = {};
    for (const r of rows) {
      const regime = r.regime_at_signal ?? "unknown";
      if (!regimeMap[regime]) regimeMap[regime] = { correct: 0, total: 0 };
      regimeMap[regime].total++;
      if (r.pattern_correct) regimeMap[regime].correct++;
    }
    const byRegime: Record<string, { hit_rate: number; total: number }> = {};
    for (const [k, v] of Object.entries(regimeMap)) {
      byRegime[k] = {
        hit_rate: Math.round((v.correct / v.total) * 100),
        total: v.total,
      };
    }

    // By prediction type
    const predMap: Record<string, { correct: number; total: number }> = {};
    for (const r of rows) {
      const pred = r.pattern_prediction ?? "neutral";
      if (!predMap[pred]) predMap[pred] = { correct: 0, total: 0 };
      predMap[pred].total++;
      if (r.pattern_correct) predMap[pred].correct++;
    }
    const byPrediction: Record<string, { hit_rate: number; total: number }> = {};
    for (const [k, v] of Object.entries(predMap)) {
      byPrediction[k] = {
        hit_rate: Math.round((v.correct / v.total) * 100),
        total: v.total,
      };
    }

    // Recent 20
    const recent = rows.slice(0, 20).map((r) => ({
      id: r.id,
      ticker: r.ticker,
      date: r.signal_date,
      prediction: r.pattern_prediction,
      boost: r.pattern_boost,
      patterns_matched: r.patterns_matched,
      best_similarity: r.best_similarity,
      regime: r.regime_at_signal,
      regime_filtered: r.regime_filtered,
      actual_return: r.actual_return_168h,
      correct: r.pattern_correct,
    }));

    return NextResponse.json({
      has_data: true,
      total,
      hit_rate: hitRate,
      avg_boost: avgBoost,
      by_regime: byRegime,
      by_prediction: byPrediction,
      recent,
    });
  } catch (err) {
    console.error("Patterns performance API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
