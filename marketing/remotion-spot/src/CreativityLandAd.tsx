import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES, COLORS, FONTS } from "./theme";
import { Background } from "./components/Background";
import { Scene1Noise } from "./scenes/Scene1Noise";
import { Scene2Agents } from "./scenes/Scene2Agents";
import { Scene3Pipeline } from "./scenes/Scene3Pipeline";
import { Scene4Portfolio } from "./scenes/Scene4Portfolio";
import { Scene5Risk } from "./scenes/Scene5Risk";
import { Scene6Roadmap } from "./scenes/Scene6Roadmap";
import { Scene7Brand } from "./scenes/Scene7Brand";

export const CreativityLandAd: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: FONTS.display,
        overflow: "hidden",
      }}
    >
      {/* Persistent cinematic background — visible through all scenes */}
      <Background />

      <Sequence from={SCENES.s1.from} durationInFrames={SCENES.s1.duration}>
        <Scene1Noise />
      </Sequence>

      <Sequence from={SCENES.s2.from} durationInFrames={SCENES.s2.duration}>
        <Scene2Agents />
      </Sequence>

      <Sequence from={SCENES.s3.from} durationInFrames={SCENES.s3.duration}>
        <Scene3Pipeline />
      </Sequence>

      <Sequence from={SCENES.s4.from} durationInFrames={SCENES.s4.duration}>
        <Scene4Portfolio />
      </Sequence>

      <Sequence from={SCENES.s5.from} durationInFrames={SCENES.s5.duration}>
        <Scene5Risk />
      </Sequence>

      <Sequence from={SCENES.s6.from} durationInFrames={SCENES.s6.duration}>
        <Scene6Roadmap />
      </Sequence>

      <Sequence from={SCENES.s7.from} durationInFrames={SCENES.s7.duration}>
        <Scene7Brand />
      </Sequence>
    </AbsoluteFill>
  );
};
