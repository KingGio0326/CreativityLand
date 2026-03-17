export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const ALPACA_BASE = "https://paper-api.alpaca.markets";

function getHeaders() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
    "Content-Type": "application/json",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ticker,
      side,
      qty,
      stop_loss_pct,
      take_profit_pct,
      order_type,
      limit_price,
      current_price,
    } = body as {
      ticker: string;
      side: "buy" | "sell";
      qty: number;
      stop_loss_pct: number;
      take_profit_pct: number;
      order_type: "market" | "limit";
      limit_price?: number;
      current_price: number;
    };

    if (!ticker || !side || !qty || !current_price) {
      return NextResponse.json(
        { error: "Campi obbligatori: ticker, side, qty, current_price" },
        { status: 400 },
      );
    }

    // Calculate stop loss and take profit prices
    const stopLossPrice =
      side === "buy"
        ? Math.round(current_price * (1 - stop_loss_pct / 100) * 100) / 100
        : Math.round(current_price * (1 + stop_loss_pct / 100) * 100) / 100;

    const takeProfitPrice =
      side === "buy"
        ? Math.round(current_price * (1 + take_profit_pct / 100) * 100) / 100
        : Math.round(current_price * (1 - take_profit_pct / 100) * 100) / 100;

    // Build Alpaca order
    const orderBody: Record<string, unknown> = {
      symbol: ticker.replace("-", ""),
      qty: String(qty),
      side,
      type: order_type,
      time_in_force: "gtc",
      order_class: "bracket",
      stop_loss: {
        stop_price: String(stopLossPrice),
      },
      take_profit: {
        limit_price: String(takeProfitPrice),
      },
    };

    if (order_type === "limit" && limit_price) {
      orderBody.limit_price = String(limit_price);
    }

    const res = await fetch(`${ALPACA_BASE}/v2/orders`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(orderBody),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Alpaca order error:", data);
      return NextResponse.json(
        {
          error: data.message ?? `Alpaca error ${res.status}`,
          details: data,
        },
        { status: res.status },
      );
    }

    return NextResponse.json({
      success: true,
      order_id: data.id,
      status: data.status,
      filled_qty: parseFloat(data.filled_qty ?? "0"),
      filled_avg_price: parseFloat(data.filled_avg_price ?? "0"),
      stop_loss_price: stopLossPrice,
      take_profit_price: takeProfitPrice,
    });
  } catch (err) {
    console.error("Trade API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
