import {
  DecorationConstants,
  GridConstants,
  ObjectConstants,
  PathConstants,
} from "@kk-garden/shared/constants";

export type GardenGeneratorConfig = {
  gridConstants: GridConstants;
  largeGridConstants: GridConstants;
  pathConstants: PathConstants;
  decorationConstants: DecorationConstants;
  bushConstants: ObjectConstants;
  stonConstants: ObjectConstants;
  treeConstants: ObjectConstants;
};

export const generationsConfig = {
  gridConstants: new GridConstants(32, 17, 17),
  largeGridConstants: new GridConstants(68, 8, 8),
  pathConstants: new PathConstants(
    {
      turn: 0.05,
      accuracy: 0.9,
    },
    {
      paths: 1,
      maxLength: 40,
      minLength: 15,
      maxTurns: 3,
    },
  ),
  decorationConstants: new DecorationConstants(
    {
      density: 3,
      frequency: 0.25,
    },
    {
      padding: 6,
    },
  ),
  bushConstants: new ObjectConstants(
    {
      density: 0.3,
      grouping: 0.4,
      diversity: 1,
    },
    {
      minAmount: 8,
      maxAmount: 14,
    },
  ),
  stonConstants: new ObjectConstants(
    {
      density: 0.3,
      grouping: 0.4,
      diversity: 1,
    },
    {
      minAmount: 8,
      maxAmount: 14,
    },
  ),
  treeConstants: new ObjectConstants(
    {
      density: 0.3,
      grouping: 0.9,
      diversity: 1,
    },
    {
      minAmount: 10,
      maxAmount: 16,
    },
  ),
} as const satisfies GardenGeneratorConfig;
