import type { GridConstants } from "@kk-garden/shared/constants";
import type { Cell, Direction, Nullable } from "@kk-garden/shared/types";

type GridConfig = {
  constants: GridConstants;
  reserved: (Cell & { index: number })[];
  layerIndex: number;
};

export class GridSimulator {
  private readonly consts: GridConstants;
  private grid: number[][] = [];
  private layerIndex: number = 1;

  private init(extend?: GridSimulator) {
    this.grid = Array.from({ length: this.consts.rows }, () =>
      Array(this.consts.columns).fill(0),
    );
    if (extend) {
      const { constants, reserved } = extend.config;
      reserved.forEach((cell: Cell & { index: number }) => {
        let row: number = Math.floor(
          (constants.cellSize * cell.row) / this.consts.cellSize,
        );
        let column: number = Math.floor(
          (constants.cellSize * cell.column) / this.consts.cellSize,
        );
        if (row >= this.consts.rows) {
          row = this.consts.rows - 1;
        }
        if (column >= this.consts.columns) {
          column = this.consts.columns - 1;
        }
        this.reserve({ row, column }, cell.index);
      });
      this.layerIndex = extend.layerIndex + 1;
    }
  }

  constructor(constants: GridConstants, extend?: GridSimulator) {
    this.consts = constants;
    this.init(extend);
  }

  public reserve(cell: Cell, index?: number): void {
    const { row, column } = cell;
    if (this.grid?.[row]?.[column] !== undefined) {
      this.grid[row][column] = index || this.layerIndex;
    }
  }

  public clear(cell: Cell): void {
    const { row, column } = cell;
    if (this.grid?.[row]?.[column] !== undefined) {
      this.grid[row][column] = 0;
    }
  }

  public isFree(cell: Cell): boolean {
    const { row, column } = cell;
    if (this.grid?.[row]?.[column] !== undefined) {
      return this.grid[row][column] === 0;
    }
    return false;
  }

  public isReserved(cell: Cell): boolean {
    const { row, column } = cell;
    if (this.grid?.[row]?.[column] !== undefined) {
      return this.grid[row][column] === this.layerIndex;
    }
    return false;
  }

  public isEdge(cell: Cell): boolean {
    const { row, column } = cell;
    return (
      row === 0 ||
      row === this.consts.rows - 1 ||
      column === 0 ||
      column === this.consts.columns - 1
    );
  }

  public edgesAround(cell: Cell): Direction[] {
    const dirs: Direction[] = [];
    if (this.isEdge({ row: cell.row - 1, column: cell.column })) {
      dirs.push("top");
    }
    if (this.isEdge({ row: cell.row + 1, column: cell.column })) {
      dirs.push("bottom");
    }
    if (this.isEdge({ row: cell.row, column: cell.column - 1 })) {
      dirs.push("left");
    }
    if (this.isEdge({ row: cell.row, column: cell.column + 1 })) {
      dirs.push("right");
    }
    return dirs;
  }

  public countReservedNeighbours(cell: Cell): number {
    let count: number = 0;
    const top: number[] =
      this.grid[Math.max(cell.row - 1, 0)]?.slice(
        Math.max(cell.column - 1, 0),
        cell.column + 2,
      ) || [];
    top.forEach((cell: number) => {
      if (cell === this.layerIndex) {
        count++;
      }
    });
    const bottom: number[] =
      this.grid[Math.min(cell.row + 1, this.consts.rows - 1)]?.slice(
        Math.max(cell.column - 1, 0),
        cell.column + 2,
      ) || [];
    bottom.forEach((cell: number) => {
      if (cell === this.layerIndex) {
        count++;
      }
    });
    const left: number =
      this.grid[cell.row]?.[Math.max(cell.column - 1, 0)] || 0;
    const right: number =
      this.grid[cell.row]?.[
        Math.min(cell.column + 1, this.consts.columns - 1)
      ] || 0;
    if (left === this.layerIndex) {
      count++;
    }
    if (right === this.layerIndex) {
      count++;
    }
    return count;
  }

  public isOut(cell: Cell): boolean {
    const { row, column } = cell;
    return this.grid[row]?.[column] === undefined;
  }

  private get config(): GridConfig {
    const reserved: (Cell & { index: number })[] = [];
    for (let i: number = 0; i < this.grid.length; i++) {
      for (let j: number = 0; j < (this.grid[i]?.length || 0); j++) {
        const cellIndex: Nullable<number> = this.grid[i]?.[j];
        if (cellIndex !== undefined && cellIndex > 0) {
          reserved.push({ row: i, column: j, index: cellIndex });
        }
      }
    }
    return {
      constants: this.consts,
      reserved,
      layerIndex: this.layerIndex,
    };
  }

  public logGrid(): void {
    const stringedGrid: string = this.grid
      .map((row: number[]) => row.join(" "))
      .join("\n");
    // eslint-disable-next-line no-console
    console.log(stringedGrid);
  }

  public getFreeCells(): Cell[] {
    const cells: Cell[] = [];
    for (let i: number = 0; i < this.grid.length; i++) {
      for (let j: number = 0; j < (this.grid[i]?.length || 0); j++) {
        const cell: Cell = { row: i, column: j };
        if (this.isFree(cell)) {
          cells.push(cell);
        }
      }
    }
    return cells;
  }
}
