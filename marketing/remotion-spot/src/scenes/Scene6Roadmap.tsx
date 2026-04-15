import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

const ROADMAP_ITEMS = [
  {
    label: "Alpaca",
    sub: "Paper → Live · US equities + crypto",
    status: "ACTIVE",
    color: COLORS.neonGreen,
  },
  {
    label: "Broker Adapter",
    sub: "BrokerAdapter protocol · capability_flags",
    status: "PHASE 3",
    color: COLORS.violetLight,
  },
  {
    label: "MetaTrader / FTMO",
    sub: "MT5 execution · prop challenge",
    status: "FUTURE",
    color: COLORS.amber,
  },
  {
    label: "Local / VPS Runtime",
    sub: "Hybrid cloud+daemon · persistent execution",
    status: "FUTURE",
    color: COLORS.textSecondary,
  },
];

export const Scene6Roadmap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const sceneOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneOpacity = Math.min(sceneIn, sceneOut);

  const headerOpacity = interpolate(frame, [10, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 60,
          right: 60,
          opacity: headerOpacity,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.violetLight,
            letterSpacing: "0.2em",
            fontFamily: FONTS.mono,
            marginBottom: 20,
          }}
        >
          — Expansion Roadmap —
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            color: COLORS.textPrimary,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
          }}
        >
          Built to expand.
        </div>
      </div>

      {/* Roadmap cards */}
      <div
        style={{
          position: "absolute",
          top: 380,
          left: 60,
          right: 60,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {ROADMAP_ITEMS.map((item, i) => {
          const cs = spring({
            frame: frame - 40 - i * 22,
            fps,
            config: { damping: 170, stiffness: 90 },
          });
          const cardOpacity = interpolate(cs, [0, 0.5], [0, 1], {
            extrapolateRight: "clamp",
          });
          const cardX = interpolate(cs, [0, 1], [60, 0]);

          const isActive = item.status === "ACTIVE";

          return (
            <div
              key={item.label}
              style={{
                backgroundColor: isActive
                  ? "rgba(0,255,136,0.05)"
                  : COLORS.surface,
                border: `1px solid ${isActive ? "rgba(0,255,136,0.2)" : COLORS.surfaceBorder}`,
                borderRadius: 18,
                padding: "28px 32px",
                display: "flex",
                alignItems: "center",
                gap: 24,
                opacity: cardOpacity,
                transform: `translateX(${cardX}px)`,
              }}
            >
              {/* Status badge */}
              <div
                style={{
                  backgroundColor: isActive
                    ? "rgba(0,255,136,0.12)"
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${item.color}40`,
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: FONTS.mono,
                  color: item.color,
                  letterSpacing: "0.08em",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {item.status}
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                    letterSpacing: "-0.01em",
                    marginBottom: 6,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color: COLORS.textSecondary,
                    fontFamily: FONTS.mono,
                  }}
                >
                  {item.sub}
                </div>
              </div>

              {/* Active dot */}
              {isActive && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: COLORS.neonGreen,
                    boxShadow: `0 0 8px ${COLORS.neonGreen}`,
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom note */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          right: 60,
          textAlign: "center",
          opacity: interpolate(frame, [140, 165], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: COLORS.textMuted,
            fontFamily: FONTS.mono,
            letterSpacing: "0.1em",
          }}
        >
          Baseline first. Expansion after track record.
        </div>
      </div>
    </AbsoluteFill>
  );
};
