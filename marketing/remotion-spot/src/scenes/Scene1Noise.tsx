import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLORS, FONTS } from "../theme";

// Fake financial headlines — no real data, no claims
const HEADLINE_ROWS = [
  [
    "FED RATES DECISION",
    "CRUDE +3.1%",
    "VOLA SPIKE",
    "YIELDS INVERT",
    "RISK-OFF",
    "GOLD ATH",
  ],
  [
    "EARNINGS MISS",
    "SECTOR ROTATION",
    "SHORT SQUEEZE",
    "MACRO SHIFT",
    "OPTIONS EXPIRY",
    "CPI MISS",
  ],
  [
    "ALGO TRIGGER",
    "DARK POOL",
    "FLASH MOVE",
    "LIQUIDITY THIN",
    "MOMENTUM BREAK",
    "REGIME CHANGE",
  ],
  [
    "GEOPOLITICAL",
    "CORRELATION BREAK",
    "WHALE MOVE",
    "SPREAD WIDEN",
    "CIRCUIT BREAK",
    "SENTIMENT DROP",
  ],
];

const TICKERS = [
  { symbol: "AAPL", price: "182.34", change: "-0.83%" },
  { symbol: "NVDA", price: "867.21", change: "+2.14%" },
  { symbol: "BTC", price: "68,420", change: "-1.92%" },
  { symbol: "SPY", price: "519.87", change: "+0.31%" },
  { symbol: "TSLA", price: "247.15", change: "-3.41%" },
  { symbol: "GLD", price: "218.40", change: "+0.97%" },
];

export const Scene1Noise: React.FC = () => {
  const frame = useCurrentFrame();

  const sceneOpacity = interpolate(frame, [140, 150], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textY = interpolate(frame, [80, 110], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      {/* Scrolling headline rows */}
      {HEADLINE_ROWS.map((row, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        const speed = 1.2 + i * 0.3;
        const offset = ((frame * dir * speed) % 900) - 900;
        const yPos = 8 + i * 14;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${yPos}%`,
              left: 0,
              right: 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
              opacity: 0.08 + (i % 2 === 0 ? 0.04 : 0),
            }}
          >
            <div
              style={{
                display: "inline-block",
                transform: `translateX(${offset}px)`,
                color: COLORS.textPrimary,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "0.18em",
                fontFamily: FONTS.mono,
              }}
            >
              {[...row, ...row, ...row].join("  ·  ")}
            </div>
          </div>
        );
      })}

      {/* Scattered ticker prices */}
      {TICKERS.map((t, i) => {
        const isUp = t.change.startsWith("+");
        const appear = interpolate(frame, [i * 8, i * 8 + 20], [0, 0.6], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const col = i % 3;
        const row = Math.floor(i / 3);

        return (
          <div
            key={t.symbol}
            style={{
              position: "absolute",
              top: `${55 + row * 18}%`,
              left: `${8 + col * 33}%`,
              opacity: appear,
              textAlign: "left",
            }}
          >
            <div
              style={{
                color: COLORS.textMuted,
                fontSize: 20,
                fontFamily: FONTS.mono,
                letterSpacing: "0.12em",
              }}
            >
              {t.symbol}
            </div>
            <div
              style={{
                color: isUp ? COLORS.neonGreen : COLORS.red,
                fontSize: 28,
                fontWeight: 700,
                fontFamily: FONTS.mono,
              }}
            >
              {t.price}
            </div>
            <div
              style={{
                color: isUp ? COLORS.neonGreenDim : COLORS.redDim,
                fontSize: 18,
                fontFamily: FONTS.mono,
              }}
            >
              {t.change}
            </div>
          </div>
        );
      })}

      {/* Center headline */}
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div
          style={{
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          <div
            style={{
              fontSize: 108,
              fontWeight: 800,
              color: COLORS.textPrimary,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Markets
            <br />
            are noise.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
