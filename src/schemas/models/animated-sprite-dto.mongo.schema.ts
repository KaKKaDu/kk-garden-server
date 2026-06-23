import type { AnimatedSpriteDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const AnimatedSpriteDtoMongoSchema = new Schema<AnimatedSpriteDto>(
  {
    key: { type: String, required: true },
    fps: { type: Number, required: true },
    animation: { type: [String], required: true },
    framesReference: { type: String, required: true },
  },
  { _id: false, strict: "throw" },
);
