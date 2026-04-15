import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

export const Scene5Risk: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const sceneOut = interpolate(frame, [220, 240], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneOpacity = Math.min(sceneIn, sceneOut);

  const headerOpacity = interpolate(frame, [10, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Animated SL/TP bar
  const barProgress = interpolate(frame, [50, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Cards spring in
  const card = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 180, stiffness: 90 } });

  const heartbeatOpacity = interpolate(frame, [160, 200], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Heartbeat pulse
  const pulse = Math.sin((frame / 8) * Math.PI);
  const heartbeatScale = interpolate(pulse, [-1, 1], [0.95, 1.05]);

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 60,
          right: 60,
          opacity: headerOpacity,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.red,
            letterSpacing: "0.2em",
            fontFamily: FONTS.mono,
            marginBottom: 20,
          }}
        >
          — Risk Management —
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
          Risk before execution.
        </div>
      </div>

      {/* SL/TP Levels diagram */}
      <div
        style={{
          position: "absolute",
          top: 370,
          left: 60,
          right: 60,
          opacity: interpolate(frame, [40, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: COLORS.textMuted,
            fontFamily: FONTS.mono,
            letterSpacing: "0.1em",
            marginBottom: 24,
          }}
        >
          POSITION LEVELS
        </div>

        {/* Price bar */}
        <div
          style={{
            position: "relative",
            height: 8,
            backgroundColor: COLORS.surfaceBorder,
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          {/* SL zone */}
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${barProgress * 20}%`,
              top: 0,
              bottom: 0,
              backgroundColor: COLORS.red,
              borderRadius: "4px 0 0 4px",
              opacity: 0.7,
            }}
          />
          {/* Profit zone */}
          <div
            style={{
              position: "absolute",
              left: `${barProgress * 20}%`,
              width: `${barProgress * 50}%`,
              top: 0,
              bottom: 0,
              backgroundColor: COLORS.neonGreen,
              opacity: 0.5,
            }}
          />
          {/* TP zone */}
          <div
            style={{
              position: "absolute",
              right: 0,
              width: `${barProgress * 30}%`,
              top: 0,
              bottom: 0,
              backgroundColor: COLORS.neonGreenDim,
              borderRadius: "0 4px 4px 0",
              opacity: 0.8,
            }}
          />
          {/* Current price marker */}
          <div
            style={{
              position: "absolute",
              left: `${20 + barProgress * 35}%`,
              top: -8,
              bottom: -8,
              width: 3,
              backgroundColor: COLORS.textPrimary,
              borderRadius: 2,
              opacity: barProgress,
            }}
          />
        </div>

        {/* Labels */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {[
            { label: "STOP LOSS", value: "$168.40", color: COLORS.red },
            { label: "ENTRY", value: "$182.34", color: COLORS.textPrimary },
            { label: "TAKE PROFIT", value: "$199.80", color: COLORS.neonGreen },
          ].map((l) => (
            <div key={l.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.textMuted,
                  fontFamily: FONTS.mono,
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                {l.label}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: l.color,
                  fontFamily: FONTS.mono,
                }}
              >
                {l.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk metrics cards */}
      <div
        style={{
          position: "absolute",
          top: 680,
          left: 60,
          right: 60,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        {[
          { label: "VaR 95%", value: "-2.1%", sub: "daily at risk" },
          { label: "Kelly", value: "3.2%", sub: "position size" },
          { label: "Max DD", value: "-15%", sub: "emergency close" },
          { label: "Circuit", value: "-5%", sub: "daily loss gate" },
        ].map((metric, i) => {
          const cs = card(80 + i * 20);
          return (
            <div
              key={metric.label}
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.surfaceBorder}`,
                borderRadius: 16,
                padding: "28px 24px",
                opacity: interpolate(cs, [0, 0.5], [0, 1], {
                  extrapolateRight: "clamp",
                }),
                transform: `translateY(${interpolate(cs, [0, 1], [30, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.textMuted,
                  fontFamily: FONTS.mono,
                  letterSpacing: "0.1em",
                  marginBottom: 8,
                }}
              >
                {metric.label}
              </div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  color: COLORS.textPrimary,
                  letterSpacing: "-0.02em",
                  fontFamily: FONTS.mono,
                }}
              >
                {metric.value}
              </div>
              <div
                style={{
                  fontSize: 18,
                  color: COLORS.textMuted,
                  marginTop: 4,
                }}
              >
                {metric.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Position manager heartbeat */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          right: 60,
          opacity: heartbeatOpacity,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            backgroundColor: COLORS.neonGreen,
            boxShadow: `0 0 ${10 + pulse * 8}px ${COLORS.neonGreen}`,
            transform: `scale(${heartbeatScale})`,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 22,
            color: COLORS.textSecondary,
            fontFamily: FONTS.mono,
            letterSpacing: "0.08em",
          }}
        >
          POSITION MANAGER · EVERY HOUR · BROKER SYNC
        </div>
      </div>
    </AbsoluteFill>
  );
};
