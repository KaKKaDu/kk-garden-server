import type { GridSimulator } from "@lib/generations/grid-simulator/grid-simulator.ts";
import type {
  GridDrawerElement,
  SpriteData,
  WithId,
} from "@kk-garden/shared/types";

export type GeneratedPathsDrawData = {
  report: string;
  pathElements: WithId<GridDrawerElement>[];
  grid: GridSimulator;
};

export type GeneratedAnimatedSpritesDrawData = {
  report: string;
  grid: GridSimulator;
  data: SpriteData[];
};

export type GeneratedStaticSpritesDrawData = Pick<
  GeneratedAnimatedSpritesDrawData,
  "grid"
> & {
  report: string;
  data: WithId<GridDrawerElement>[];
};
