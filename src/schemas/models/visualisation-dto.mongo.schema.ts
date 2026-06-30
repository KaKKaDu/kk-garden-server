import { VisualisationDtoSchema } from "@kk-garden/shared/schemas";
import type { VisualisationDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import { GardenDrawDataDtoMongoSchema } from "@/schemas/index.js";

export const VisualisationDtoMongoSchema = new Schema<VisualisationDto>(
  {
    data: { type: GardenDrawDataDtoMongoSchema, required: true },
    createdAt: { type: Date, required: true },
  },
  {
    strict: "throw",
    minimize: false,
  },
);

export const parseVisualisationDto = (payload: unknown): VisualisationDto =>
  VisualisationDtoSchema.parse(payload);
