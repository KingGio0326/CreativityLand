// DEPRECATED: SL/TP chart removed from /performance — use /api/portfolio for live data
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const INITIAL_PORTFOLIO = 1000;

// Default SL/TP percentages when ExitStrategyAgent data is missing
const DEFAULT_SL_PCT = 2.5; // 2.5% stop loss
const DEFAULT_TP_PCT = 5.0; // 5.0% take profit
const DEFAULT_RR = 2.0;

interface EvalRow {
  signal_id: string;
  ticker: string;
  signal_type: string;
  entry_date: string;
  entry_price: number;
  confidence: number;
  price_6h: number | null;
  price_24h: number | null;
  price_72h: number | null;
  price_168h: number | null;
  [key: string]: unknown;
}

interface SltpInfo {
  stop_loss: number;
  take_profit: number;
  sl_percentage: number;
  tp_percentage: number;
  risk_reward_ratio: number;
  trailing_activation: number | null;
  trailing_level: number | null;
  position_size_pct: number | null;
  estimated: boolean;
}

interface TradeResult {
  date: string;
  portfolio_value: number;
  ticker: string;
  signal: string;
  entry_price: number;
  exit_price: number;
  exit_reason: "sl" | "tp" | "trailing" | "horizon";
  pnl: number;
  allocated: number;
  position_size_pct: number;
  sl: number;
  tp: number;
  rr: number;
}

/**
 * Compute SL/TP levels — use DB values if available, otherwise estimate.
 */
function getSltpLevels(
  entryPrice: number,
  signalType: string,
  dbData: Record<string, unknown> | null,
): SltpInfo {
  if (dbData && dbData.stop_loss != null && dbData.take_profit != null) {
    return {
      stop_loss: dbData.stop_loss as number,
      take_profit: dbData.take_profit as number,
      sl_percentage: (dbData.sl_percentage as number) ?? DEFAULT_SL_PCT,
      tp_percentage: (dbData.tp_percentage as number) ?? DEFAULT_TP_PCT,
      risk_reward_ratio: (dbData.risk_reward_ratio as number) ?? DEFAULT_RR,
      trailing_activation: (dbData.trailing_activation as number) ?? null,
      trailing_level: (dbData.trailing_level as number) ?? null,
      position_size_pct: (dbData.position_size_pct as number) ?? null,
      estimated: false,
    };
  }

  // Estimate based on default percentages
  const slDist = entryPrice * (DEFAULT_SL_PCT / 100);
  const tpDist = entryPrice * (DEFAULT_TP_PCT / 100);

  if (signalType === "BUY") {
    return {
      stop_loss: entryPrice - slDist,
      take_profit: entryPrice + tpDist,
      sl_percentage: DEFAULT_SL_PCT,
      tp_percentage: DEFAULT_TP_PCT,
      risk_reward_ratio: DEFAULT_RR,
      trailing_activation: null,
      trailing_level: null,
      position_size_pct: null,
      estimated: true,
    };
  } else {
    return {
      stop_loss: entryPrice + slDist,
      take_profit: entryPrice - tpDist,
      sl_percentage: DEFAULT_SL_PCT,
      tp_percentage: DEFAULT_TP_PCT,
      risk_reward_ratio: DEFAULT_RR,
      trailing_activation: null,
      trailing_level: null,
      position_size_pct: null,
      estimated: true,
    };
  }
}

