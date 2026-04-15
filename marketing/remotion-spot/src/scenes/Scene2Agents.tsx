import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

const AGENTS = [
  {
    name: "News Agent",
    desc: "47 tickers · RSS · NewsAPI · Finnhub",
    icon: "◎",
    color: COLORS.neonGreen,
  },
  {
    name: "Sentiment Agent",
    desc: "FinBERT · weighted by recency",
    icon: "◈",
    color: COLORS.violetLight,
  },
  {
    name: "Research Agent",
    desc: "arXiv · LLM synthesis · OpenRouter",
    icon: "◇",
    color: COLORS.amber,
  },
  {
    name: "Risk Agent",
    desc: "VaR · Kelly · max drawdown guard",
    icon: "◉",
    color: COLORS.red,
  },
];

export const Scene2Agents: React.FC = () => {
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

  const labelOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [20, 50], [20, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      {/* Scene label */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 60,
          right: 60,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.neonGreen,
            letterSpacing: "0.2em",
            fontFamily: FONTS.mono,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          — Analysis Pipeline —
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 800,
            color: COLORS.textPrimary,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          AI agents read the context.
        </div>
      </div>

      {/* Agent cards */}
      <div
        style={{
          position: "absolute",
          top: 440,
          left: 60,
          right: 60,
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {AGENTS.map((agent, i) => {
          const cardSpring = spring({
            frame: frame - 40 - i * 25,
            fps,
            config: { damping: 180, stiffness: 90 },
          });
          const cardY = interpolate(cardSpring, [0, 1], [80, 0]);
          const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);

          return (
            <div
              key={agent.name}
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.surfaceBorder}`,
                borderRadius: 20,
                padding: "32px 36px",
                display: "flex",
                alignItems: "center",
                gap: 28,
                transform: `translateY(${cardY}px)`,
                opacity: cardOpacity,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Left accent bar */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  backgroundColor: agent.color,
                  borderRadius: "0 0 0 0",
                }}
              />

              {/* Icon */}
              <div
                style={{
                  fontSize: 40,
                  color: agent.color,
                  width: 56,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {agent.icon}
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                    letterSpacing: "-0.01em",
                    marginBottom: 8,
                  }}
                >
                  {agent.name}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    color: COLORS.textSecondary,
                    fontFamily: FONTS.mono,
                    letterSpacing: "0.02em",
                  }}
                >
                  {agent.desc}
                </div>
              </div>

              {/* Active indicator */}
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: agent.color,
                  boxShadow: `0 0 8px ${agent.color}`,
                  flexShrink: 0,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom counter */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 60,
          right: 60,
          opacity: interpolate(frame, [130, 160], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: COLORS.textMuted,
            fontFamily: FONTS.mono,
            letterSpacing: "0.1em",
          }}
        >
          22 AGENTS · LANGGRAPH · EACH RUN
        </div>
      </div>
    </AbsoluteFill>
  );
};
