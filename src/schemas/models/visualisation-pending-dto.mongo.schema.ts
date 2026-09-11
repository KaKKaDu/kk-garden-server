import { VisualisationPendingDtoSchema } from "@kk-garden/shared/schemas";
import type { VisualisationPendingDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import { GardenDrawDataDtoMongoSchema } from "@/schemas/index.js";

export const VisualisationPendingDtoMongoSchema =
  new Schema<VisualisationPendingDto>(
    {
      _id: { type: String, required: true },
      pendingId: { type: String, required: true },
      data: { type: GardenDrawDataDtoMongoSchema, required: true },
      createdAt: { type: Date, required: true },
    },
    {
      strict: "throw",
      minimize: false,
    },
  );

export const parseVisualisationPendingDto = (
  payload: unknown,
): VisualisationPendingDto => VisualisationPendingDtoSchema.parse(payload);
