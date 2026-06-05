import {
  DecorationConstants,
  type GridConstants,
} from "@kk-garden/shared/constants";
import type {
  Coordinates,
  GridDrawerElement,
  Nullable,
  SizeMeasures,
  SpritesheetElement,
  StaticDrawReport,
  WithId,
} from "@kk-garden/shared/types";
import { DecorationsSpritesheetSet } from "@kk-garden/shared/sets";
import { TileSimulator } from "@lib/generations/tile-simulator/tile-simulator.ts";
import { generateStaticReport } from "@lib/generations/reports/static-report.ts";

export class DecorationsLayerGenerator {
  private readonly constants: GridConstants;
  private readonly density: number = 3;
  private readonly padding: number = 2;
  private readonly frequency: number = 0.4;

  constructor(
    constants: GridConstants,
    decorationConstants: DecorationConstants,
  ) {
    this.constants = constants;
    this.density = decorationConstants.decorationsDensity;
    this.padding = decorationConstants.padding;
    this.frequency = decorationConstants.decorationsFrequency;
  }

  public generateDecorations = (): StaticDrawReport => {
    const decorations: WithId<GridDrawerElement>[] = [];
    for (let i: number = 0; i < this.constants.rows; i++) {
      for (let j: number = 0; j < this.constants.columns; j++) {
        const tileDecorations: WithId<GridDrawerElement>[] = [];
        const simulator: TileSimulator = new TileSimulator(
          this.constants,
          this.padding,
        );
        const shouldGenerate: boolean = Math.random() < this.frequency;
        const iterationsToGenerate: number = shouldGenerate
          ? Math.floor(Math.random() * this.density)
          : 0;
        for (let k = 0; k < iterationsToGenerate; k++) {
          const el: WithId<SpritesheetElement> =
            DecorationsSpritesheetSet.getRandomElement();
          const canvasSize: SizeMeasures = {
            ...el,
          };
          const coordinates: Nullable<Coordinates> = simulator.placeFigure({
            ...canvasSize,
          });
          if (coordinates) {
            tileDecorations.push({
              id: el.id,
              spritesheetPath: DecorationsSpritesheetSet.path,
              element: el,
              cell: {
                row: i,
                column: j,
              },
              sizes: { ...canvasSize },
              innerCoordinates: coordinates,
              index: 2,
            });
          }
        }
        decorations.push(...tileDecorations);
      }
    }
    return {
      report: generateStaticReport(decorations),
      elements: decorations,
    };
  };
}
