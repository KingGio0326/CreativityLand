"use client";

import { useState } from "react";
import { VOTE_STYLES } from "@/lib/signal-styles";

export interface TopArticle {
  title: string;
  label: string;
  score: number;
  source: string;
}

export interface ResearchPaper {
  title: string;
  url: string;
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
  researchPapers?: ResearchPaper[];
  researchPapersCount?: number;
  researchContext?: string;
}

const voteConfig = VOTE_STYLES;

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
  researchPapers,
  researchPapersCount,
  researchContext,
}: AgentCardProps) {
  const [open, setOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const v = voteConfig[vote];

  const labelColor = (label: string) =>
    label === "positive"
      ? "bg-[rgba(16,185,129,0.15)] text-[#10b981] border-[rgba(16,185,129,0.3)]"
      : label === "negative"
        ? "bg-[rgba(239,68,68,0.15)] text-[#ef4444] border-[rgba(239,68,68,0.3)]"
        : "bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border-[rgba(245,158,11,0.3)]";

  // If no structured details but reasoning exists, auto-open raw log
  const hasDetails = Object.keys(details).length > 0;
  const showRawByDefault = !hasDetails && reasoning.length > 0;

  const confPct = confidence != null ? Math.round(confidence * 100) : 50;
  const voteBarColor = vote === "BUY" ? "#10b981" : vote === "SELL" ? "#ef4444" : "#f59e0b";

  return (
    <div style={{
      borderRadius: 20,
      background: "linear-gradient(135deg, #1a1040 0%, #0e0e1a 100%)",
      border: "1px solid rgba(124,58,237,0.2)",
      overflow: "hidden",
      transition: "border-color 0.2s, box-shadow 0.2s",
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.45)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 24px rgba(124,58,237,0.1)";
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.2)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid rgba(139,92,246,0.1)" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700,
          backgroundColor: avatarBg, color: avatarColor,
          boxShadow: `0 0 14px ${avatarBg}55`,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontFamily: "var(--font-geist-mono)", padding: "2px 8px",
          borderRadius: 99, background: "rgba(124,58,237,0.15)", color: "#a855f7",
          border: "1px solid rgba(124,58,237,0.3)", whiteSpace: "nowrap",
        }}>
          {weightLabel}
        </span>
      </div>

      {/* Vote bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 10px", borderBottom: "1px solid rgba(139,92,246,0.1)" }}>
        <span className={`${v.bg} ${v.text}`} style={{ borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
          {vote}
        </span>
        <div style={{ flex: 1, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            width: `${confPct}%`,
            background: `linear-gradient(90deg, ${voteBarColor}88, ${voteBarColor})`,
            boxShadow: `0 0 8px ${voteBarColor}66`,
            transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
          }} />
        </div>
        {confidence != null && (
          <span className={v.text} style={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", fontWeight: 700, minWidth: 32, textAlign: "right" }}>
            {confPct}%
          </span>
        )}
      </div>

      {/* Details grid */}
      {hasDetails && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 border-b border-[rgba(139,92,246,0.12)]">
          {Object.entries(details).map(([key, val]) => (
            <div key={key} className="flex items-baseline justify-between gap-1">
              <span className="text-[11px] text-[var(--text-muted)] truncate">{key}</span>
              <span className="text-[11px] font-mono font-medium tabular-nums text-[var(--text-secondary)]">{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top articles (SentimentAgent only) */}
      {topArticles && topArticles.length > 0 && (
        <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.12)] space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Top articles</p>
          {topArticles.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${labelColor(a.label)}`}>
                {a.label.slice(0, 3)}
              </span>
              <span className="flex-1 text-[var(--text-muted)] truncate">{a.title}</span>
              <span className="font-mono text-[var(--text-muted)] opacity-60 shrink-0">{a.source}</span>
            </div>
          ))}
        </div>
      )}

      {/* Research papers (ResearchAgent only) */}
      {researchPapers !== undefined && (
        <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.12)] space-y-2">
          {(() => {
            // Single source of truth: prefer explicit count from reasoning log,
            // fall back to array length only if count was never provided.
            const displayCount = researchPapersCount ?? researchPapers.length;
            return (
              <>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  arXiv papers analyzed: {displayCount}
                </p>
                {displayCount === 0 && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    No papers found — arXiv unreachable
                  </p>
                )}
                {researchPapers.map((p, i) => (
                  <a
                    key={i}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[11px] text-sky-400 hover:text-sky-300 truncate transition-colors"
                  >
                    {p.title.length > 70 ? p.title.substring(0, 70) + "…" : p.title}
                  </a>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* Claude insight accordion (ResearchAgent only) */}
      {researchContext && (
        <div className="border-b border-[rgba(139,92,246,0.12)]">
          <button
            onClick={() => setInsightOpen(!insightOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span className="font-medium">Insight Claude</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${insightOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {insightOpen && (
            <div className="px-4 pb-3">
              <div className="bg-[#07070f] rounded-lg p-3 max-h-48 overflow-auto">
                <p className="text-[11px] font-mono text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                  {researchContext}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accordion: Raw log — auto-open when no structured details */}
      {reasoning.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
              <div className="bg-[#07070f] rounded-lg p-3 space-y-1 max-h-48 overflow-auto">
                {reasoning.map((line, i) => (
                  <p key={i} className="text-[11px] font-mono text-[var(--text-muted)] leading-relaxed break-all">
                    <span className="opacity-50 mr-2 select-none">{i + 1}.</span>
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
