import type {
  GardenDrawData,
  GardenGridConstants,
  GardenGridConstantsDto,
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
import {
  generationsConfig,
  type GardenGeneratorConfig,
} from "@lib/generations/generations-config.js";

export class GardenGenerator {
  private static readonly config: GardenGeneratorConfig = generationsConfig;

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

  public static getGridConstants = (): GardenGridConstants => {
    return {
      gridConstants: generationsConfig.gridConstants,
      largeGridConstants: generationsConfig.largeGridConstants,
    };
  };

  public static getGridConstantsDto = (): GardenGridConstantsDto => {
    return {
      gridConstants: generationsConfig.gridConstants.toDto(),
      largeGridConstants: generationsConfig.largeGridConstants.toDto(),
    };
  };
}
