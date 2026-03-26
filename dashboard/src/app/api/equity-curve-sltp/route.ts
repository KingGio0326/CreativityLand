export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const INITIAL_PORTFOLIO = 1000;

interface SignalRow {
  id: string;
  ticker: string;
  signal: string;
  confidence: number;
  created_at: string;
  position_size_pct: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  sl_percentage: number | null;
  tp_percentage: number | null;
  risk_reward_ratio: number | null;
  atr_14: number | null;
  trailing_activation: number | null;
  trailing_level: number | null;
}

interface EvalRow {
  signal_id: string;
  ticker: string;
  signal_type: string;
  entry_date: string;
  entry_price: number;
  price_6h: number | null;
  price_24h: number | null;
  price_72h: number | null;
  price_168h: number | null;
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
  sl: number | null;
  tp: number | null;
  rr: number | null;
}

/**
 * Simulate a portfolio where each trade exits at SL, TP, trailing, or horizon.
 *
 * For each evaluated signal with SL/TP data, we check intermediate prices
 * (6h → 24h → 72h → 168h) to see which level was hit first.
 * If SL or TP is hit at an earlier horizon, we close at that price
 * instead of waiting for the full horizon period.
 */
export async function GET() {
  try {
    // Fetch signals that have exit strategy data
    const { data: rawSignals, error: sigErr } = await supabase
      .from("signals")
      .select(
        "id, ticker, signal, confidence, created_at, " +
          "position_size_pct, stop_loss, take_profit, " +
          "sl_percentage, tp_percentage, risk_reward_ratio, " +
          "atr_14, trailing_activation, trailing_level",
      )
      .neq("signal", "HOLD")
      .not("stop_loss", "is", null)
      .order("created_at", { ascending: true });

    if (sigErr) throw sigErr;
    const signals = (rawSignals ?? []) as SignalRow[];

    // Fetch all evaluations for price data
    const { data: rawEvals, error: evalErr } = await supabase
      .from("signal_evaluations")
      .select(
        "signal_id, ticker, signal_type, entry_date, entry_price, " +
          "price_6h, price_24h, price_72h, price_168h",
      )
      .not("entry_price", "is", null)
      .neq("signal_type", "HOLD")
      .order("entry_date", { ascending: true });

    if (evalErr) throw evalErr;
    const evals = (rawEvals ?? []) as EvalRow[];

    // Build eval lookup by signal_id
    const evalMap: Record<string, EvalRow> = {};
    for (const ev of evals) {
      if (ev.signal_id) evalMap[ev.signal_id] = ev;
    }

    // Build signal lookup
    const signalMap: Record<string, SignalRow> = {};
    for (const sig of signals) {
      signalMap[sig.id] = sig;
    }

    // Get all signal IDs that have BOTH eval data AND exit strategy
    const tradeableIds = evals
      .filter((ev) => ev.signal_id && signalMap[ev.signal_id])
      .map((ev) => ev.signal_id);

    // Simulate portfolio
    let currentPortfolio = INITIAL_PORTFOLIO;
    const trades: TradeResult[] = [];
    let slHits = 0;
    let tpHits = 0;
    let trailingHits = 0;
    let horizonHits = 0;
    let bestTrade: { ticker: string; pnl: number; pct: number } | null = null;
    let worstTrade: { ticker: string; pnl: number; pct: number } | null = null;

    for (const sigId of tradeableIds) {
      const ev = evalMap[sigId];
      const sig = signalMap[sigId];
      if (!ev || !sig) continue;

      const entryPrice = ev.entry_price;
      const signal = ev.signal_type;
      const sl = sig.stop_loss;
      const tp = sig.take_profit;
      const trailingAct = sig.trailing_activation;
      const confidence =
        sig.confidence > 1 ? sig.confidence / 100 : sig.confidence;

      // Position sizing
      const posPct =
        sig.position_size_pct != null ? sig.position_size_pct : confidence * 5;
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
          // Check trailing activation
          if (trailingAct != null && price >= trailingAct) {
            trailingActivated = true;
          }
          // Check SL hit (price dropped below SL)
          if (sl != null && price <= sl) {
            exitPrice = sl;
            exitReason = "sl";
            break;
          }
          // Check TP hit (price rose above TP)
          if (tp != null && price >= tp) {
            exitPrice = tp;
            exitReason = "tp";
            break;
          }
          // Trailing stop: if activated and price pulled back to entry
          if (trailingActivated && sig.trailing_level != null && price <= sig.trailing_level) {
            exitPrice = sig.trailing_level;
            exitReason = "trailing";
            break;
          }
        } else {
          // SELL signal — inverted logic
          if (trailingAct != null && price <= trailingAct) {
            trailingActivated = true;
          }
          if (sl != null && price >= sl) {
            exitPrice = sl;
            exitReason = "sl";
            break;
          }
          if (tp != null && price <= tp) {
            exitPrice = tp;
            exitReason = "tp";
            break;
          }
          if (trailingActivated && sig.trailing_level != null && price >= sig.trailing_level) {
            exitPrice = sig.trailing_level;
            exitReason = "trailing";
            break;
          }
        }

        // If no exit triggered, use the last available price
        exitPrice = price;
      }

      // If no horizon triggered SL/TP, it's a horizon exit
      // exitReason stays "horizon" and exitPrice is the last available price

      // Calculate P&L
      const pnl =
        signal === "BUY"
          ? shares * (exitPrice - entryPrice)
          : shares * (entryPrice - exitPrice);

      currentPortfolio += pnl;

      // Track stats
      if (exitReason === "sl") slHits++;
      else if (exitReason === "tp") tpHits++;
      else if (exitReason === "trailing") trailingHits++;
      else horizonHits++;

      const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      if (!bestTrade || pnl > bestTrade.pnl) {
        bestTrade = { ticker: ev.ticker, pnl: Math.round(pnl * 100) / 100, pct: Math.round(pnlPct * 100) / 100 };
      }
      if (!worstTrade || pnl < worstTrade.pnl) {
        worstTrade = { ticker: ev.ticker, pnl: Math.round(pnl * 100) / 100, pct: Math.round(pnlPct * 100) / 100 };
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
        sl,
        tp,
        rr: sig.risk_reward_ratio,
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
          totalTrades > 0 ? Math.round((winCount / totalTrades) * 10000) / 100 : 0,
        sl_hits: slHits,
        tp_hits: tpHits,
        trailing_hits: trailingHits,
        horizon_hits: horizonHits,
        sl_rate:
          totalTrades > 0 ? Math.round((slHits / totalTrades) * 10000) / 100 : 0,
        tp_rate:
          totalTrades > 0 ? Math.round((tpHits / totalTrades) * 10000) / 100 : 0,
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
