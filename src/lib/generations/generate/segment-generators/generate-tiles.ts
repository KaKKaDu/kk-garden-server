import type { GridConstants } from "@kk-garden/shared/constants";
import type {
  GridDrawerElement,
  Nullable,
  SpritesheetElement,
  SpritesheetPath,
  StaticDrawReport,
  WithId,
} from "@kk-garden/shared/types";
import { TilesSpritesheetSet } from "@kk-garden/shared/sets";
import { generateStaticReport } from "@lib/generations/reports/static-report.ts";

export class TilesLayerGenerator {
  private constants: GridConstants;

  constructor(consts: GridConstants) {
    this.constants = consts;
  }

  public generateTiles = (): StaticDrawReport => {
    const tiles: WithId<GridDrawerElement>[] = [];
    const grassTile: Nullable<WithId<SpritesheetElement>> =
      TilesSpritesheetSet.getElement("grass-full-tile");
    const grassTilePath: SpritesheetPath = TilesSpritesheetSet.path;
    if (grassTile) {
      for (let row = 0; row < this.constants.rows; row++) {
        for (let column = 0; column < this.constants.columns; column++) {
          tiles.push({
            id: grassTile.id,
            spritesheetPath: grassTilePath,
            element: grassTile,
            cell: { row, column },
            index: 1,
          });
        }
      }
    }
    return {
      report: generateStaticReport(tiles),
      elements: tiles,
    };
  };
}
