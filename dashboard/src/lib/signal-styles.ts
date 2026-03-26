/**
 * Shared signal styling utilities.
 *
 * Consolidates the BUY/SELL/HOLD color logic that was duplicated
 * across 7+ files with inconsistent color values.
 */

type Signal = "BUY" | "SELL" | "HOLD" | string;

/* ── Badge class strings (Tailwind) ─────────────────────── */

/** Solid badge — for prominent signal indicators (table cells, headers). */
export function signalBadgeClasses(signal: Signal): string {
  switch (signal) {
    case "STRONG BUY":
      return "bg-emerald-500 text-white border-emerald-400";
    case "BUY":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "STRONG SELL":
      return "bg-red-500 text-white border-red-400";
    case "SELL":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

/** Filled badge — for compact signal pills (solid background). */
export function signalFilledClasses(signal: Signal): string {
  switch (signal) {
    case "BUY":
    case "STRONG BUY":
      return "bg-emerald-500 text-white";
    case "SELL":
    case "STRONG SELL":
      return "bg-red-500 text-white";
    default:
      return "bg-zinc-500 text-white";
  }
}

/** Signal dot color — for small status indicators. */
export function signalDotClass(signal: Signal | null | undefined): string {
  if (!signal) return "bg-zinc-500";
  if (signal.includes("BUY")) return "bg-emerald-500";
  if (signal.includes("SELL")) return "bg-red-500";
  if (signal === "HOLD") return "bg-amber-500";
  return "bg-zinc-500";
}

/** Vote config for agent cards — background + text class pairs. */
export const VOTE_STYLES: Record<string, { bg: string; text: string }> = {
  BUY:  { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  SELL: { bg: "bg-red-500/15",     text: "text-red-400" },
  HOLD: { bg: "bg-amber-500/15",   text: "text-amber-400" },
};

/** Return color for positive/negative values. */
export function returnColor(val: number): string {
  if (val > 0) return "text-emerald-400";
  if (val < 0) return "text-red-400";
  return "text-zinc-400";
}
