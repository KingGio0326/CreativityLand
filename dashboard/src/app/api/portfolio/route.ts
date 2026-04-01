export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const ALPACA_BASE = "https://paper-api.alpaca.markets";

// Alpaca paper = $100k fissi. Scaliamo tutto a $1k (SCALE_FACTOR=100) per simulazione realistica
// Il portafoglio parte dal 30 marzo 2026, tutto ciò che è prima va scartato
const SCALE_FACTOR = 100;
const PORTFOLIO_START_TS = new Date("2026-03-30T00:00:00Z").getTime() / 1000;

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
  };
}

async function alpacaFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${ALPACA_BASE}${path}`, {
      headers: alpacaHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Alpaca ${path}: ${res.status}`);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`Alpaca ${path} failed:`, err);
    return fallback;
  }
}

// ── Types ────────────────────────────────────────────

interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  status: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
  asset_class: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  side: string;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  filled_at: string | null;
  type: string;
  status: string;
  order_class: string;
  created_at: string;
}

interface AlpacaClock {
  is_open: boolean;
  timestamp: string;
  next_open: string;
  next_close: string;
}

interface PortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

// ── Main handler ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get("period") || "1M";
    const timeframe = request.nextUrl.searchParams.get("timeframe") || "1H";

    // Fire all Alpaca requests in parallel
    const [acctRaw, positionsRaw, historyRaw, ordersRaw, clockRaw] =
      await Promise.all([
        alpacaFetch<AlpacaAccount | null>("/v2/account", null),
        alpacaFetch<AlpacaPosition[]>("/v2/positions", []),
        alpacaFetch<PortfolioHistory | null>(
          `/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
          null,
        ),
        alpacaFetch<AlpacaOrder[]>(
          "/v2/orders?status=closed&limit=50&direction=desc",
          [],
        ),
        alpacaFetch<AlpacaClock | null>("/v2/clock", null),
      ]);

    if (!acctRaw) {
      return NextResponse.json(
        {
          error: "Alpaca API unavailable",
          account: {
            equity: 0,
            cash: 0,
            buying_power: 0,
            daily_pl: 0,
            daily_pl_pct: 0,
            total_pl: 0,
            total_pl_pct: 0,
          },
          positions: [],
          equity_history: { timestamps: [], equity: [] },
          trades: [],
          is_market_open: false,
        },
        { status: 503 },
      );
    }

    // ── Account summary (scaled to $1k virtual budget) ──
    const equityRaw = parseFloat(acctRaw.equity || "0");
    const cashRaw = parseFloat(acctRaw.cash || "0");
    const buyingPowerRaw = parseFloat(acctRaw.buying_power || "0");
    const lastEquityRaw = parseFloat(acctRaw.last_equity || "0");
    const dailyPl = lastEquityRaw > 0 ? (equityRaw - lastEquityRaw) / SCALE_FACTOR : 0;
    const dailyPlPct = lastEquityRaw > 0 ? ((equityRaw - lastEquityRaw) / lastEquityRaw) * 100 : 0;
    const portfolioValueRaw = parseFloat(acctRaw.portfolio_value || "0");
    const totalPl = (portfolioValueRaw - lastEquityRaw) / SCALE_FACTOR;
    const totalPlPct =
      lastEquityRaw > 0 ? ((portfolioValueRaw - lastEquityRaw) / lastEquityRaw) * 100 : 0;

    const account = {
      equity: Math.round((equityRaw / SCALE_FACTOR) * 100) / 100,
      cash: Math.round((cashRaw / SCALE_FACTOR) * 100) / 100,
      // Alpaca paper è account a margine (buying_power = cash × 2).
      // Per la simulazione $1k non usiamo margine → buying power = cash.
      buying_power: Math.round((cashRaw / SCALE_FACTOR) * 100) / 100,
      daily_pl: Math.round(dailyPl * 100) / 100,
      daily_pl_pct: Math.round(dailyPlPct * 100) / 100,
      total_pl: Math.round(totalPl * 100) / 100,
      total_pl_pct: Math.round(totalPlPct * 100) / 100,
    };

    // ── Positions + SL/TP lookup from Supabase ──
    let supabasePositions: Record<
      string,
      { stop_loss: number | null; take_profit: number | null; trailing_activation: number | null }
    > = {};

    if (positionsRaw.length > 0) {
      try {
        const supabase = getSupabase();
        const tickers = positionsRaw.map((p) => p.symbol);
        const { data: dbPositions } = await supabase
          .from("positions")
          .select("ticker, stop_loss, take_profit")
          .eq("status", "open")
          .in("ticker", tickers);

        if (dbPositions) {
          for (const dbp of dbPositions) {
            supabasePositions[dbp.ticker] = {
              stop_loss: dbp.stop_loss ?? null,
              take_profit: dbp.take_profit ?? null,
              trailing_activation: null,
            };
          }
        }

        // Also check for trailing_activation from signals table
        const { data: signals } = await supabase
          .from("signals")
          .select("ticker, trailing_activation")
          .in("ticker", tickers)
          .order("created_at", { ascending: false })
          .limit(tickers.length);

        if (signals) {
          for (const sig of signals) {
            if (sig.trailing_activation && supabasePositions[sig.ticker]) {
              supabasePositions[sig.ticker].trailing_activation =
                sig.trailing_activation;
            }
          }
        }
      } catch (err) {
        console.error("Supabase SL/TP lookup failed:", err);
      }
    }

    const positions = positionsRaw.map((p) => {
      const dbData = supabasePositions[p.symbol];
      return {
        ticker: p.symbol,
        qty: parseFloat(p.qty),
        side: p.side,
        entry_price: parseFloat(p.avg_entry_price),
        current_price: parseFloat(p.current_price),
        market_value: parseFloat(p.market_value),
        unrealized_pl: parseFloat(p.unrealized_pl),
        unrealized_pl_pct: parseFloat(p.unrealized_plpc) * 100,
        stop_loss: dbData?.stop_loss ?? null,
        take_profit: dbData?.take_profit ?? null,
        trailing_activation: dbData?.trailing_activation ?? null,
      };
    });

    // ── Equity history (filtered by start date + scaled) ──
    const rawTs = historyRaw?.timestamp ?? [];
    const rawEq = historyRaw?.equity ?? [];
    const filteredTs: number[] = [];
    const filteredEq: number[] = [];
    for (let i = 0; i < rawTs.length; i++) {
      if (rawTs[i] >= PORTFOLIO_START_TS) {
        filteredTs.push(rawTs[i]);
        filteredEq.push(rawEq[i] / SCALE_FACTOR);
      }
    }
    const equityHistory = {
      timestamps: filteredTs,
      equity: filteredEq,
    };

    // ── Trades (closed orders) ──
    const trades = ordersRaw
      .filter((o) => o.filled_at && o.filled_avg_price)
      .map((o) => ({
        id: o.id,
        ticker: o.symbol,
        side: o.side,
        qty: parseFloat(o.filled_qty || o.qty),
        filled_price: parseFloat(o.filled_avg_price || "0"),
        filled_at: o.filled_at,
        type: o.type,
        status: o.status,
      }));

    // ── Market open ──
    const isMarketOpen = clockRaw?.is_open ?? false;

    return NextResponse.json({
      account,
      positions,
      equity_history: equityHistory,
      trades,
      is_market_open: isMarketOpen,
    });
  } catch (err) {
    console.error("Portfolio API error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
