"use client";

import { TICKERS } from "@/lib/constants";

interface TickerSelectorProps {
  value: string;
  onChange: (ticker: string) => void;
  /** Optional signal dot per ticker (e.g., from latest signals). */
  signalDot?: (ticker: string) => string | null;
}

/**
 * Reusable pill-button ticker selector.
 *
 * Used on Dashboard, Performance, and Patterns pages.
 */
export default function TickerSelector({
  value,
  onChange,
  signalDot,
}: TickerSelectorProps) {
  return (
    <div
      className="flex gap-1.5 flex-wrap"
      role="group"
      aria-label="Ticker selector"
    >
      {TICKERS.map((t) => {
        const isActive = t === value;
        const dotClass = signalDot?.(t);

        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            aria-pressed={isActive}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-mono transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-light)] focus-visible:outline-offset-1 ${
              isActive
                ? "bg-[var(--accent)] text-white border border-[var(--accent-light)] shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border border-transparent hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {dotClass && (
              <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
            )}
            {t}
          </button>
        );
      })}
    </div>
  );
}
