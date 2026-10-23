import {
  GardenShareRequestSchema,
  type GardenShareRequest,
} from "@kk-garden/shared/schemas";
import { Schema } from "mongoose";

export const GardenShareRequestMongoSchema = new Schema<GardenShareRequest>(
  {
    _id: { type: String, required: true },
    requesterId: { type: String, required: true },
    ownerId: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { strict: "throw", minimize: false },
);

GardenShareRequestMongoSchema.index(
  { requesterId: 1, ownerId: 1 },
  { unique: true, name: "garden_share_request_pair_unique" },
);

export const parseGardenShareRequest = (payload: unknown): GardenShareRequest =>
  GardenShareRequestSchema.parse(payload);
