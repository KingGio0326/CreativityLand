export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("correlation_cache")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        matrix: {},
        high_correlations: [],
        low_correlations: [],
        computed_at: null,
      });
    }

    return NextResponse.json({
      matrix:
        typeof data.matrix === "string"
          ? JSON.parse(data.matrix)
          : data.matrix ?? {},
      high_correlations:
        typeof data.high_correlations === "string"
          ? JSON.parse(data.high_correlations)
          : data.high_correlations ?? [],
      low_correlations:
        typeof data.low_correlations === "string"
          ? JSON.parse(data.low_correlations)
          : data.low_correlations ?? [],
      computed_at: data.computed_at,
    });
  } catch (err) {
    console.error("Correlation API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
