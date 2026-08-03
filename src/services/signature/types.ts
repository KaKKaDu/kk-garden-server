import type { Signature } from "@kk-garden/shared/types";

export type CreateSignaturePayload = Signature;
export type UpdateSignaturePayload = Partial<Omit<Signature, "_id">>;

export type DocumentLike = {
  toObject: (options?: { flattenMaps?: boolean }) => unknown;
};
