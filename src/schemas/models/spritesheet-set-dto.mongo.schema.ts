import type { SpritesheetSetDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import { SpritesheetElementMongoSchema } from "./spritesheet-element.mongo.schema.ts";
import { SpritesheetPathMongoField } from "./spritesheet-path.mongo.schema.ts";

export const SpritesheetSetDtoMongoSchema = new Schema<SpritesheetSetDto>(
  {
    key: { type: String, required: true },
    path: { ...SpritesheetPathMongoField, required: true },
    map: {
      type: Map,
      of: SpritesheetElementMongoSchema,
      required: true,
    },
  },
  { _id: false, strict: "throw" },
);
