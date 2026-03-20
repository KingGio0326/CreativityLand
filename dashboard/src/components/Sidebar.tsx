"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/",            label: "DASHBOARD",    icon: "/icons/dashboard.svg"   },
  { href: "/agents",      label: "AGENTS",       icon: "/icons/agents.svg"      },
  { href: "/patterns",    label: "PATTERNS",     icon: "/icons/patterns.svg"    },
  { href: "/performance", label: "PERFORMANCE",  icon: "/icons/performance.svg" },
  { href: "/correlation", label: "CORRELAZIONI", icon: "/icons/correlation.svg" },
  { href: "/guide",       label: "GUIDA",        icon: "/icons/guide.svg"       },
  { href: "/articles",    label: "ARTICLES",     icon: "/icons/articles.svg"    },
  { href: "/finbert",     label: "FINBERT",      icon: "/icons/finbert.svg"     },
  { href: "/backtest",    label: "BACKTEST",     icon: "/icons/backtest.svg"    },
  { href: "/search",      label: "SEARCH",       icon: "/icons/search.svg"      },
];

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-[60] md:hidden w-10 h-10 rounded-lg bg-[var(--bg-card)] border border-[rgba(139,92,246,0.15)] flex items-center justify-center"
        aria-label="Toggle menu"
      >
        <span className="text-lg">{mobileOpen ? "\u2715" : "\u2630"}</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`icon-sidebar ${mobileOpen ? "mobile-open" : ""}`}
        style={{ width: expanded ? 220 : 72 }}
      >
        {/* Logo */}
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            paddingLeft: 22,
            borderBottom: "1px solid rgba(139,92,246,0.1)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 22 }}>&#9889;</span>
          <span
            className="barlow"
            style={{
              marginLeft: 10,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#a855f7",
              whiteSpace: "nowrap",
              opacity: expanded ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          >
            TradingBot
          </span>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, paddingTop: 12, overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 52,
                  paddingLeft: 22,
                  textDecoration: "none",
                  background: isActive
                    ? "rgba(124,58,237,0.12)"
                    : "transparent",
                  borderLeft: isActive
                    ? "3px solid #7c3aed"
                    : "3px solid transparent",
                  transition: "all 0.15s ease",
                  gap: 14,
                }}
              >
                <Image
                  src={item.icon}
                  alt={item.label}
                  width={28}
                  height={28}
                  style={{
                    flexShrink: 0,
                    opacity: isActive ? 1 : 0.5,
                    filter: isActive
                      ? "drop-shadow(0 0 6px rgba(168,85,247,0.6)) brightness(0) invert(1)"
                      : "brightness(0) invert(1)",
                    transition: "all 0.2s",
                  }}
                />
                <span
                  className="barlow"
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: isActive ? "#a855f7" : "#4a4a6a",
                    whiteSpace: "nowrap",
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Live badge */}
        <div
          style={{
            padding: "16px 22px",
            borderTop: "1px solid rgba(139,92,246,0.1)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            className="live-pulse-dot"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 6px #10b981",
              flexShrink: 0,
            }}
          />
          <span
            className="barlow"
            style={{
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#10b981",
              whiteSpace: "nowrap",
              opacity: expanded ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          >
            BOT LIVE &middot; ogni 6h
          </span>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ marginLeft: 72 }} className="main-content-area">
        {/* Top bar — ticker pills only, no Run Bot */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-primary)]/80 border-b border-[rgba(139,92,246,0.1)] px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar ml-10 md:ml-0">
            {["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "MSFT", "XOM", "GLD"].map((t) => (
              <Link
                key={t}
                href={`/?ticker=${t}`}
                className="text-[11px] px-2.5 py-1 rounded-full font-mono bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap no-underline"
              >
                {t}
              </Link>
            ))}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 max-w-7xl mx-auto">{children}</main>
      </div>
    </>
  );
}
