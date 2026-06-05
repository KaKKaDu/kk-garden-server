import type { GridConstants } from "@kk-garden/shared/constants";
import type {
  Cell,
  Coordinates,
  Nullable,
  SizeMeasures,
} from "@kk-garden/shared/types";

type TileElement = 1 | 0;
type TileRow = TileElement[];
type Tile = TileRow[];

export class TileSimulator {
  private constants: GridConstants;
  private tile: Tile = [];
  private prefix: number[][] = [];
  private readonly padding: number = 2;

  private initTile = (): void => {
    for (let row: number = 0; row < this.constants.cellSize; row++) {
      if (row === 0 || row === this.constants.cellSize - 1) {
        this.tile.push(Array(this.constants.cellSize).fill(0));
      } else {
        const newRow: TileRow = [
          0,
          ...Array(this.constants.cellSize - 1).fill(1),
          0,
        ];
        this.tile.push(newRow);
      }
    }
  };

  private computePrefix(): void {
    const rows: number = this.constants.cellSize;
    const cols: number = this.constants.cellSize;

    const prefix: number[][] = Array.from({ length: rows }, (): number[] =>
      Array(cols).fill(0),
    );

    for (let r: number = 0; r < rows; r++) {
      for (let c: number = 0; c < cols; c++) {
        const current: TileElement = this.tile[r][c] || 0;

        const top: number = r > 0 ? prefix[r - 1][c] : 0;
        const left: number = c > 0 ? prefix[r][c - 1] : 0;
        const corner: number = r > 0 && c > 0 ? prefix[r - 1][c - 1] : 0;

        prefix[r][c] = current + top + left - corner;
      }
    }

    this.prefix = prefix;
  }

  constructor(consts: GridConstants, padding: number = 2) {
    this.constants = consts;
    this.initTile();
    this.computePrefix();
    this.padding = padding;
  }

  private isFree(cell: Cell, size: SizeMeasures): boolean {
    const { row: r, column: c } = cell;
    const { width, height } = size;
    const rSafe: number = r - this.padding;
    const cSafe: number = c - this.padding;

    const widthSafe: number = width + this.padding * 2;
    const heightSafe: number = height + this.padding * 2;

    const r2 = rSafe + heightSafe - 1;
    const c2 = cSafe + widthSafe - 1;

    if (
      rSafe < 0 ||
      cSafe < 0 ||
      r2 >= this.constants.cellSize ||
      c2 >= this.constants.cellSize
    ) {
      return false;
    }

    const total =
      this.prefix[r2][c2] -
      (rSafe > 0 ? this.prefix[rSafe - 1][c2] : 0) -
      (cSafe > 0 ? this.prefix[r2][cSafe - 1] : 0) +
      (rSafe > 0 && cSafe > 0 ? this.prefix[rSafe - 1][cSafe - 1] : 0);

    return total === widthSafe * heightSafe;
  }

  private findAllFits(size: SizeMeasures): Cell[] {
    const { width, height } = size;
    const result: Cell[] = [];

    for (let r: number = 0; r <= this.constants.cellSize - height; r++) {
      for (let c: number = 0; c <= this.constants.cellSize - width; c++) {
        const isFree: boolean = this.isFree(
          {
            row: r,
            column: c,
          },
          size,
        );
        if (isFree) {
          result.push({ row: r, column: c });
        }
      }
    }

    return result;
  }

  private reserveRectangle(cell: Cell, size: SizeMeasures): void {
    const { row: r, column: c } = cell;
    const { width, height } = size;

    for (let i: number = 0; i < height; i++) {
      for (let j: number = 0; j < width; j++) {
        this.tile[r + i][c + j] = 0;
      }
    }
    this.computePrefix();
  }

  public placeFigure(size: SizeMeasures): Nullable<Coordinates> {
    const fits: Cell[] = this.findAllFits(size);
    if (fits.length <= 0) {
      return null;
    }

    const randomFit: Cell = fits[Math.floor(Math.random() * fits.length)];
    this.reserveRectangle(randomFit, size);
    return {
      x: randomFit.column,
      y: randomFit.row,
    };
  }
}
