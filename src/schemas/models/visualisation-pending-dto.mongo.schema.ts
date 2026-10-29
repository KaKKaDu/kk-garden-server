import { VisualisationPendingDtoSchema } from "@kk-garden/shared/schemas";
import type { VisualisationPendingDto } from "@kk-garden/shared/types";
import { Schema } from "mongoose";
import { GardenDrawDataDtoMongoSchema } from "@/schemas/index.ts";

export const VisualisationPendingDtoMongoSchema =
  new Schema<VisualisationPendingDto>(
    {
      _id: { type: String, required: true },
      pendingId: { type: String, required: true },
      ownerId: { type: String, required: true },
      data: { type: GardenDrawDataDtoMongoSchema, required: true },
      createdAt: { type: Date, required: true },
    },
    {
      strict: "throw",
      minimize: false,
    },
  );

VisualisationPendingDtoMongoSchema.index({ ownerId: 1, pendingId: 1 });
VisualisationPendingDtoMongoSchema.index(
  { createdAt: 1 },
  {
    name: "visualisations_pending_created_at_ttl_72h",
    expireAfterSeconds: 259200,
  },
);

export const parseVisualisationPendingDto = (
  payload: unknown,
): VisualisationPendingDto => VisualisationPendingDtoSchema.parse(payload);
