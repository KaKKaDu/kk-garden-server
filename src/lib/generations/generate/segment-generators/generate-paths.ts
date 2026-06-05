import {
  type Cell,
  type Direction,
  directions,
  type GridDrawerElement,
  type GridPathElement,
  type Move,
  type Nullable,
  type PathMap,
  type PathMapElement,
  type SpritesheetElement,
  type WithId,
} from "@kk-garden/shared/types";
import { type GridConstants, PathConstants } from "@kk-garden/shared/constants";
import {
  pathTilesDirections,
  type TilePathSpritesheetElementKey,
  TilesSpritesheetSet,
} from "@kk-garden/shared/sets";
import { GridSimulator } from "@lib/generations/grid-simulator/grid-simulator.ts";
import { PathSimulator } from "@lib/generations/path-simulator/path-simulator.js";
import type { GeneratedPathsDrawData } from "@lib/generations/generate/draw-data.types.js";
import { generateStaticReport } from "@lib/generations/reports/static-report.js";

export class PathsLayerGenerator {
  private readonly consts: GridConstants;
  private readonly pathConsts: PathConstants;
  private readonly pathMap: PathMap = new Map<string, PathMapElement[]>([]);

  constructor(constants: GridConstants, pathConstants: PathConstants) {
    this.consts = constants;
    this.pathConsts = pathConstants;
  }

  private generateMapKey(dirs: Direction[]): string {
    return dirs.sort().join("-");
  }

  private getPathsFromMap(directions: Direction[]): Nullable<PathMapElement[]> {
    return this.pathMap.get(this.generateMapKey(directions)) || null;
  }

  private getPathsForDirections(dirs: Direction[]): PathMapElement[] {
    const mapResult: Nullable<PathMapElement[]> = this.getPathsFromMap(dirs);
    if (mapResult) {
      return mapResult;
    } else {
      const filteredPaths: TilePathSpritesheetElementKey[] = [];
      const direction: Direction = dirs.sort(
        (a: Direction, b: Direction): number =>
          pathTilesDirections[a].length - pathTilesDirections[b].length,
      )[0];
      pathTilesDirections[direction].forEach(
        (path: TilePathSpritesheetElementKey): void => {
          let result: boolean = true;
          for (let i: number = 1; i < dirs.length; i++) {
            const directionPaths: TilePathSpritesheetElementKey[] =
              pathTilesDirections[dirs[i]];
            if (!directionPaths.includes(path)) {
              result = false;
              break;
            }
          }
          if (result) {
            filteredPaths.push(path);
          }
        },
      );
      const pathElements: PathMapElement[] = filteredPaths.map(
        (path: TilePathSpritesheetElementKey): PathMapElement => {
          const extraDirections: Direction[] = directions.filter(
            (dir: Direction) => !dirs.includes(dir),
          );
          let priority: number = 1;
          extraDirections.forEach((dir: Direction): void => {
            const directionPaths: TilePathSpritesheetElementKey[] =
              pathTilesDirections[dir];
            if (directionPaths.includes(path)) {
              priority += 1;
            }
          });
          return {
            priority,
            key: path,
          };
        },
      );
      this.pathMap.set(this.generateMapKey(dirs), pathElements);
      return pathElements;
    }
  }

