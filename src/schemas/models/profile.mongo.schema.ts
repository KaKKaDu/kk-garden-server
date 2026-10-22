import { ProfileSchema } from "@kk-garden/shared/schemas";
import type { Profile } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const ProfileMongoSchema = new Schema<Profile>(
  {
    _id: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    bio: { type: String, required: false, trim: true },
    accentHex: {
      type: String,
      required: false,
      match: /^#[\da-f]{6}$/,
    },
    avatarObjectKey: { type: String, required: false, minlength: 1 },
    lookupCode: {
      type: String,
      required: false,
      match: /^[A-HJKMNP-Z2-9]{16}$/,
    },
  },
  {
    strict: "throw",
    minimize: false,
    versionKey: false,
  },
);

export const parseProfile = (payload: unknown): Profile =>
  ProfileSchema.parse(payload);
