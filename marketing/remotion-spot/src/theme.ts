// Design tokens for CreativityLand vertical ad

export const COLORS = {
  bg: "#050508",
  bgDeep: "#020204",
  surface: "#0d0d18",
  surfaceBorder: "rgba(99, 102, 241, 0.14)",
  neonGreen: "#00ff88",
  neonGreenDim: "#00cc6a",
  neonGreenGlow: "rgba(0, 255, 136, 0.18)",
  violet: "#7c3aed",
  violetLight: "#a855f7",
  violetGlow: "rgba(124, 58, 237, 0.1)",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#3d4a5c",
  red: "#ef4444",
  redDim: "#b91c1c",
  amber: "#f59e0b",
  gridLine: "rgba(255, 255, 255, 0.025)",
};

// Font stacks — no external deps, works offline
export const FONTS = {
  display: `"SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif`,
  mono: `"SF Mono", "JetBrains Mono", "Fira Code", "Courier New", monospace`,
};

// Scene timing at 30 fps
// Scene 1:  0-5s   = frames 0-150
// Scene 2:  5-11s  = frames 150-330
// Scene 3: 11-18s  = frames 330-540
// Scene 4: 18-27s  = frames 540-810
// Scene 5: 27-35s  = frames 810-1050
// Scene 6: 35-41s  = frames 1050-1230
// Scene 7: 41-45s  = frames 1230-1350
export const SCENES = {
  s1: { from: 0, duration: 150 },
  s2: { from: 150, duration: 180 },
  s3: { from: 330, duration: 210 },
  s4: { from: 540, duration: 270 },
  s5: { from: 810, duration: 240 },
  s6: { from: 1050, duration: 180 },
  s7: { from: 1230, duration: 120 },
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 1350; // 45s
