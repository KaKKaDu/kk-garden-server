import type { PayloadNormaliser } from "@/services/crypto/types.js";
import type { Ownership } from "@kk-garden/shared/types";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { OwnershipSchema } from "@kk-garden/shared/schemas";
import { cryptoRepositorySingleton } from "@/services/crypto/containers/crypto.container.js";
import { CryptoService } from "@/services/crypto/crypto.service.js";

const ownershipPayloadNormaliser: PayloadNormaliser<Ownership> = (
  payload: Ownership,
): SuccessDataAny<string> => {
  try {
    if (!OwnershipSchema.safeParse(payload).success) {
      throw new Error("Invalid payload");
    }
    const normalisedPayload: string = [
      `${payload.userId}`,
      `${payload.signatureId}`,
      `${new Date(payload.assignedAt).toISOString()}`,
    ].join("|");

    return {
      success: true,
      data: normalisedPayload,
    };
  } catch (e: unknown) {
    return handleError(e);
  }
};

const ownershipCryptoServiceSingleton = new CryptoService<Ownership>(
  cryptoRepositorySingleton,
  ownershipPayloadNormaliser,
);

export const getOwnershipCryptoService = (): CryptoService<Ownership> => {
  return ownershipCryptoServiceSingleton;
};
