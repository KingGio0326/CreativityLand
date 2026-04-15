import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

// Fake equity curve path — upward trending with realistic volatility
// Viewbox: 0 0 960 240, generally rising from 200 → 40 (inverted Y: lower = higher equity)
const EQUITY_PATH =
  "M 0,180 C 40,175 70,185 110,165 C 150,145 170,160 210,140 " +
  "C 250,120 270,135 310,110 C 350,85 370,100 410,75 " +
  "C 450,50 470,65 510,45 C 550,25 570,38 610,20 " +
  "C 650,8 670,18 710,12 C 750,6 780,14 820,8 " +
  "C 860,2 900,10 960,5";

const POSITIONS = [
  { ticker: "AAPL", name: "Apple", qty: 5, pnl: "+$12.40", pct: "+0.68%", green: true },
  { ticker: "NVDA", name: "NVIDIA", qty: 1, pnl: "+$31.20", pct: "+3.61%", green: true },
  { ticker: "BTC-USD", name: "Bitcoin", qty: 0.01, pnl: "-$8.30", pct: "-1.21%", green: false },
];

export const Scene4Portfolio: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const sceneOut = interpolate(frame, [250, 270], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneOpacity = Math.min(sceneIn, sceneOut);

  const heroSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 200, stiffness: 80 },
  });
  const heroY = interpolate(heroSpring, [0, 1], [40, 0]);
  const heroOpacity = interpolate(heroSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Equity curve draws in progressively
  const curveProgress = interpolate(frame, [40, 130], [0, 960], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cardSpring = (i: number) =>
    spring({
      frame: frame - 140 - i * 20,
      fps,
      config: { damping: 180, stiffness: 100 },
    });

  const labelOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      {/* Label */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 60,
          right: 60,
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.neonGreen,
            letterSpacing: "0.2em",
            fontFamily: FONTS.mono,
          }}
        >
          — Portfolio Monitor —
        </div>
      </div>

      {/* Hero equity block */}
      <div
        style={{
          position: "absolute",
          top: 140,
          left: 60,
          right: 60,
          opacity: heroOpacity,
          transform: `translateY(${heroY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: COLORS.textMuted,
            fontFamily: FONTS.mono,
            letterSpacing: "0.12em",
            marginBottom: 8,
          }}
        >
          PORTFOLIO VALUE
        </div>
        <div
          style={{
            fontSize: 100,
            fontWeight: 900,
            color: COLORS.textPrimary,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          $1,024.83
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 12,
          }}
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: COLORS.neonGreen,
            }}
          >
            +$24.83
          </div>
          <div
            style={{
              backgroundColor: "rgba(0,255,136,0.1)",
              border: "1px solid rgba(0,255,136,0.25)",
              borderRadius: 8,
              padding: "6px 16px",
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.neonGreen,
              fontFamily: FONTS.mono,
            }}
          >
            +2.48%
          </div>
        </div>
      </div>

      {/* Equity curve */}
      <div
        style={{
          position: "absolute",
          top: 380,
          left: 0,
          right: 0,
          height: 240,
        }}
      >
        <svg
          viewBox="0 0 960 240"
          style={{ width: "100%", height: "100%" }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.neonGreen} stopOpacity="0.2" />
              <stop offset="100%" stopColor={COLORS.neonGreen} stopOpacity="0" />
            </linearGradient>
            <clipPath id="curveClip">
              <rect x="0" y="0" width={curveProgress} height="240" />
            </clipPath>
          </defs>

          {/* Fill area */}
          <path
            d={`${EQUITY_PATH} L 960,240 L 0,240 Z`}
            fill="url(#curveGrad)"
            clipPath="url(#curveClip)"
          />
          {/* Line */}
          <path
            d={EQUITY_PATH}
            fill="none"
            stroke={COLORS.neonGreen}
            strokeWidth="3"
            clipPath="url(#curveClip)"
          />
          {/* Endpoint dot */}
          <circle cx="960" cy="5" r="6" fill={COLORS.neonGreen}
            opacity={curveProgress > 940 ? 1 : 0}
          />
        </svg>
      </div>

      {/* Stats row */}
      <div
        style={{
          position: "absolute",
          top: 630,
          left: 60,
          right: 60,
          display: "flex",
          justifyContent: "space-between",
          opacity: interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {[
          { label: "CASH", value: "$372.40" },
          { label: "P&L 24H", value: "+$18.90" },
          { label: "POSITIONS", value: "3 / 10" },
        ].map((stat) => (
          <div key={stat.label} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 18,
                color: COLORS.textMuted,
                fontFamily: FONTS.mono,
                letterSpacing: "0.12em",
                marginBottom: 6,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: COLORS.textPrimary,
                fontFamily: FONTS.mono,
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Positions list */}
      <div
        style={{
          position: "absolute",
          top: 750,
          left: 60,
          right: 60,
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: COLORS.textMuted,
            fontFamily: FONTS.mono,
            letterSpacing: "0.12em",
            marginBottom: 20,
            opacity: interpolate(frame, [110, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          OPEN POSITIONS
        </div>

        {POSITIONS.map((pos, i) => {
          const cs = cardSpring(i);
          const posOpacity = interpolate(cs, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const posX = interpolate(cs, [0, 1], [40, 0]);

          return (
            <div
              key={pos.ticker}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "24px 0",
                borderBottom: `1px solid ${COLORS.surfaceBorder}`,
                opacity: posOpacity,
                transform: `translateX(${posX}px)`,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {pos.name}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color: COLORS.textMuted,
                    fontFamily: FONTS.mono,
                    marginTop: 4,
                  }}
                >
                  {pos.ticker} · {pos.qty} shares
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: pos.green ? COLORS.neonGreen : COLORS.red,
                    fontFamily: FONTS.mono,
                  }}
                >
                  {pos.pnl}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color: pos.green ? COLORS.neonGreenDim : COLORS.redDim,
                    fontFamily: FONTS.mono,
                  }}
                >
                  {pos.pct}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Caption */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          right: 60,
          textAlign: "center",
          opacity: interpolate(frame, [200, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: COLORS.textPrimary,
            letterSpacing: "-0.02em",
          }}
        >
          Portfolio, equity, positions.
        </div>
      </div>
    </AbsoluteFill>
  );
};
