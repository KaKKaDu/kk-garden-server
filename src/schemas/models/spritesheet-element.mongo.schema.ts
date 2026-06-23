import type { SpritesheetElement } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const SpritesheetElementMongoSchema = new Schema<SpritesheetElement>(
  {
    density: { type: Number, required: false },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false, strict: "throw" },
);
