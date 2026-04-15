import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

const STEPS = [
  { label: "NEWS", sub: "articles · feeds" },
  { label: "SENTIMENT", sub: "FinBERT score" },
  { label: "RESEARCH", sub: "arXiv · LLM" },
  { label: "SIGNAL", sub: "BUY / SELL / HOLD" },
];

export const Scene3Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const sceneOut = interpolate(frame, [190, 210], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneOpacity = Math.min(sceneIn, sceneOut);

  const labelOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [15, 45], [20, 0], {
    extrapolateRight: "clamp",
  });

  // Signal badge appears late in the scene
  const badgeSpring = spring({
    frame: frame - 130,
    fps,
    config: { damping: 150, stiffness: 120 },
  });
  const badgeScale = interpolate(badgeSpring, [0, 1], [0.6, 1]);
  const badgeOpacity = interpolate(badgeSpring, [0, 0.3], [0, 1], {
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
            marginBottom: 20,
          }}
        >
          — Signal Generation —
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: COLORS.textPrimary,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          From data to structured signals.
        </div>
      </div>

      {/* Pipeline flow */}
      <div
        style={{
          position: "absolute",
          top: 480,
          left: 60,
          right: 60,
        }}
      >
        {STEPS.map((step, i) => {
          const stepSpring = spring({
            frame: frame - 40 - i * 20,
            fps,
            config: { damping: 180, stiffness: 100 },
          });
          const stepOpacity = interpolate(stepSpring, [0, 0.5], [0, 1], {
            extrapolateRight: "clamp",
          });
          const stepX = interpolate(stepSpring, [0, 1], [-60, 0]);
          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.label}>
              {/* Step node */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  opacity: stepOpacity,
                  transform: `translateX(${stepX}px)`,
                }}
              >
                {/* Circle indicator */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    backgroundColor: isLast
                      ? COLORS.neonGreen
                      : COLORS.violetLight,
                    boxShadow: isLast
                      ? `0 0 12px ${COLORS.neonGreenGlow}`
                      : `0 0 8px ${COLORS.violetGlow}`,
                    flexShrink: 0,
                  }}
                />

                <div
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${isLast ? "rgba(0,255,136,0.2)" : COLORS.surfaceBorder}`,
                    borderRadius: 16,
                    padding: "24px 28px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 700,
                        color: isLast ? COLORS.neonGreen : COLORS.textPrimary,
                        fontFamily: FONTS.mono,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {step.label}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        color: COLORS.textSecondary,
                        marginTop: 4,
                      }}
                    >
                      {step.sub}
                    </div>
                  </div>

                  {isLast && (
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        fontFamily: FONTS.mono,
                        color: COLORS.neonGreen,
                        letterSpacing: "0.05em",
                      }}
                    >
                      84% conf
                    </div>
                  )}
                </div>
              </div>

              {/* Connector arrow */}
              {!isLast && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 10,
                    height: 36,
                    opacity: stepOpacity,
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      height: 36,
                      backgroundColor: COLORS.surfaceBorder,
                      marginLeft: 8,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Final BUY signal badge */}
      <div
        style={{
          position: "absolute",
          bottom: 140,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: badgeOpacity,
          transform: `scale(${badgeScale})`,
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(0, 255, 136, 0.08)",
            border: "2px solid rgba(0,255,136,0.4)",
            borderRadius: 24,
            padding: "24px 60px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: COLORS.neonGreen,
              letterSpacing: "0.08em",
              fontFamily: FONTS.mono,
            }}
          >
            BUY
          </div>
          <div
            style={{
              fontSize: 24,
              color: COLORS.neonGreenDim,
              fontFamily: FONTS.mono,
              letterSpacing: "0.1em",
            }}
          >
            STRONG CONSENSUS · 84%
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
