import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, Signature } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import crypto from "node:crypto";
import type { CryptoService } from "@/services/crypto/crypto.service.js";
import type { SignatureRepository } from "@/services/signature/signature.repository.js";
import type {
  CreateSignaturePayload,
  UpdateSignaturePayload,
} from "@/services/signature/types.js";
import type { VisualisationService } from "@/services/visualisation/visualisation.service.js";
import { transactional } from "@/types/mongo.types.js";

export class SignatureService {
  constructor(
    private readonly repository: SignatureRepository,
    private readonly visualisationService: VisualisationService,
    private readonly signatureCryptoService: CryptoService<Signature>,
  ) {}

  getAll = transactional(
    async (
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature[]>> => {
      return this.repository.getAll(session);
    },
  );

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.repository.getById(id, session);
    },
  );

  create = transactional(
    async (
      payload: CreateSignaturePayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.repository.create(payload, session);
    },
  );

  update = transactional(
    async (
      id: string,
      payload: UpdateSignaturePayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.repository.update(id, payload, session);
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.repository.delete(id, session);
    },
  );

  mint = transactional(
    async (
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      try {
        const visualisationResult = await this.visualisationService.getById(
          visualisationId,
          false,
          session,
        );
        if (!visualisationResult.success || !visualisationResult.data) {
          throw new Error(
            `Visualisation with id ${visualisationId} was not found`,
          );
        }

        const verificationResult = await this.visualisationService.verify(
          visualisationId,
          visualisationResult.data.data,
        );
        if (!verificationResult.success) {
          throw new Error("Visualisation verification failed");
        }

        const draftSignature: Signature = {
          _id: crypto.randomUUID(),
          value: crypto.randomUUID(),
          visualisationId,
          signatureProof: "",
          createdAt: new Date(),
        };

        const proofResult: SuccessDataAny<string> =
          this.signatureCryptoService.createProofSignature(draftSignature);
        if (!proofResult.success || !proofResult.data) {
          throw new Error("Failed to create signature proof");
        }

        const payload: CreateSignaturePayload = {
          ...draftSignature,
          signatureProof: proofResult.data,
        };

        return this.create(payload, session);
      } catch (e: unknown) {
        return handleError<Signature>(e);
      }
    },
  );
}
