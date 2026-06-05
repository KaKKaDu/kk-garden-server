import type {
  GridDrawerElement,
  Nullable,
  WithId,
} from "@kk-garden/shared/types";
import { isSpritesheetAssetKey } from "@kk-garden/shared/assets";

export type StaticReportElement = WithId<Omit<GridDrawerElement, "element">>;

const compareStaticReportElements = (
  a: StaticReportElement,
  b: StaticReportElement,
): number => {
  if (a.index !== b.index) {
    return a.index - b.index;
  }

  if (a.cell.row !== b.cell.row) {
    return a.cell.row - b.cell.row;
  }

  if (a.cell.column !== b.cell.column) {
    return a.cell.column - b.cell.column;
  }

  const aInnerY = a.innerCoordinates?.y ?? 0;
  const bInnerY = b.innerCoordinates?.y ?? 0;

  if (aInnerY !== bInnerY) {
    return aInnerY - bInnerY;
  }

  const aInnerX = a.innerCoordinates?.x ?? 0;
  const bInnerX = b.innerCoordinates?.x ?? 0;

  if (aInnerX !== bInnerX) {
    return aInnerX - bInnerX;
  }

  if (a.spritesheetPath !== b.spritesheetPath) {
    return a.spritesheetPath.localeCompare(b.spritesheetPath);
  }

  if (a.id !== b.id) {
    return a.id.localeCompare(b.id);
  }

  const aWidth = a.sizes?.width ?? 0;
  const bWidth = b.sizes?.width ?? 0;

  if (aWidth !== bWidth) {
    return aWidth - bWidth;
  }

  const aHeight = a.sizes?.height ?? 0;
  const bHeight = b.sizes?.height ?? 0;

  if (aHeight !== bHeight) {
    return aHeight - bHeight;
  }

  return 0;
};

const generateVisualSignature = (element: StaticReportElement): string => {
  return [
    element.index,
    element.cell.row,
    element.cell.column,
    element.innerCoordinates?.x ?? 0,
    element.innerCoordinates?.y ?? 0,
    element.sizes?.width ?? 0,
    element.sizes?.height ?? 0,
    element.spritesheetPath,
    element.id,
  ].join("|");
};

const parseVisualSignature = (
  signature: string,
): Nullable<StaticReportElement> => {
  try {
    const segments: string[] = signature.split("|");
    if (segments.length !== 9) {
      throw new Error("Invalid signature segments");
    }
    const parsedIndex: number = parseInt(segments[0]);
    if (isNaN(parsedIndex)) {
      throw new Error("Index is not a number");
    }
    const parsedRow: number = parseInt(segments[1]);
    if (isNaN(parsedRow)) {
      throw new Error("Row is not a number");
    }
    const parsedColumn: number = parseInt(segments[2]);
    if (isNaN(parsedColumn)) {
      throw new Error("Column is not a number");
    }
    const parsedInnerX: number = parseInt(segments[3]);
    if (isNaN(parsedInnerX)) {
      throw new Error("Inner X is not a number");
    }
    const parsedInnerY: number = parseInt(segments[4]);
    if (isNaN(parsedInnerY)) {
      throw new Error("Inner Y is not a number");
    }
    const parsedWidth: number = parseInt(segments[5]);
    if (isNaN(parsedWidth)) {
      throw new Error("Width is not a number");
    }
    const parsedHeight: number = parseInt(segments[6]);
    if (isNaN(parsedHeight)) {
      throw new Error("Height is not a number");
    }
    const parsedPath: string = segments[7];
    if (!isSpritesheetAssetKey(parsedPath)) {
      throw new Error("Spritesheet path is not a valid spritesheet asset key");
    }
    const parsedId: string = segments[8];
    return {
      index: parsedIndex,
      cell: {
        row: parsedRow,
        column: parsedColumn,
      },
      innerCoordinates: {
        x: parsedInnerX,
        y: parsedInnerY,
      },
      sizes: {
        width: parsedWidth,
        height: parsedHeight,
      },
      spritesheetPath: parsedPath,
      id: parsedId,
    };
  } catch {
    return null;
  }
};

export const generateStaticReport = (
  elements: StaticReportElement[],
): string => {
  const copy: StaticReportElement[] = [...elements];
  const sorted: StaticReportElement[] = copy.sort(compareStaticReportElements);
  const unique: string[] = [];
  let previousSignature: Nullable<string> = null;

  sorted.forEach((el: StaticReportElement): void => {
    const signature: string = generateVisualSignature(el);

    if (signature !== previousSignature) {
      unique.push(signature);
      previousSignature = signature;
    }
  });

  return unique.join("--");
};

export const combineStaticReports = (reports: string[]): string => {
  const reportElements: StaticReportElement[] = [];
  reports.forEach((report: string): void => {
    const reportParsed: StaticReportElement[] = [];
    report.split("--").forEach((signature: string): void => {
      const parsed: Nullable<StaticReportElement> =
        parseVisualSignature(signature);
      if (parsed) {
        reportParsed.push(parsed);
      }
    });
    reportElements.push(...reportParsed);
  });

  return generateStaticReport(reportElements);
};

export const logStaticReport = (report: string): void => {
  // eslint-disable-next-line no-console
  console.log(report.split("--").join("\n"));
};
