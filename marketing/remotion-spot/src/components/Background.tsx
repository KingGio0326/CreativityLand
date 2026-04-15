import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../theme";

/**
 * Persistent dark cinematic background with subtle animated grid.
 * Renders behind all scenes.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  // Very slow pulse on the grid opacity — barely perceptible
  const gridOpacity = interpolate(
    Math.sin((frame / 60) * Math.PI),
    [-1, 1],
    [0.018, 0.03]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {/* Grid overlay */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, opacity: gridOpacity }}
      >
        <defs>
          <pattern
            id="grid"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Bottom vignette */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 400,
          background:
            "linear-gradient(to top, rgba(5,5,8,0.95) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Top vignette */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          background:
            "linear-gradient(to bottom, rgba(5,5,8,0.7) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
