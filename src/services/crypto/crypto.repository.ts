import type { PayloadNormaliser } from "@/services/crypto/types.js";
import type {
  EnvService,
  EnvVariableFormatter,
} from "@/services/env/env.service.js";
import type { Nullable } from "@kk-garden/shared/types";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
  verify,
} from "node:crypto";

const signatureKeyFormatter: EnvVariableFormatter = (
  value: Nullable<string>,
): Nullable<string> => {
  if (!value) {
    return null;
  }
  return value.replace(/\\n/g, "\n");
};

export class CryptoRepository {
  private privateKey: Nullable<KeyObject>;
  private publicKey: Nullable<KeyObject>;

  constructor(private readonly env: EnvService) {}

  private acquirePrivateKey(): Nullable<KeyObject> {
    if (!this.privateKey) {
      const fromEnv: Nullable<string> = this.env.getFormattedEnvValue(
        "SIGNATURE_PRIVATE_KEY",
        signatureKeyFormatter,
      );
      if (!fromEnv) {
        return null;
      }
      this.privateKey = createPrivateKey(fromEnv);
    }
    return this.privateKey;
  }

  private acquirePublicKey(): Nullable<KeyObject> {
    if (!this.publicKey) {
      const fromEnv: Nullable<string> = this.env.getFormattedEnvValue(
        "SIGNATURE_PUBLIC_KEY",
        signatureKeyFormatter,
      );
      if (!fromEnv) {
        return null;
      }
      this.publicKey = createPublicKey(fromEnv);
    }
    return this.publicKey;
  }

  createProofSignature<Payload = unknown>(
    payload: Payload,
    normaliser: PayloadNormaliser<Payload>,
  ): SuccessDataAny<string> {
    try {
      const normalisedPayload: SuccessDataAny<string> = normaliser(payload);
      if (!normalisedPayload.success || !normalisedPayload.data) {
        throw new Error("Failed to normalise payload");
      }

      const privateKey: Nullable<KeyObject> = this.acquirePrivateKey();
      if (!privateKey) {
        throw new Error("Failed to acquire private key");
      }

      const signature: string = sign(
        null,
        Buffer.from(normalisedPayload.data),
        privateKey,
      ).toString("base64");
      return { success: true, data: signature };
    } catch (e: unknown) {
      return handleError<string>(e);
    }
  }

  verifyProofSignature<Payload = unknown>(
    payload: Payload,
    normaliser: PayloadNormaliser<Payload>,
    signature: string,
  ): SuccessDataAny {
    try {
      const normalisedPayload: SuccessDataAny<string> = normaliser(payload);
      if (!normalisedPayload.success || !normalisedPayload.data) {
        throw new Error("Failed to normalise payload");
      }

      const publicKey: Nullable<KeyObject> = this.acquirePublicKey();
      if (!publicKey) {
        throw new Error("Failed to acquire public key");
      }

      const verifySignature: boolean = verify(
        null,
        Buffer.from(normalisedPayload.data),
        publicKey,
        Buffer.from(signature, "base64"),
      );

      if (!verifySignature) {
        throw new Error("Failed to verify signature");
      }

      return { success: true };
    } catch (e: unknown) {
      return handleError(e);
    }
  }
}
