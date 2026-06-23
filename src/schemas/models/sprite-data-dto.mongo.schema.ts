import type { SpriteDataDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import { AnimatedSpriteDtoMongoSchema } from "./animated-sprite-dto.mongo.schema.js";
import {
  CellMongoSchema,
  CoordinatesMongoSchema,
} from "./common.mongo.schema.js";

export const SpriteDataDtoMongoSchema = new Schema<SpriteDataDto>(
  {
    sprite: { type: AnimatedSpriteDtoMongoSchema, required: true },
    cell: { type: CellMongoSchema, required: true },
    coordinates: { type: CoordinatesMongoSchema, required: false },
  },
  { _id: false, strict: "throw" },
);
