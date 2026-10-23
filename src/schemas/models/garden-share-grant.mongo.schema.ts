import {
  GardenShareGrantSchema,
  type GardenShareGrant,
} from "@kk-garden/shared/schemas";
import { Schema } from "mongoose";

export const GardenShareGrantMongoSchema = new Schema<GardenShareGrant>(
  {
    _id: { type: String, required: true },
    viewerId: { type: String, required: true },
    ownerId: { type: String, required: true },
    grantedAt: { type: Date, required: true },
  },
  { strict: "throw", minimize: false },
);

GardenShareGrantMongoSchema.index(
  { viewerId: 1, ownerId: 1 },
  { unique: true, name: "garden_share_grant_pair_unique" },
);

export const parseGardenShareGrant = (payload: unknown): GardenShareGrant =>
  GardenShareGrantSchema.parse(payload);
