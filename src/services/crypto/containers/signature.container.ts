import type { PayloadNormaliser } from "@/services/crypto/types.ts";
import type { Signature } from "@kk-garden/shared/types";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { SignatureSchema } from "@kk-garden/shared/schemas";
import { CryptoService } from "@/services/crypto/crypto.service.ts";
import { cryptoRepositorySingleton } from "@/services/crypto/containers/crypto.container.ts";

const signaturePayloadNormaliser: PayloadNormaliser<Signature> = (
  payload: Signature,
): SuccessDataAny<string> => {
  try {
    if (!SignatureSchema.safeParse(payload).success) {
      throw new Error("Invalid payload");
    }
    const normalisedPayload: string = [
      `${payload.value}`,
      `${payload.visualisationId}`,
      `${new Date(payload.createdAt).toISOString()}`,
    ].join("|");

    return {
      success: true,
      data: normalisedPayload,
    };
  } catch (e: unknown) {
    return handleError(e);
  }
};

const signatureCryptoServiceSingleton = new CryptoService<Signature>(
  cryptoRepositorySingleton,
  signaturePayloadNormaliser,
);

export const getSignatureCryptoService = (): CryptoService<Signature> => {
  return signatureCryptoServiceSingleton;
};
