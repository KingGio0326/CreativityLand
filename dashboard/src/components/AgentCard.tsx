"use client";

import { useState } from "react";

export interface TopArticle {
  title: string;
  label: string;
  score: number;
  source: string;
}

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
  topArticles?: TopArticle[];
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
  topArticles,
}: AgentCardProps) {
  const [open, setOpen] = useState(false);
  const v = voteConfig[vote];

  const labelColor = (label: string) =>
    label === "positive"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : label === "negative"
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

  // If no structured details but reasoning exists, auto-open raw log
  const hasDetails = Object.keys(details).length > 0;
  const showRawByDefault = !hasDetails && reasoning.length > 0;

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
      {hasDetails && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 border-b">
          {Object.entries(details).map(([key, val]) => (
            <div key={key} className="flex items-baseline justify-between gap-1">
              <span className="text-[11px] text-muted-foreground truncate">{key}</span>
              <span className="text-[11px] font-mono font-medium tabular-nums">{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top articles (SentimentAgent only) */}
      {topArticles && topArticles.length > 0 && (
        <div className="px-4 py-3 border-b space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Top articoli</p>
          {topArticles.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${labelColor(a.label)}`}>
                {a.label.slice(0, 3)}
              </span>
              <span className="flex-1 text-muted-foreground truncate">{a.title}</span>
              <span className="font-mono text-muted-foreground/60 shrink-0">{a.source}</span>
            </div>
          ))}
        </div>
      )}

      {/* Accordion: Raw log — auto-open when no structured details */}
      {reasoning.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="font-medium">
              {showRawByDefault ? `Reasoning (${reasoning.length})` : `Raw log (${reasoning.length})`}
            </span>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${open || showRawByDefault ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {(open || showRawByDefault) && (
            <div className="px-4 pb-3">
              <div className="bg-muted/30 rounded-lg p-3 space-y-1 max-h-48 overflow-auto">
                {reasoning.map((line, i) => (
                  <p key={i} className="text-[11px] font-mono text-muted-foreground leading-relaxed break-all">
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
