import React from "react";
import { Composition } from "remotion";
import { CreativityLandAd } from "./CreativityLandAd";
import { WIDTH, HEIGHT, FPS, TOTAL_FRAMES } from "./theme";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="CreativityLandVerticalAd"
        component={CreativityLandAd}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