export async function GET() {
  try {
    // 1. Fetch ALL evaluated signals (not just ones with SL/TP)
    const { data: rawEvals, error: evalErr } = await supabase
      .from("signal_evaluations")
      .select(
        "signal_id, ticker, signal_type, entry_date, entry_price, confidence, " +
          "price_6h, price_24h, price_72h, price_168h",
      )
      .not("entry_price", "is", null)
      .neq("signal_type", "HOLD")
      .order("entry_date", { ascending: true });

    if (evalErr) throw evalErr;
    const evals = (rawEvals ?? []) as EvalRow[];

    // Only keep evals that have at least one horizon price
    const validEvals = evals.filter(
      (e) =>
        e.price_6h != null ||
        e.price_24h != null ||
        e.price_72h != null ||
        e.price_168h != null,
    );

    // 2. Batch-fetch SL/TP data from signals table
    const signalIds = [
      ...new Set(validEvals.map((e) => e.signal_id).filter(Boolean)),
    ];
    const sltpMap: Record<string, Record<string, unknown>> = {};
    if (signalIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < signalIds.length; i += chunkSize) {
        const chunk = signalIds.slice(i, i + chunkSize);
        const { data: sigRows } = await supabase
          .from("signals")
          .select(
            "id, position_size_pct, stop_loss, take_profit, " +
              "sl_percentage, tp_percentage, risk_reward_ratio, " +
              "trailing_activation, trailing_level",
          )
          .in("id", chunk);
        if (sigRows) {
          for (const row of sigRows) {
            sltpMap[row.id as string] = row as Record<string, unknown>;
          }
        }
      }
    }

    // 3. Simulate portfolio
    let currentPortfolio = INITIAL_PORTFOLIO;
    const trades: TradeResult[] = [];
    let slHits = 0;
    let tpHits = 0;
    let trailingHits = 0;
    let horizonHits = 0;
    let bestTrade: { ticker: string; pnl: number; pct: number } | null = null;
    let worstTrade: { ticker: string; pnl: number; pct: number } | null = null;

    for (const ev of validEvals) {
      const entryPrice = ev.entry_price;
      const signal = ev.signal_type;
      const confidence =
        ev.confidence > 1 ? ev.confidence / 100 : ev.confidence;

      // Get SL/TP (from DB or estimated)
      const dbSltp = ev.signal_id ? sltpMap[ev.signal_id] ?? null : null;
      const sltp = getSltpLevels(entryPrice, signal, dbSltp);

      const sl = sltp.stop_loss;
      const tp = sltp.take_profit;
      const trailingAct = sltp.trailing_activation;

      // Position sizing
      const posPct =
        sltp.position_size_pct != null ? sltp.position_size_pct : confidence * 5;
      const allocated = currentPortfolio * (posPct / 100);
      const shares = allocated / entryPrice;

      // Check horizons in order: 6h, 24h, 72h, 168h
      const horizonPrices = [
        { key: "6h", price: ev.price_6h },
        { key: "24h", price: ev.price_24h },
        { key: "72h", price: ev.price_72h },
        { key: "168h", price: ev.price_168h },
      ];

      let exitPrice = entryPrice;
      let exitReason: "sl" | "tp" | "trailing" | "horizon" = "horizon";
      let trailingActivated = false;

      for (const hp of horizonPrices) {
        if (hp.price == null) continue;
        const price = hp.price;

        if (signal === "BUY") {
          if (trailingAct != null && price >= trailingAct) {
            trailingActivated = true;
          }
          if (price <= sl) {
            exitPrice = sl;
            exitReason = "sl";
            break;
          }
          if (price >= tp) {
            exitPrice = tp;
            exitReason = "tp";
            break;
          }
          if (
            trailingActivated &&
            sltp.trailing_level != null &&
            price <= sltp.trailing_level
          ) {
            exitPrice = sltp.trailing_level;
            exitReason = "trailing";
            break;
          }
        } else {
          // SELL — inverted
          if (trailingAct != null && price <= trailingAct) {
            trailingActivated = true;
          }
          if (price >= sl) {
            exitPrice = sl;
            exitReason = "sl";
            break;
          }
          if (price <= tp) {
            exitPrice = tp;
            exitReason = "tp";
            break;
          }
          if (
            trailingActivated &&
            sltp.trailing_level != null &&
            price >= sltp.trailing_level
          ) {
            exitPrice = sltp.trailing_level;
            exitReason = "trailing";
            break;
          }
        }

        // No exit triggered at this horizon — update exitPrice to last seen
        exitPrice = price;
      }

      // Calculate P&L
      const pnl =
        signal === "BUY"
          ? shares * (exitPrice - entryPrice)
          : shares * (entryPrice - exitPrice);

      currentPortfolio += pnl;

      if (exitReason === "sl") slHits++;
      else if (exitReason === "tp") tpHits++;
      else if (exitReason === "trailing") trailingHits++;
      else horizonHits++;

      const pnlPct =
        signal === "BUY"
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100;

      if (!bestTrade || pnl > bestTrade.pnl) {
        bestTrade = {
          ticker: ev.ticker,
          pnl: Math.round(pnl * 100) / 100,
          pct: Math.round(pnlPct * 100) / 100,
        };
      }
      if (!worstTrade || pnl < worstTrade.pnl) {
        worstTrade = {
          ticker: ev.ticker,
          pnl: Math.round(pnl * 100) / 100,
          pct: Math.round(pnlPct * 100) / 100,
        };
      }

      trades.push({
        date: ev.entry_date?.slice(0, 10),
        portfolio_value: Math.round(currentPortfolio * 100) / 100,
        ticker: ev.ticker,
        signal,
        entry_price: entryPrice,
        exit_price: Math.round(exitPrice * 100) / 100,
        exit_reason: exitReason,
        pnl: Math.round(pnl * 100) / 100,
        allocated: Math.round(allocated * 100) / 100,
        position_size_pct: Math.round(posPct * 100) / 100,
        sl: Math.round(sl * 100) / 100,
        tp: Math.round(tp * 100) / 100,
        rr: sltp.risk_reward_ratio,
      });
    }

    const totalTrades = trades.length;
    const winCount = trades.filter((t) => t.pnl > 0).length;

    return NextResponse.json({
      trades,
      stats: {
        total_trades: totalTrades,
        final_value: Math.round(currentPortfolio * 100) / 100,
        return_pct:
          Math.round(
            ((currentPortfolio - INITIAL_PORTFOLIO) / INITIAL_PORTFOLIO) *
              10000,
          ) / 100,
        win_rate:
          totalTrades > 0
            ? Math.round((winCount / totalTrades) * 10000) / 100
            : 0,
        sl_hits: slHits,
        tp_hits: tpHits,
        trailing_hits: trailingHits,
        horizon_hits: horizonHits,
        sl_rate:
          totalTrades > 0
            ? Math.round((slHits / totalTrades) * 10000) / 100
            : 0,
        tp_rate:
          totalTrades > 0
            ? Math.round((tpHits / totalTrades) * 10000) / 100
            : 0,
        avg_rr:
          trades.length > 0
            ? Math.round(
                (trades.reduce((s, t) => s + (t.rr ?? 0), 0) / trades.length) *
                  100,
              ) / 100
            : 0,
        best_trade: bestTrade,
        worst_trade: worstTrade,
      },
    });
  } catch (err) {
    console.error("Equity curve SL/TP API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
