import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { PayloadNormaliser } from "@/services/crypto/types.js";
import type { CryptoRepository } from "@/services/crypto/crypto.repository.js";

export class CryptoService<Payload> {
  constructor(
    private readonly repo: CryptoRepository,
    private readonly normaliser: PayloadNormaliser<Payload>,
  ) {}

  public createProofSignature(payload: Payload): SuccessDataAny<string> {
    return this.repo.createProofSignature(payload, this.normaliser);
  }

  public verifyProofSignature(
    payload: Payload,
    signature: string,
  ): SuccessDataAny {
    return this.repo.verifyProofSignature(payload, this.normaliser, signature);
  }
}
