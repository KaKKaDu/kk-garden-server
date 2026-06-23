import { GardenDrawDataDtoSchema } from "@kk-garden/shared/schemas";
import type { GardenDrawDataDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import { GridDrawerElementWithIdMongoSchema } from "./grid-drawer-element.mongo.schema.js";
import { SpriteDataDtoMongoSchema } from "./sprite-data-dto.mongo.schema.js";
import { SpritesheetSetDtoMongoSchema } from "./spritesheet-set-dto.mongo.schema.js";

type GardenDrawDataStaticDto = GardenDrawDataDto["staticData"];
type GardenDrawDataAnimatedDto = GardenDrawDataDto["animatedData"];

const GardenDrawDataStaticMongoSchema = new Schema<GardenDrawDataStaticDto>(
  {
    tiles: { type: [GridDrawerElementWithIdMongoSchema], required: true },
    stones: { type: [GridDrawerElementWithIdMongoSchema], required: true },
  },
  { _id: false, strict: "throw" },
);

const GardenDrawDataAnimatedMongoSchema = new Schema<GardenDrawDataAnimatedDto>(
  {
    spritesheetSets: {
      type: Map,
      of: SpritesheetSetDtoMongoSchema,
      required: true,
    },
    trees: { type: [SpriteDataDtoMongoSchema], required: true },
    bushes: { type: [SpriteDataDtoMongoSchema], required: true },
  },
  { _id: false, strict: "throw" },
);

export const GardenDrawDataDtoMongoSchema = new Schema<GardenDrawDataDto>(
  {
    staticData: { type: GardenDrawDataStaticMongoSchema, required: true },
    animatedData: { type: GardenDrawDataAnimatedMongoSchema, required: true },
  },
  {
    strict: "throw",
    minimize: false,
  },
);

export const parseGardenDrawDataDto = (payload: unknown): GardenDrawDataDto =>
  GardenDrawDataDtoSchema.parse(payload);
