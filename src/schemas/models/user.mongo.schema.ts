import { UserSchema } from "@kk-garden/shared/schemas";
import { userRoles, userStatuses } from "@kk-garden/shared/types";
import type { User } from "@kk-garden/shared/types";
import { Schema } from "mongoose";

export const UserMongoSchema = new Schema<User>(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true },
    authId: { type: String, required: true },
    role: { type: String, enum: userRoles, required: true },
    status: { type: String, enum: userStatuses, required: true },
  },
  {
    strict: "throw",
    minimize: false,
  },
);

export const parseUser = (payload: unknown): User => UserSchema.parse(payload);
