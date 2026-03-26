/**
 * Shared Recharts styling constants.
 *
 * Consolidates tooltip, grid, axis, and legend styles
 * that were duplicated across 4+ chart-heavy pages.
 */

/** Standard tooltip content style for dark theme. */
export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "#12122a",
  border: "1px solid rgba(139,92,246,0.3)",
  borderRadius: 8,
  color: "#f0f0ff",
  fontSize: 12,
};

/** Tooltip label style (muted). */
export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "#8b8ba8",
};

/** Grid stroke for CartesianGrid. */
export const GRID_STROKE = "rgba(255,255,255,0.05)";

/** Standard axis tick style. */
export const AXIS_TICK = { fontSize: 10, fill: "#4a4a6a" } as const;

/** Legend wrapper style. */
export const LEGEND_STYLE = { fontSize: 11 } as const;
