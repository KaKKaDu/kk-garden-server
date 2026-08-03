import { SignatureSchema } from "@kk-garden/shared/schemas";
import type { Signature } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const SignatureMongoSchema = new Schema<Signature>(
  {
    _id: { type: String, required: true },
    value: { type: String, required: true, unique: true },
    visualisationId: { type: String, required: true },
    signatureProof: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  {
    strict: "throw",
    minimize: false,
  },
);

export const parseSignature = (payload: unknown): Signature =>
  SignatureSchema.parse(payload);
