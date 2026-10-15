import { UserSchema } from "@kk-garden/shared/schemas";
import type { User } from "@kk-garden/shared/types";

export const parseUser = (payload: unknown): User => UserSchema.parse(payload);
