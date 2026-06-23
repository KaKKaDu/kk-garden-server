import type { GridDrawerElement, WithId } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import {
  CellMongoSchema,
  CoordinatesMongoSchema,
  SizeMeasuresMongoSchema,
} from "./common.mongo.schema.js";
import { SpritesheetElementMongoSchema } from "./spritesheet-element.mongo.schema.js";
import { SpritesheetPathMongoField } from "./spritesheet-path.mongo.schema.js";

export const GridDrawerElementMongoSchema = new Schema<GridDrawerElement>(
  {
    spritesheetPath: { ...SpritesheetPathMongoField, required: true },
    element: { type: SpritesheetElementMongoSchema, required: true },
    cell: { type: CellMongoSchema, required: true },
    innerCoordinates: { type: CoordinatesMongoSchema, required: false },
    sizes: { type: SizeMeasuresMongoSchema, required: false },
    index: { type: Number, required: true },
  },
  { _id: false, strict: "throw" },
);

export const GridDrawerElementWithIdMongoSchema = new Schema<
  WithId<GridDrawerElement>
>(
  {
    id: { type: String, required: true },
    spritesheetPath: { ...SpritesheetPathMongoField, required: true },
    element: { type: SpritesheetElementMongoSchema, required: true },
    cell: { type: CellMongoSchema, required: true },
    innerCoordinates: { type: CoordinatesMongoSchema, required: false },
    sizes: { type: SizeMeasuresMongoSchema, required: false },
    index: { type: Number, required: true },
  },
  { _id: false, strict: "throw" },
);
