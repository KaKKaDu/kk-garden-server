import {
  isSpritesheetSetKey,
  type Nullable,
  type SpriteData,
  type SpritesheetSetKey,
} from "@kk-garden/shared/types";

export type AnimatedReportElement = Pick<SpriteData, "cell" | "coordinates"> & {
  id: string;
  spriteSetKey: SpritesheetSetKey;
  animation: string[];
  fps: number;
};

export const animatedReportElementsFromSpriteData = (
  sprites: SpriteData[],
): AnimatedReportElement[] => {
  return sprites.map((sprite: SpriteData): AnimatedReportElement => {
    const { cell, coordinates } = sprite;
    return {
      id: sprite.sprite.key,
      spriteSetKey: sprite.sprite.frames.id,
      animation: sprite.sprite.animation,
      fps: sprite.sprite.fps,
      cell,
      coordinates,
    };
  });
};

const getAnimationString = (animation: string[]): string => {
  return animation.join("__");
};

const parseAnimationString = (animationString: string): string[] => {
  return animationString.split("__");
};

const compareAnimatedReportElements = (
  a: AnimatedReportElement,
  b: AnimatedReportElement,
): number => {
  if (a.cell.row !== b.cell.row) {
    return a.cell.row - b.cell.row;
  }

  if (a.cell.column !== b.cell.column) {
    return a.cell.column - b.cell.column;
  }

  const aInnerY: number = a.coordinates?.y ?? 0;
  const bInnerY: number = b.coordinates?.y ?? 0;

  if (aInnerY !== bInnerY) {
    return aInnerY - bInnerY;
  }

  const aInnerX: number = a.coordinates?.x ?? 0;
  const bInnerX: number = b.coordinates?.x ?? 0;

  if (aInnerX !== bInnerX) {
    return aInnerX - bInnerX;
  }

  if (a.spriteSetKey !== b.spriteSetKey) {
    return a.spriteSetKey.localeCompare(b.spriteSetKey);
  }

  if (a.id !== b.id) {
    return a.id.localeCompare(b.id);
  }

  const aAnimationString: string = getAnimationString(a.animation);
  const bAnimationString: string = getAnimationString(b.animation);

  if (aAnimationString !== bAnimationString) {
    return aAnimationString.localeCompare(bAnimationString);
  }

  if (a.fps !== b.fps) {
    return a.fps - b.fps;
  }

  return 0;
};

const generateVisualSignature = (element: AnimatedReportElement): string => {
  return [
    element.cell.column,
    element.cell.row,
    element.coordinates?.x ?? 0,
    element.coordinates?.y ?? 0,
    element.spriteSetKey,
    element.id,
    getAnimationString(element.animation),
    element.fps,
  ].join("|");
};

const parseVisualSignature = (
  signature: string,
): Nullable<AnimatedReportElement> => {
  try {
    const segments: string[] = signature.split("|");
    if (segments.length !== 8) {
      throw new Error("Invalid signature segments");
    }
    const parsedColumn: number = parseInt(segments[0]);
    if (isNaN(parsedColumn)) {
      throw new Error("Column is not a number");
    }
    const parsedRow: number = parseInt(segments[1]);
    if (isNaN(parsedRow)) {
      throw new Error("Row is not a number");
    }
    const parsedInnerX: number = parseInt(segments[2]);
    if (isNaN(parsedInnerX)) {
      throw new Error("Inner X is not a number");
    }
    const parsedInnerY: number = parseInt(segments[3]);
    if (isNaN(parsedInnerY)) {
      throw new Error("Inner Y is not a number");
    }
    const parsedSetKey: string = segments[4];
    if (!isSpritesheetSetKey(parsedSetKey)) {
      throw new Error("Spritesheet set key is not valid");
    }
    const parsedId: string = segments[5];
    const parsedAnimation: string[] = parseAnimationString(segments[6]);
    const parsedFps: number = parseInt(segments[7]);
    if (isNaN(parsedFps)) {
      throw new Error("FPS is not a number");
    }
    return {
      id: parsedId,
      cell: {
        row: parsedRow,
        column: parsedColumn,
      },
      coordinates: {
        x: parsedInnerX,
        y: parsedInnerY,
      },
      spriteSetKey: parsedSetKey as SpritesheetSetKey,
      animation: parsedAnimation,
      fps: parsedFps,
    };
  } catch {
    return null;
  }
};

export const generateAnimatedReport = (
  elements: AnimatedReportElement[],
): string => {
  const copy: AnimatedReportElement[] = [...elements];
  const sorted: AnimatedReportElement[] = copy.sort(
    compareAnimatedReportElements,
  );
  const unique: string[] = [];
  let previousSignature: Nullable<string> = null;

  sorted.forEach((el: AnimatedReportElement): void => {
    const signature: string = generateVisualSignature(el);

    if (signature !== previousSignature) {
      unique.push(signature);
      previousSignature = signature;
    }
  });

  return unique.join("--");
};

export const combineAnimatedReports = (reports: string[]): string => {
  const reportElements: AnimatedReportElement[] = [];
  reports.forEach((report: string): void => {
    const reportParsed: AnimatedReportElement[] = [];
    report.split("--").forEach((signature: string): void => {
      const parsed: Nullable<AnimatedReportElement> =
        parseVisualSignature(signature);
      if (parsed) {
        reportParsed.push(parsed);
      }
    });
    reportElements.push(...reportParsed);
  });
  return generateAnimatedReport(reportElements);
};

export const logAnimatedReport = (report: string): void => {
  // eslint-disable-next-line no-console
  console.log(report.split("--").join("\n"));
};
