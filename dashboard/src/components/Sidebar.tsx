"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/articles", label: "Articles", icon: "📰" },
  { href: "/finbert", label: "FinBERT Debug", icon: "🧠" },
  { href: "/backtest", label: "Backtest", icon: "📈" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/patterns", label: "Patterns", icon: "🔮" },
  { href: "/performance", label: "Performance", icon: "🏆" },
  { href: "/correlation", label: "Correlazioni", icon: "🔗" },
  { href: "/guide", label: "Guida", icon: "📖" },
];

const TICKERS = ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "MSFT", "XOM", "GLD"];

export default function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const handleRunBot = async () => {
    setRunning(true);
    try {
      await fetch("/api/run-bot", { method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setTimeout(() => setRunning(false), 3000);
    }
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-[60] md:hidden w-10 h-10 rounded-lg bg-[var(--bg-card)] border border-[rgba(139,92,246,0.15)] flex items-center justify-center"
        aria-label="Toggle menu"
      >
        <span className="text-lg">{open ? "✕" : "☰"}</span>
      </button>

      {/* Overlay on mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${open ? "open" : ""} md:translate-x-0`}
      >
        {/* Logo */}
        <div className="relative z-10 px-5 pt-5 pb-2">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="text-2xl">⚡</span>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
              TradingBot
            </span>
          </Link>
        </div>

        {/* Avatar */}
        <div className="relative z-10 px-5 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white text-sm font-bold">
            AI
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              Trading Agent
            </p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 live-dot" />
              <span className="text-[11px] text-[var(--text-secondary)]">
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 my-1 h-px bg-[rgba(139,92,246,0.12)]" />

        {/* Nav links */}
        <nav className="relative z-10 flex-1 py-2 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                <span className="text-base">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Live badge */}
        <div className="relative z-10 px-4 py-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.15)]">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 live-badge" />
            <div>
              <span className="text-xs font-semibold text-green-400">
                LIVE
              </span>
              <p className="text-[10px] text-[var(--text-muted)]">
                Bot attivo ogni 6h
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-content">
        {/* Top bar */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-primary)]/80 border-b border-[rgba(139,92,246,0.1)] px-6 py-3 flex items-center justify-between gap-4">
          {/* Ticker pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar ml-10 md:ml-0">
            {TICKERS.map((t) => (
              <Link
                key={t}
                href={`/?ticker=${t}`}
                className="text-[11px] px-2.5 py-1 rounded-full font-mono bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap no-underline"
              >
                {t}
              </Link>
            ))}
          </div>

          {/* Run bot button */}
          <button
            onClick={handleRunBot}
            disabled={running}
            className="btn-primary flex items-center gap-2 text-sm shrink-0 disabled:opacity-50"
          >
            <span>{running ? "⏳" : "▶"}</span>
            <span className="hidden sm:inline">
              {running ? "Running..." : "Run Bot"}
            </span>
          </button>
        </header>

        {/* Page content */}
        <main className="p-6 max-w-7xl mx-auto">{children}</main>
      </div>
    </>
  );
}
