"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const NAV_ITEMS = [
  { href: "/",            label: "DASHBOARD",    icon: "/icons/dashboard.png"   },
  { href: "/agents",      label: "AGENTS",       icon: "/icons/agents.png"      },
  { href: "/patterns",    label: "PATTERNS",     icon: "/icons/patterns.png"    },
  { href: "/performance", label: "PERFORMANCE",  icon: "/icons/performance.png" },
  { href: "/correlation", label: "CORRELAZIONI", icon: "/icons/correlation.png" },
  { href: "/guide",       label: "GUIDA",        icon: "/icons/guide.png"       },
  { href: "/articles",    label: "ARTICLES",     icon: "/icons/articles.png"    },
  { href: "/finbert",     label: "FINBERT",      icon: "/icons/finbert.png"     },
  { href: "/backtest",    label: "BACKTEST",     icon: "/icons/backtest.png"    },
  { href: "/search",      label: "SEARCH",       icon: "/icons/search.png"      },
];

export default function FloatingSidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: "fixed",
        left: 16,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 100,
        width: expanded ? 200 : 64,
        transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",

        // Pillola fluttuante
        background: "rgba(14, 14, 26, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(139, 92, 246, 0.25)",
        borderRadius: 24,
        boxShadow:
          "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",

        display: "flex",
        flexDirection: "column" as const,
        alignItems: "flex-start",
        paddingTop: 12,
        paddingBottom: 12,
        overflow: "hidden",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              height: 56,
              paddingLeft: 18,
              gap: 12,
              textDecoration: "none",
              position: "relative",
              transition: "background 0.15s ease",
              background: isActive
                ? "rgba(124, 58, 237, 0.15)"
                : "transparent",
            }}
          >
            {/* Indicatore attivo */}
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 28,
                  background: "linear-gradient(180deg, #7c3aed, #a855f7)",
                  borderRadius: "0 4px 4px 0",
                  boxShadow: "0 0 8px rgba(168,85,247,0.6)",
                }}
              />
            )}

            {/* Icona */}
            <div
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                background: isActive
                  ? "rgba(124, 58, 237, 0.25)"
                  : "rgba(255,255,255,0.04)",
                transition: "all 0.2s",
                boxShadow: isActive
                  ? "0 0 12px rgba(168,85,247,0.4)"
                  : "none",
              }}
            >
              <Image
                src={item.icon}
                alt={item.label}
                width={30}
                height={30}
                style={{
                  opacity: isActive ? 1 : 0.45,
                  filter: isActive
                    ? "drop-shadow(0 0 4px rgba(168,85,247,0.8)) brightness(1.2)"
                    : "grayscale(0.3)",
                  transition: "all 0.2s",
                }}
              />
            </div>

            {/* Label */}
            <span
              className="barlow"
              style={{
                fontSize: 13,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: isActive ? "#a855f7" : "#4a4a6a",
                whiteSpace: "nowrap",
                opacity: expanded ? 1 : 0,
                transform: expanded ? "translateX(0)" : "translateX(-8px)",
                transition: "opacity 0.2s ease, transform 0.2s ease",
                pointerEvents: "none",
              }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}

      {/* Dot live in fondo */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 10,
          borderTop: "1px solid rgba(139,92,246,0.1)",
          width: "100%",
          display: "flex",
          alignItems: "center",
          paddingLeft: 22,
          gap: 10,
        }}
      >
        <div
          className="live-pulse-dot"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 8px #10b981",
            flexShrink: 0,
          }}
        />
        <span
          className="barlow"
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#10b981",
            opacity: expanded ? 1 : 0,
            transition: "opacity 0.2s ease",
            whiteSpace: "nowrap",
          }}
        >
          BOT LIVE
        </span>
      </div>
    </div>
  );
}
