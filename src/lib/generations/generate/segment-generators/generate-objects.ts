import { AnimatedSpriteSet, SpritesheetSet } from "@kk-garden/shared/sets";
import {
  type GridConstants,
  ObjectConstants,
} from "@kk-garden/shared/constants";
import type {
  Cell,
  Coordinates,
  GridDrawerElement,
  Nullable,
  SpriteData,
  SpritesheetElement,
  WithId,
} from "@kk-garden/shared/types";
import { GridSimulator } from "@lib/generations/grid-simulator/grid-simulator.ts";
import type {
  GeneratedAnimatedSpritesDrawData,
  GeneratedStaticSpritesDrawData,
} from "@lib/generations/generate/draw-data.types.ts";
import {
  animatedReportElementsFromSpriteData,
  generateAnimatedReport,
} from "@lib/generations/reports/animated-report.ts";
import { TileSimulator } from "@lib/generations/tile-simulator/tile-simulator.ts";
import { generateStaticReport } from "@lib/generations/reports/static-report.ts";

export type ResolveObjectSpriteSet<Static extends boolean> = Static extends true
  ? SpritesheetSet<string>
  : AnimatedSpriteSet<string>;

export class ObjectsLayerGenerator<Static extends boolean = false> {
  private readonly objectConstants: ObjectConstants;
  private readonly gridConstants: GridConstants;
  private readonly grid: GridSimulator;
  private readonly spriteSet: ResolveObjectSpriteSet<Static>;

  constructor(
    spriteSet: ResolveObjectSpriteSet<Static>,
    gridConstants: GridConstants,
    objectConstants: ObjectConstants,
    extend?: GridSimulator,
  ) {
    this.objectConstants = objectConstants;
    this.gridConstants = gridConstants;
    this.grid = new GridSimulator(gridConstants, extend);
    this.spriteSet = spriteSet;
  }

  private generateObjectCount(): number {
    const minAmount: number = this.objectConstants.minObjectsCount;
    const maxAmount: number = this.objectConstants.maxObjectsCount;
    const density: number = this.objectConstants.objectDensity;

    const target: number =
      minAmount + Math.floor((maxAmount - minAmount) * density);

    const variance: number = Math.floor((maxAmount - minAmount) * 0.15);

    const min: number = Math.max(minAmount, target - variance);
    const max: number = Math.min(maxAmount, target + variance);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private groupingScore(cell: Cell): number {
    const neighbours: number = this.grid.countReservedNeighbours(cell);

    return 1 / Math.pow(neighbours + 1, 4);
  }

  private densityScore(cell: Cell, placed: Cell[]): number {
    if (placed.length === 0) {
      return 0;
    }
    let distanceSum: number = 0;
    placed.forEach((placedCell: Cell) => {
      distanceSum += Math.sqrt(
        Math.abs(
          Math.pow(cell.row - placedCell.row, 2) +
            Math.pow(cell.column - placedCell.column, 2),
        ),
      );
    });
    return 1 - 1 / (1 + distanceSum / placed.length);
  }

  private pickWeightedCandidate(scored: [number, number][]): Nullable<number> {
    const total: number = scored.reduce(
      (sum: number, [, score]: [number, number]): number => sum + score,
      0,
    );

    let threshold: number = Math.random() * total;
    for (const [index, score] of scored) {
      threshold -= score;
      if (threshold <= 0) {
        return index;
      }
    }

    return scored?.[scored.length - 1]?.[0];
  }

  private getSpritePlacements(): Cell[] {
    const objectCount: number = this.generateObjectCount();

    let candidates: Cell[] = this.grid.getFreeCells();
    if (candidates.length < objectCount) {
      return [];
    }

    const removeCandidate = (cell: Cell) => {
      candidates = candidates.filter(
        (candidate: Cell) =>
          candidate.row !== cell.row || candidate.column !== cell.column,
      );
    };

    const placed: Cell[] = [];
    const firstPlaced: Cell =
      candidates[Math.floor(Math.random() * candidates.length)];
    placed.push(firstPlaced);
    removeCandidate(firstPlaced);
    this.grid.reserve(firstPlaced);
    for (let i = 1; i < objectCount; i++) {
      const scores: [number, number][] = [];
      candidates.forEach((candidate: Cell, index: number) => {
        const score: number =
          this.groupingScore(candidate) * this.objectConstants.objectGrouping +
          this.densityScore(candidate, placed) *
            this.objectConstants.objectDensity;
        scores.push([index, Math.pow(score, 2)]);
      });
      const chosen: Cell = candidates[this.pickWeightedCandidate(scores) || 0];
      placed.push(chosen);
      removeCandidate(chosen);
      this.grid.reserve(chosen);
    }

    return placed;
  }

  public generateObjects(): GeneratedAnimatedSpritesDrawData {
    const placements: Cell[] = this.getSpritePlacements();
    const set = this.spriteSet as AnimatedSpriteSet<string>;

    const data: SpriteData[] = placements.map((cell: Cell): SpriteData => {
      return {
        sprite: set.getRandomSprite().sprite,
        cell,
      };
    });

    return {
      report: generateAnimatedReport(
        animatedReportElementsFromSpriteData(data),
      ),
      grid: this.grid,
      data,
    };
  }

  public generateStaticObjects(index: number): GeneratedStaticSpritesDrawData {
    const placements: Cell[] = this.getSpritePlacements();
    const set = this.spriteSet as SpritesheetSet<string>;

    const data: WithId<GridDrawerElement>[] = placements
      .map((cell: Cell): Nullable<WithId<GridDrawerElement>> => {
        const randomElement: WithId<SpritesheetElement> =
          set.getRandomElement();
        let coordinates: Nullable<Coordinates> = null;
        if (
          randomElement.width > this.gridConstants.cellSize ||
          randomElement.height > this.gridConstants.cellSize
        ) {
          return null;
        }
        if (
          randomElement.width < randomElement.width ||
          randomElement.height < randomElement.height
        ) {
          coordinates = new TileSimulator(this.gridConstants).placeFigure({
            ...randomElement,
          });
        }
        return {
          id: randomElement.id,
          spritesheetPath: set.path,
          element: set.getRandomElement(),
          cell,
          index,
          innerCoordinates: coordinates || undefined,
        };
      })
      .filter(Boolean) as WithId<GridDrawerElement>[];

    return {
      report: generateStaticReport(data),
      grid: this.grid,
      data,
    };
  }
}
