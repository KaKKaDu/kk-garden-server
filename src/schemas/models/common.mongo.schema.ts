import type { Cell, Coordinates, SizeMeasures } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const CoordinatesMongoSchema = new Schema<Coordinates>(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false, strict: "throw" },
);

export const SizeMeasuresMongoSchema = new Schema<SizeMeasures>(
  {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false, strict: "throw" },
);

export const CellMongoSchema = new Schema<Cell>(
  {
    row: { type: Number, required: true },
    column: { type: Number, required: true },
  },
  { _id: false, strict: "throw" },
);