  private pickPathWithPriority(items: PathMapElement[]): PathMapElement {
    const weights: number[] = items.map(
      (item) => 1 / item.priority ** this.pathConsts.accuracy,
    );

    const totalWeight: number = weights.reduce((sum, w) => sum + w, 0);

    let random: number = Math.random() * totalWeight;

    for (let i: number = 0; i < items.length; i++) {
      random -= weights[i] || 0;

      if (random <= 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }

  private getPathElement(dirs: Direction[]): PathMapElement {
    const pathsWithPriority: PathMapElement[] =
      this.getPathsForDirections(dirs);
    return this.pickPathWithPriority(pathsWithPriority);
  }

  private isCorner(cell: Cell): boolean {
    let isCorner: boolean = false;
    if (cell.column === 0 && cell.row === 0) {
      isCorner = true;
    } else if (cell.column === this.consts.columns - 1 && cell.row === 0) {
      isCorner = true;
    } else if (cell.column === 0 && cell.row === this.consts.rows - 1) {
      isCorner = true;
    } else if (
      cell.column === this.consts.columns - 1 &&
      cell.row === this.consts.rows - 1
    ) {
      isCorner = true;
    }
    return isCorner;
  }

  private getRandomEdgeTile(
    grid: GridSimulator,
  ): Nullable<{ cell: Cell; direction: Direction }> {
    let randomEdgeTile: Nullable<Cell> = null;
    let allEdgesCount: number = 0;
    const isVertical: boolean = Math.random() < 0.5;
    let direction: Direction = "top";
    while (
      !randomEdgeTile ||
      grid.isReserved(randomEdgeTile) ||
      this.isCorner(randomEdgeTile)
    ) {
      if (isVertical) {
        const column: number =
          (this.consts.columns - 1) * (Math.random() < 0.5 ? 1 : 0);
        direction = column === 0 ? "right" : "left";
        const row: number = Math.floor(Math.random() * this.consts.rows);
        randomEdgeTile = {
          column,
          row,
        };
      } else {
        const row: number =
          (this.consts.rows - 1) * (Math.random() < 0.5 ? 1 : 0);
        direction = row === 0 ? "bottom" : "top";
        const column: number = Math.floor(Math.random() * this.consts.columns);
        randomEdgeTile = {
          column,
          row,
        };
      }
      allEdgesCount += 1;
      if (allEdgesCount >= this.consts.rows * 2 + this.consts.columns * 2 - 4) {
        return null;
      }
    }
    return {
      cell: randomEdgeTile,
      direction,
    };
  }

  private lastTern(history: Move[]): Nullable<"left" | "right"> {
    return history.find((move: Move) => move === "left" || move === "right");
  }

  private generatePath(
    grid: GridSimulator,
    from: Cell,
    direction: Direction,
    index: number,
  ): WithId<GridDrawerElement>[] {
    grid.reserve(from);
    const path = new PathSimulator(from, direction, index);

    let current: Cell = path.go("straight");
    let stepsCount: number = 0;
    const history: Move[] = [];
    grid.reserve(current);
    while (true) {
      if (this.pathConsts.maxPathLength < stepsCount || grid.isEdge(current)) {
        break;
      }
      const possibleMoves: Move[] = ["straight", "left", "right"];
      const validMoves: { move: Move; weight: number }[] = [];

      for (const move of possibleMoves) {
        const simulated: Nullable<Cell> = path.simulate(move);
        if (!simulated) continue;

        if (grid.isReserved(simulated)) continue;

        if (
          stepsCount < this.pathConsts.minPathLength &&
          grid.isEdge(simulated)
        )
          continue;

        let weight: number = 1;

        if (move === "straight") weight += 2 * (1 / this.pathConsts.turnWeight);

        const lastTurn = this.lastTern(history);
        if (lastTurn === move) {
          continue;
        }

        if (
          history.slice(0, 5).every((m) => m === "straight") &&
          move !== "straight"
        ) {
          weight += 1.5;
        }

        validMoves.push({ move, weight });
      }

      if (validMoves.length === 0) {
        break;
      }

      const totalWeight = validMoves.reduce((sum, m) => sum + m.weight, 0);
      let random = Math.random() * totalWeight;

      let chosenMove: Move = "straight";

      for (const m of validMoves) {
        random -= m.weight;
        if (random <= 0) {
          chosenMove = m.move;
          break;
        }
      }

      current = path.go(chosenMove);
      history.unshift(chosenMove);
      grid.reserve(current);
      stepsCount += 1;
    }

    while (!grid.isEdge(current)) {
      current = path.go("straight");
    }

    const elements: GridPathElement[] = path.getFinalPathSegments();

    return elements
      .map((el: GridPathElement): Nullable<WithId<GridDrawerElement>> => {
        const randomPathElement: PathMapElement = this.getPathElement(
          el.directions,
        );
        const spriteElement: Nullable<WithId<SpritesheetElement>> =
          TilesSpritesheetSet.getElement(randomPathElement.key);
        if (!spriteElement) {
          return null;
        }
        return {
          id: spriteElement.id,
          spritesheetPath: TilesSpritesheetSet.path,
          element: TilesSpritesheetSet.getElement(
            randomPathElement.key,
          ) as SpritesheetElement,
          cell: el.cell,
          index,
        };
      })
      .filter(Boolean) as WithId<GridDrawerElement>[];
  }

  public generatePaths(): GeneratedPathsDrawData {
    const grid: GridSimulator = new GridSimulator(this.consts);
    const pathElements: WithId<GridDrawerElement>[] = [];
    for (let i: number = 0; i < this.pathConsts.pathsCount; i++) {
      const edge: Nullable<{ cell: Cell; direction: Direction }> =
        this.getRandomEdgeTile(grid);
      if (!edge) break;
      grid.reserve(edge.cell);
      pathElements.push(
        ...this.generatePath(grid, edge.cell, edge.direction, 3 + i),
      );
    }
    return {
      report: generateStaticReport(pathElements),
      grid,
      pathElements,
    };
  }
}
