import type { User } from "@kk-garden/shared/types";

export type CreateUserPayload = Omit<User, "_id" | "authId"> & {
  authId?: string;
};

export type UpdateUserPayload = Partial<Omit<User, "_id">>;

export type DocumentLike = {
  toObject: (options?: { flattenMaps?: boolean }) => unknown;
};
