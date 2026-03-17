export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const ALPACA_BASE = "https://paper-api.alpaca.markets";

function getHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
  };
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
}

export async function GET() {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/positions`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Alpaca positions error:", err);
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? `Alpaca error ${res.status}` },
        { status: res.status },
      );
    }

    const positions: AlpacaPosition[] = await res.json();

    const mapped = positions.map((p) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: p.side,
      avg_entry_price: parseFloat(p.avg_entry_price),
      current_price: parseFloat(p.current_price),
      market_value: parseFloat(p.market_value),
      unrealized_pl: parseFloat(p.unrealized_pl),
      unrealized_plpc: parseFloat(p.unrealized_plpc),
      change_today: parseFloat(p.change_today),
    }));

    return NextResponse.json({ positions: mapped });
  } catch (err) {
    console.error("Portfolio API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
