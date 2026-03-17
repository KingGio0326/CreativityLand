"use client";

import { useState } from "react";

export interface AgentCardProps {
  name: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  weightLabel: string;
  vote: "BUY" | "SELL" | "HOLD";
  confidence?: number;
  details: Record<string, string | number>;
  reasoning: string[];
}

const voteConfig = {
  BUY: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", bar: "bg-emerald-500" },
  SELL: { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", bar: "bg-red-500" },
  HOLD: { bg: "bg-zinc-500/15", border: "border-zinc-500/30", text: "text-zinc-400", bar: "bg-zinc-500" },
};

export default function AgentCard({
  name,
  initials,
  avatarBg,
  avatarColor,
  weightLabel,
  vote,
  confidence,
  details,
  reasoning,
}: AgentCardProps) {
  const [open, setOpen] = useState(false);
  const v = voteConfig[vote];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: avatarBg, color: avatarColor }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{name}</p>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
          {weightLabel}
        </span>
      </div>

      {/* Vote bar */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${v.bg} border-b ${v.border}`}>
        <span className={`text-xs font-bold tracking-wide ${v.text}`}>{vote}</span>
        <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full ${v.bar} transition-all duration-500`}
            style={{ width: `${confidence != null ? Math.round(confidence * 100) : 50}%` }}
          />
        </div>
        {confidence != null && (
          <span className={`text-[10px] font-mono font-medium ${v.text}`}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {/* Details grid */}
      {Object.keys(details).length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 border-b">
          {Object.entries(details).map(([key, val]) => (
            <div key={key} className="flex items-baseline justify-between gap-1">
              <span className="text-[11px] text-muted-foreground truncate">{key}</span>
              <span className="text-[11px] font-mono font-medium tabular-nums">{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Accordion: Raw log */}
      {reasoning.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="font-medium">Raw log ({reasoning.length})</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="px-4 pb-3">
              <div className="bg-muted/30 rounded-lg p-3 space-y-1 max-h-48 overflow-auto">
                {reasoning.map((line, i) => (
                  <p key={i} className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                    <span className="text-muted-foreground/50 mr-2 select-none">{i + 1}.</span>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
