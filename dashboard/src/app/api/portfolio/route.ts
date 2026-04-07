export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const ALPACA_BASE = "https://paper-api.alpaca.markets";

// Alpaca paper = $100k fissi. Scaliamo tutto a $1k (SCALE_FACTOR=100) per simulazione realistica
// Il portafoglio parte dal 30 marzo 2026, tutto ciò che è prima va scartato
const SCALE_FACTOR = 100;
const INITIAL_EQUITY_RAW = 100_000; // saldo iniziale del paper account Alpaca
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

    // For intraday timeframes, use continuous reporting so crypto equity is tracked 24/7.
    // Without this, Alpaca only reports equity during US market hours (9:30-16:00 ET).
    const isIntraday = timeframe !== "1D";
    const historyParams = new URLSearchParams({ period, timeframe });
    if (isIntraday) historyParams.set("intraday_reporting", "continuous");

    // Fire all Alpaca requests in parallel
    const [acctRaw, positionsRaw, historyRaw, ordersRaw, clockRaw] =
      await Promise.all([
        alpacaFetch<AlpacaAccount | null>("/v2/account", null),
        alpacaFetch<AlpacaPosition[]>("/v2/positions", []),
        alpacaFetch<PortfolioHistory | null>(
          `/v2/account/portfolio/history?${historyParams}`,
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

    // ── Virtual $1k portfolio model ───────────────────────────────────────────
    //
    // executor.py sizes every order at virtual scale:
    //   virtual_equity = alpaca_equity / SCALE_FACTOR  (~$1,000)
    //   allocated       = virtual_equity × pos_pct     (e.g. 3.75% → $37.50)
    //   shares          = $37.50 / stock_price          (e.g. 0.25 shares of $150 stock)
    //
    // So Alpaca holds $37.50 worth of stock — already in the virtual $1k scale.
    // position.market_value and unrealized_pl do NOT need SCALE_FACTOR.
    //
    // account.equity needs /SCALE_FACTOR because Alpaca reports the full $100k base.
    // account.cash cannot be scaled the same way: cashRaw ≈ $99,963, and $99,963/100 ≈
    // $999.63 "free" even when $37.50 is deployed — misleadingly close to the full $1k.
    // We derive virtual_cash from virtual_equity minus current positions exposure instead,
    // which gives the true "undeployed" portion of the virtual $1k budget.
    //
    // Identity preserved: virtual_cash + net_position_value == virtual_equity  ✓

    const equityRaw    = parseFloat(acctRaw.equity       || "0");
    const lastEquityRaw = parseFloat(acctRaw.last_equity || "0");

    // Net position value in virtual dollars (computed from positionsRaw before mapping).
    // market_value is positive for long, negative for short in Alpaca.
    const netPositionValue = positionsRaw.reduce(
      (s, p) => s + parseFloat(p.market_value || "0"), 0,
    );

    const virtualEquity = Math.round((equityRaw / SCALE_FACTOR) * 100) / 100;
    const virtualCash   = Math.round((virtualEquity - netPositionValue) * 100) / 100;

    // daily_pl: today's move vs yesterday's close (last_equity = prior trading day 16:00 ET)
    const dailyPl    = lastEquityRaw > 0 ? (equityRaw - lastEquityRaw) / SCALE_FACTOR : 0;
    const dailyPlPct = lastEquityRaw > 0 ? ((equityRaw - lastEquityRaw) / lastEquityRaw) * 100 : 0;
    // total_pl: inception-to-date vs Alpaca paper starting balance ($100k → $1k scaled)
    const totalPl    = (equityRaw - INITIAL_EQUITY_RAW) / SCALE_FACTOR;
    const totalPlPct = ((equityRaw - INITIAL_EQUITY_RAW) / INITIAL_EQUITY_RAW) * 100;

    const account = {
      equity:        virtualEquity,
      cash:          virtualCash,
      buying_power:  Math.max(0, virtualCash),
      daily_pl:      Math.round(dailyPl    * 100) / 100,
      daily_pl_pct:  Math.round(dailyPlPct * 100) / 100,
      total_pl:      Math.round(totalPl    * 100) / 100,
      total_pl_pct:  Math.round(totalPlPct * 100) / 100,
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
        qty: parseFloat(p.qty),             // actual share count — no scaling
        side: p.side,
        entry_price: parseFloat(p.avg_entry_price), // actual stock price — no scaling
        current_price: parseFloat(p.current_price), // actual stock price — no scaling
        // market_value / unrealized_pl are already in virtual $1k scale because the
        // executor placed the order for (virtual_equity × pos_pct) dollars, not
        // (alpaca_equity × pos_pct). No SCALE_FACTOR division needed here.
        market_value:     parseFloat(p.market_value),
        unrealized_pl:    parseFloat(p.unrealized_pl),
        unrealized_pl_pct: parseFloat(p.unrealized_plpc) * 100,
        stop_loss:  dbData?.stop_loss  ?? null, // price level — no scaling
        take_profit: dbData?.take_profit ?? null, // price level — no scaling
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
    // Append a "live" point with the current equity so the chart's last value always
    // matches the Equity card. Alpaca portfolio history can be stale by minutes/hours
    // (especially outside market hours), causing the chart overlay and the card to diverge.
    // Only append if the last history point is more than 60 s old (or history is empty).
    const nowTs = Math.floor(Date.now() / 1000);
    const lastHistTs = filteredTs.length > 0 ? filteredTs[filteredTs.length - 1] : 0;
    if (nowTs - lastHistTs > 60) {
      filteredTs.push(nowTs);
      filteredEq.push(Math.round((equityRaw / SCALE_FACTOR) * 100) / 100);
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
