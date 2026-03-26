export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const HORIZONS = ["6h", "24h", "72h", "168h"] as const;
const PORTFOLIO_CAPITAL = 100_000;
const DEFAULT_POSITION = 1_000;

export async function GET() {
  try {
    // Fetch evaluations with position sizing from signals table
    const { data: rawEvals, error } = await supabase
      .from("signal_evaluations")
      .select(
        "signal_id, ticker, signal_type, entry_date, entry_price, confidence, " +
        "price_6h, price_24h, price_72h, price_168h, " +
        "score_6h, score_24h, score_72h, score_168h"
      )
      .not("entry_price", "is", null)
      .neq("signal_type", "HOLD")
      .order("entry_date", { ascending: true });

    if (error) throw error;

    const evals = rawEvals ?? [];

    // Batch-fetch position sizing from signals table
    const signalIds = [
      ...new Set(
        evals
          .map((e: Record<string, unknown>) => e.signal_id as string)
          .filter(Boolean),
      ),
    ];

    const sizingMap: Record<string, number> = {};
    if (signalIds.length > 0) {
      // Supabase IN filter has a limit, fetch in chunks
      const chunkSize = 200;
      for (let i = 0; i < signalIds.length; i += chunkSize) {
        const chunk = signalIds.slice(i, i + chunkSize);
        const { data: sigRows } = await supabase
          .from("signals")
          .select("id, position_size_pct")
          .in("id", chunk);
        if (sigRows) {
          for (const row of sigRows) {
            if (row.position_size_pct != null) {
              sizingMap[row.id] = row.position_size_pct as number;
            }
          }
        }
      }
    }

    const result: Record<string, Record<string, unknown[]>> = {};

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
          const sigId = e.signal_id as string;

          // Use Kelly position sizing if available, else $1000 flat
          const posPct = sigId ? sizingMap[sigId] : undefined;
          const positionUsd =
            posPct != null
              ? (posPct / 100) * PORTFOLIO_CAPITAL
              : DEFAULT_POSITION;

          // P&L = return% * position size
          const returnPct =
            signal === "BUY"
              ? (exitPrice - entryPrice) / entryPrice
              : (entryPrice - exitPrice) / entryPrice;

          const pnl = returnPct * positionUsd;
          cumulative += pnl;

          return {
            date: (e.entry_date as string)?.slice(0, 10),
            cumulative_pnl: Math.round(cumulative * 100) / 100,
            signal,
            pnl: Math.round(pnl * 100) / 100,
            entry_price: entryPrice,
            exit_price: exitPrice,
            position_usd: Math.round(positionUsd),
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
