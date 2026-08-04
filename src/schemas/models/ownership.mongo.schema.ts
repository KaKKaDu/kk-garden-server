import { OwnershipSchema } from "@kk-garden/shared/schemas";
import type { Ownership } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const OwnershipMongoSchema = new Schema<Ownership>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, unique: true },
    signatureId: { type: String, required: true, unique: true },
    ownershipProof: { type: String, required: true },
    assignedAt: { type: Date, required: true },
  },
  {
    strict: "throw",
    minimize: false,
  },
);

export const parseOwnership = (payload: unknown): Ownership =>
  OwnershipSchema.parse(payload);
