export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const HORIZONS = ["6h", "24h", "72h", "168h"] as const;
const INITIAL_PORTFOLIO = 1000;

interface EvalRow {
  signal_id: string;
  ticker: string;
  signal_type: string;
  entry_date: string;
  entry_price: number;
  confidence: number;
  [key: string]: unknown;
}

export async function GET() {
  try {
    const { data: rawEvals, error } = await supabase
      .from("signal_evaluations")
      .select(
        "signal_id, ticker, signal_type, entry_date, entry_price, confidence, " +
          "price_6h, price_24h, price_72h, price_168h, " +
          "score_6h, score_24h, score_72h, score_168h",
      )
      .not("entry_price", "is", null)
      .neq("signal_type", "HOLD")
      .order("entry_date", { ascending: true });

    if (error) throw error;

    const evals = (rawEvals ?? []) as EvalRow[];

    // Batch-fetch position_size_pct from signals table
    const signalIds = [
      ...new Set(evals.map((e) => e.signal_id).filter(Boolean)),
    ];

    const sizingMap: Record<string, number> = {};
    if (signalIds.length > 0) {
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
              sizingMap[row.id as string] = row.position_size_pct as number;
            }
          }
        }
      }
    }

    const result: Record<
      string,
      { portfolio: unknown[]; by_ticker: Record<string, number> }
    > = {};

    for (const h of HORIZONS) {
      const priceKey = `price_${h}`;
      const scoreKey = `score_${h}`;

      // Filter to evaluated signals for this horizon, sorted chronologically
      const valid = evals.filter(
        (e) =>
          e.entry_price != null && e[priceKey] != null && e[scoreKey] != null,
      );

      // Simulate portfolio: single shared pot, chronological order
      let currentPortfolio = INITIAL_PORTFOLIO;
      const tickerPnl: Record<string, number> = {};
      const portfolio: unknown[] = [];

      for (const e of valid) {
        const entryPrice = e.entry_price;
        const exitPrice = e[priceKey] as number;
        const signal = e.signal_type;
        const ticker = e.ticker;
        const sigId = e.signal_id;
        const confidence = e.confidence > 1 ? e.confidence / 100 : e.confidence;

        // Position sizing: Kelly if available, else confidence * 5%
        const posPct = sigId ? sizingMap[sigId] : undefined;
        const effectivePct = posPct != null ? posPct : confidence * 5;
        const allocated = currentPortfolio * (effectivePct / 100);
        const shares = allocated / entryPrice;

        const pnl =
          signal === "BUY"
            ? shares * (exitPrice - entryPrice)
            : shares * (entryPrice - exitPrice);

        currentPortfolio += pnl;
        tickerPnl[ticker] = (tickerPnl[ticker] ?? 0) + pnl;

        portfolio.push({
          date: e.entry_date?.slice(0, 10),
          portfolio_value: Math.round(currentPortfolio * 100) / 100,
          ticker,
          signal,
          pnl: Math.round(pnl * 100) / 100,
          allocated: Math.round(allocated * 100) / 100,
          position_size_pct: Math.round(effectivePct * 100) / 100,
          entry_price: entryPrice,
          exit_price: exitPrice,
        });
      }

      // Round by_ticker values
      const byTicker: Record<string, number> = {};
      for (const [t, v] of Object.entries(tickerPnl)) {
        byTicker[t] = Math.round(v * 100) / 100;
      }

      result[h] = { portfolio, by_ticker: byTicker };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Equity curve API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
