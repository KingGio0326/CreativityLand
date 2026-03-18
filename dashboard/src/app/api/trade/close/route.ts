export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const ALPACA_BASE = "https://paper-api.alpaca.markets";

export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();
    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const res = await fetch(
      `${ALPACA_BASE}/v2/positions/${encodeURIComponent(symbol)}`,
      {
        method: "DELETE",
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("Alpaca close error:", res.status, body);
      return NextResponse.json(
        { error: `Alpaca error: ${res.status} — ${body}` },
        { status: res.status },
      );
    }

    return NextResponse.json({
      success: true,
      symbol,
      closed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Close position error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
