# CreativityLand — Vertical Ad (Remotion)

9:16 vertical video spot for CreativityLand trading bot.
1080×1920 · 45s · 30 FPS · dark fintech premium style.

## Quick start

```bash
cd marketing/remotion-spot
npm install
npm run preview    # opens Remotion Studio in browser
```

## Render

```bash
npm run render          # → out/creativityland-ad.mp4
npm run render:gif      # → out/creativityland-ad.gif
```

Output lands in `marketing/remotion-spot/out/`. Gitignored.

## Structure

```
src/
  index.ts              # Remotion entry point
  Root.tsx              # Registers compositions
  CreativityLandAd.tsx  # Main composition — sequences all scenes
  theme.ts              # Colors, fonts, timing constants — edit here first
  components/
    Background.tsx      # Persistent animated grid backdrop
  scenes/
    Scene1Noise.tsx     # 0-5s   — Market noise / ticker rain
    Scene2Agents.tsx    # 5-11s  — AI agent cards
    Scene3Pipeline.tsx  # 11-18s — News→Sentiment→Research→Signal flow
    Scene4Portfolio.tsx # 18-27s — Mobile portfolio mockup
    Scene5Risk.tsx      # 27-35s — SL/TP levels, risk metrics, heartbeat
    Scene6Roadmap.tsx   # 35-41s — Expansion roadmap cards
    Scene7Brand.tsx     # 41-45s — Logo, tagline, disclaimer
```

## Editing

### Change copy / colors
Edit `src/theme.ts` — all colors and scene timing are there.

### Change text on screen
Each scene file has text strings inline. Search for the relevant phrase.

### Change timing
`src/theme.ts` → `SCENES` object. Duration in frames (30 FPS).
Total must stay ≤ `TOTAL_FRAMES = 1350` (45s).

### Add audio
In `src/CreativityLandAd.tsx`, add `<Audio src={staticFile("track.mp3")} />`.
Place audio file in `public/`. No audio included — ready for integration.

## No external data
Zero API calls. Zero secrets. No connection to bot, Supabase, or Alpaca.
All numbers are illustrative (fake portfolio values, fake agent scores).

## Disclaimer
Final scene includes: "Research project. Trading involves risk. No profit guaranteed."
Do not remove before publishing.

## Dependencies
Confined to this folder. Does not affect `dashboard/` or Python backend.

| Package | Why |
|---------|-----|
| `remotion` | Video composition runtime |
| `@remotion/cli` | Studio + render CLI |
| `react` / `react-dom` | Component model |
| `typescript` | Type safety |
