import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

// Fake equity curve for brand finale — just upward trend, stylized
const BRAND_PATH =
  "M 0,200 C 80,195 120,180 200,155 C 280,130 320,145 400,110 " +
  "C 480,75 520,90 600,55 C 680,20 760,35 840,15 C 900,5 940,10 960,5";

export const Scene7Brand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const logoSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 200, stiffness: 70 },
  });
  const logoY = interpolate(logoSpring, [0, 1], [50, 0]);
  const logoOpacity = interpolate(logoSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  const taglineOpacity = interpolate(frame, [40, 70], [0, 1], {
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [40, 70], [20, 0], {
    extrapolateRight: "clamp",
  });

  // Pulsing neon line
  const curveProgress = interpolate(frame, [20, 90], [0, 960], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowIntensity = interpolate(
    Math.sin((frame / 15) * Math.PI),
    [-1, 1],
    [6, 16]
  );

  const disclaimerOpacity = interpolate(frame, [80, 110], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: sceneIn }}>
      {/* Subtle radial glow behind logo */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(0,255,136,0.06) 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Logo block */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div
          style={{
            opacity: logoOpacity,
            transform: `translateY(${logoY}px)`,
            textAlign: "center",
            marginBottom: -40,
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 32,
            }}
          >
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke={COLORS.neonGreen}
                strokeWidth="2"
                opacity="0.6"
              />
              <circle
                cx="40"
                cy="40"
                r="24"
                fill="none"
                stroke={COLORS.neonGreen}
                strokeWidth="1.5"
                opacity="0.3"
              />
              <circle
                cx="40"
                cy="40"
                r="6"
                fill={COLORS.neonGreen}
                opacity="0.9"
              />
              {/* Chart-like tick marks */}
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <line
                  key={deg}
                  x1={40 + 28 * Math.cos((deg * Math.PI) / 180)}
                  y1={40 + 28 * Math.sin((deg * Math.PI) / 180)}
                  x2={40 + 36 * Math.cos((deg * Math.PI) / 180)}
                  y2={40 + 36 * Math.sin((deg * Math.PI) / 180)}
                  stroke={COLORS.neonGreen}
                  strokeWidth="1.5"
                  opacity="0.4"
                />
              ))}
            </svg>
          </div>

          <div
            style={{
              fontSize: 108,
              fontWeight: 900,
              color: COLORS.textPrimary,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            Creativity
            <span style={{ color: COLORS.neonGreen }}>Land</span>
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 80,
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          <div
            style={{
              fontSize: 36,
              color: COLORS.textSecondary,
              letterSpacing: "0.02em",
              lineHeight: 1.4,
            }}
          >
            Trading automation,
            <br />
            built with discipline.
          </div>
        </div>
      </AbsoluteFill>

      {/* Pulsing equity line at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: 0,
          right: 0,
          height: 160,
          opacity: interpolate(frame, [25, 55], [0, 0.7], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <svg
          viewBox="0 0 960 160"
          style={{ width: "100%", height: "100%" }}
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation={glowIntensity * 0.5} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="brandClip">
              <rect x="0" y="0" width={curveProgress} height="160" />
            </clipPath>
          </defs>
          <path
            d={BRAND_PATH}
            fill="none"
            stroke={COLORS.neonGreen}
            strokeWidth="2.5"
            filter="url(#glow)"
            clipPath="url(#brandClip)"
          />
        </svg>
      </div>

      {/* Disclaimer */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          right: 60,
          textAlign: "center",
          opacity: disclaimerOpacity,
        }}
      >
        <div
          style={{
            fontSize: 18,
            color: COLORS.textMuted,
            fontFamily: FONTS.mono,
            letterSpacing: "0.08em",
            lineHeight: 1.5,
          }}
        >
          Research project. Trading involves risk. No profit guaranteed.
        </div>
      </div>
    </AbsoluteFill>
  );
};
