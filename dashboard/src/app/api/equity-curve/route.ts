export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const HORIZONS = ["6h", "24h", "72h", "168h"] as const;

export async function GET() {
  try {
    const { data: rawEvals, error } = await supabase
      .from("signal_evaluations")
      .select(
        "ticker, signal_type, entry_date, entry_price, confidence, " +
        "price_6h, price_24h, price_72h, price_168h, " +
        "score_6h, score_24h, score_72h, score_168h"
      )
      .not("entry_price", "is", null)
      .neq("signal_type", "HOLD")
      .order("entry_date", { ascending: true });

    if (error) throw error;

    const evals = rawEvals ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, Record<string, any[]>> = {};

    for (const h of HORIZONS) {
      const priceKey = `price_${h}` as string;
      const scoreKey = `score_${h}` as string;

      // Filter to only evaluated signals for this horizon
      const valid = evals.filter(
        (e: Record<string, unknown>) =>
          e.entry_price != null &&
          e[priceKey] != null &&
          e[scoreKey] != null,
      );

      // Group by ticker
      const byTicker: Record<string, Record<string, unknown>[]> = {};
      for (const e of valid) {
        const t = e.ticker as string;
        if (!byTicker[t]) byTicker[t] = [];
        byTicker[t].push(e);
      }

      // Build cumulative series per ticker
      const horizonData: Record<string, unknown[]> = {};

      for (const [ticker, signals] of Object.entries(byTicker)) {
        let cumulative = 0;

        horizonData[ticker] = signals.map((e: Record<string, unknown>) => {
          const entryPrice = e.entry_price as number;
          const exitPrice = e[priceKey] as number;
          const signal = e.signal_type as string;

          const pnl =
            signal === "BUY"
              ? exitPrice - entryPrice
              : entryPrice - exitPrice;

          cumulative += pnl;

          return {
            date: (e.entry_date as string)?.slice(0, 10),
            cumulative_pnl: Math.round(cumulative * 100) / 100,
            signal,
            pnl: Math.round(pnl * 100) / 100,
            entry_price: entryPrice,
            exit_price: exitPrice,
          };
        });
      }

      result[h] = horizonData;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Equity curve API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
