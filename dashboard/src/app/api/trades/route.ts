// DEPRECATED: Trades page redirects to /portfolio — use /api/portfolio for live data
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // Open positions
    const { data: positions, error: posErr } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "open")
      .order("opened_at", { ascending: false });

    if (posErr) throw posErr;

    // Trade history (last 100)
    const { data: trades, error: trErr } = await supabase
      .from("trades")
      .select("*")
      .order("closed_at", { ascending: false })
      .limit(100);

    if (trErr) throw trErr;

    // Portfolio summary view
    const { data: summary, error: sumErr } = await supabase
      .from("portfolio_summary")
      .select("*")
      .limit(1)
      .single();

    if (sumErr && sumErr.code !== "PGRST116") throw sumErr;

    return NextResponse.json({
      positions: positions ?? [],
      trades: trades ?? [],
      summary: summary ?? {
        capitale_investito: 0,
        posizioni_aperte: 0,
        pnl_totale: 0,
        pnl_giornaliero: 0,
        trade_totali: 0,
        win_rate: 0,
      },
    });
  } catch (err) {
    console.error("Trades API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
