import {
  DecorationConstants,
  GridConstants,
  ObjectConstants,
  PathConstants,
} from "@kk-garden/shared/constants";
import type {
  GardenDrawData,
  GardenGridConstants,
  StaticDrawReport,
} from "@kk-garden/shared/types";
import {
  BushesAnimatedSpriteSet,
  StonesSpritesheetSet,
  TreesAnimatedSpriteSet,
} from "@kk-garden/shared/sets";
import { TilesLayerGenerator } from "@lib/generations/generate/segment-generators/generate-tiles.ts";
import { DecorationsLayerGenerator } from "@lib/generations/generate/segment-generators/generate-decorations.ts";
import { PathsLayerGenerator } from "@lib/generations/generate/segment-generators/generate-paths.ts";
import type {
  GeneratedAnimatedSpritesDrawData,
  GeneratedPathsDrawData,
  GeneratedStaticSpritesDrawData,
} from "@lib/generations/generate/draw-data.types.ts";
import { ObjectsLayerGenerator } from "@lib/generations/generate/segment-generators/generate-objects.ts";

type GardenGeneratorConfig = {
  gridConstants: GridConstants;
  largeGridConstants: GridConstants;
  pathConstants: PathConstants;
  decorationConstants: DecorationConstants;
  bushConstants: ObjectConstants;
  stonConstants: ObjectConstants;
  treeConstants: ObjectConstants;
};

const config = {
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

export class GardenGenerator {
  private static readonly config: GardenGeneratorConfig = config;

  public static generate(): GardenDrawData {
    const tileGenerator = new TilesLayerGenerator(this.config.gridConstants);
    const tiles: StaticDrawReport = tileGenerator.generateTiles();

    const decorationsGenerator = new DecorationsLayerGenerator(
      this.config.gridConstants,
      this.config.decorationConstants,
    );
    const decorations: StaticDrawReport =
      decorationsGenerator.generateDecorations();

    const pathGenerator = new PathsLayerGenerator(
      this.config.gridConstants,
      this.config.pathConstants,
    );
    const paths: GeneratedPathsDrawData = pathGenerator.generatePaths();

    const treesGenerator = new ObjectsLayerGenerator(
      TreesAnimatedSpriteSet,
      this.config.largeGridConstants,
      this.config.treeConstants,
      paths.grid,
    );
    const trees: GeneratedAnimatedSpritesDrawData =
      treesGenerator.generateObjects();

    const bushGenerator = new ObjectsLayerGenerator(
      BushesAnimatedSpriteSet,
      this.config.gridConstants,
      this.config.bushConstants,
      paths.grid,
    );
    const bushes: GeneratedAnimatedSpritesDrawData =
      bushGenerator.generateObjects();

    const stoneGenerator = new ObjectsLayerGenerator<true>(
      StonesSpritesheetSet,
      this.config.gridConstants,
      this.config.stonConstants,
      bushes.grid,
    );
    const stones: GeneratedStaticSpritesDrawData =
      stoneGenerator.generateStaticObjects(4);

    return {
      tile: [...tiles.elements, ...decorations.elements, ...paths.pathElements],
      trees: trees.data,
      bushes: bushes.data,
      stones: stones.data,
    };
  }

  public static getGridConstants(): GardenGridConstants {
    return {
      gridConstants: this.config.gridConstants,
      largeGridConstants: this.config.largeGridConstants,
    };
  }
}
