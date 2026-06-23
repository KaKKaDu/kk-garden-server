import { assetsMapKeys } from "@kk-garden/shared/assets";
import type { SpritesheetPath } from "@kk-garden/shared/types";
import type { SchemaTypeOptions } from "mongoose";

export const SpritesheetPathMongoField: SchemaTypeOptions<SpritesheetPath> = {
  type: String,
  enum: [...assetsMapKeys],
  required: true,
};
