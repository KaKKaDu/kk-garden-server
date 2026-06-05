import {
  type Cell,
  directions,
  type GridPathElement,
  type Move,
  type Nullable,
} from "@kk-garden/shared/types";

type PathSimulatorMapKey = `${number}|${number}`;

type Direction = "top" | "bottom" | "left" | "right";

type PathSimulatorMap = Map<PathSimulatorMapKey, PathSegment>;

const exhaustiveCheck = (data: never): never => {
  throw new Error(`Exhaust failed: ${data}`);
};

class PathSegment {
  private left: Nullable<PathSegment>;
  private right: Nullable<PathSegment>;
  private top: Nullable<PathSegment>;
  private bottom: Nullable<PathSegment>;

  constructor(
    left: Nullable<PathSegment> = null,
    right: Nullable<PathSegment> = null,
    top: Nullable<PathSegment> = null,
    bottom: Nullable<PathSegment> = null,
  ) {
    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;
  }

  public setSurrounding(direction: Direction, segment: PathSegment): void {
    switch (direction) {
      case "top":
        this.top = segment;
        break;
      case "bottom":
        this.bottom = segment;
        break;
      case "left":
        this.left = segment;
        break;
      case "right":
        this.right = segment;
        break;
      default:
        exhaustiveCheck(direction);
    }
  }

  public removeSurrounding(direction: Direction): void {
    switch (direction) {
      case "top":
        this.top = null;
        break;
      case "bottom":
        this.bottom = null;
        break;
      case "left":
        this.left = null;
        break;
      case "right":
        this.right = null;
        break;
      default:
        exhaustiveCheck(direction);
    }
  }

  get directions(): Direction[] {
    return [
      this.left ? "left" : null,
      this.right ? "right" : null,
      this.top ? "top" : null,
      this.bottom ? "bottom" : null,
    ].filter(Boolean) as Direction[];
  }
}

class ExitPathSegment extends PathSegment {
  public readonly exit = true as const;

  constructor() {
    super();
  }
}

const rotationMap = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
} as const satisfies Record<Direction, number>;

export class PathSimulator {
  private path: PathSimulatorMap = new Map<`${number}|${number}`, PathSegment>(
    [],
  );
  private current: Cell;
  private rotation: number;
  private readonly index: number;

  private getMapKey = (cell: Cell): PathSimulatorMapKey => {
    return `${cell.row}|${cell.column}`;
  };

  private parseMapKey = (key: PathSimulatorMapKey): Cell => {
    const [row, column] = key.split("|").map(Number);
    return { row, column };
  };

  private getDirectionFromMove = (move: Move): Direction => {
    switch (move) {
      case "straight":
        return "top";
      case "back":
        return "bottom";
      default:
        return move;
    }
  };

  private getDirectionFromRotation = (rotation: number): Direction => {
    const degrees: number = rotation % 360;
    const index: number = Math.floor(degrees / 90) * 90;
    return Object.entries(rotationMap).find(
      ([, value]) => value === index,
    )?.[0] as Direction;
  };

  constructor(startCell: Cell, startRotation: Direction, pathIndex: number) {
    this.current = startCell;
    this.rotation = rotationMap[startRotation] || rotationMap.top;
    this.index = pathIndex;
    const exitDirection: Direction = this.getDirectionFromRotation(
      rotationMap[startRotation] + 180,
    );
    const firstSegment = new PathSegment();
    firstSegment.setSurrounding(exitDirection, new ExitPathSegment());
    this.path.set(this.getMapKey(startCell), firstSegment);
  }

  private getNextCell = (cell: Cell, direction: Direction): Cell => {
    switch (direction) {
      case "top":
        return {
          ...cell,
          row: cell.row - 1,
        };
      case "bottom":
        return {
          ...cell,
          row: cell.row + 1,
        };
      case "left":
        return {
          ...cell,
          column: cell.column - 1,
        };
      case "right":
        return {
          ...cell,
          column: cell.column + 1,
        };
      default:
        exhaustiveCheck(direction);
        break;
    }
    return cell;
  };

  private getPathSurroundings = (
    cell: Cell,
  ): Record<Direction, Nullable<PathSegment>> => {
    const getSurrounding = (
      cell: Cell,
      direction: Direction,
    ): Nullable<PathSegment> => {
      return this.path.get(this.getMapKey(this.getNextCell(cell, direction)));
    };
    return [...directions].reduce(
      (prev: Record<Direction, Nullable<PathSegment>>, curr) => ({
        ...prev,
        [curr]: getSurrounding(cell, curr),
      }),
      {} as Record<Direction, Nullable<PathSegment>>,
    );
  };

  private setNewPath = (cell: Cell): void => {
    const surroundings: Record<
      Direction,
      Nullable<PathSegment>
    > = this.getPathSurroundings(cell);
    const newPath = new PathSegment(
      surroundings.left,
      surroundings.right,
      surroundings.top,
      surroundings.bottom,
    );
    this.path.set(this.getMapKey(cell), newPath);

    Object.entries(surroundings).forEach(([direction, segment]): void => {
      if (segment) {
        segment.setSurrounding(
          this.getDirectionFromRotation(
            rotationMap[direction as Direction] + 180,
          ),
          newPath,
        );
      }
    });
  };

  private deletePath = (cell: Cell): void => {
    const surroundings: Record<
      Direction,
      Nullable<PathSegment>
    > = this.getPathSurroundings(cell);
    this.path.delete(this.getMapKey(cell));
    Object.entries(surroundings).forEach(([direction, segment]): void => {
      if (segment) {
        segment.removeSurrounding(
          this.getDirectionFromRotation(
            rotationMap[direction as Direction] + 180,
          ),
        );
      }
    });
  };

  public go(move: Move): Cell {
    const handleDirection: Direction = this.getDirectionFromMove(move);
    const degree: number = this.rotation + rotationMap[handleDirection];
    const newDirection: Direction = this.getDirectionFromRotation(degree);
    const nextCell: Cell = this.getNextCell(this.current, newDirection);
    if (move === "back") {
      this.deletePath(this.current);
    } else {
      this.setNewPath(nextCell);
    }
    this.current = { ...nextCell };
    this.rotation = degree % 360;
    return nextCell;
  }

  public getFinalPathSegments(): GridPathElement[] {
    return Array.from(this.path.entries())
      .map(
        ([key, segment]: [
          PathSimulatorMapKey,
          PathSegment,
        ]): Nullable<GridPathElement> => {
          if (segment instanceof ExitPathSegment) {
            return null;
          }
          return {
            cell: this.parseMapKey(key),
            directions: segment.directions,
            index: this.index,
          };
        },
      )
      .filter(Boolean) as GridPathElement[];
  }

  public simulate(move: Move): Nullable<Cell> {
    const current = this.current;

    let tempRotation = this.rotation;

    if (move === "left") tempRotation += rotationMap["left"];

    if (move === "right") tempRotation += rotationMap["right"];

    const direction: Direction = this.getDirectionFromRotation(tempRotation);

    return this.getNextCell(current, direction);
  }
}
