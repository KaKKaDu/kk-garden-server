import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, Signature } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import crypto from "node:crypto";
import type { CryptoService } from "@/services/crypto/crypto.service.js";
import type { SignatureRepository } from "@/services/crud/signature/signature.repository.js";
import type { CreateSignaturePayload } from "@/services/crud/signature/types.js";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.js";
import { transactional } from "@/types/mongo.types.js";
import { ulid } from "ulid";

export class SignatureService {
  constructor(
    private readonly repository: SignatureRepository,
    private readonly visualisationService: VisualisationService,
    private readonly signatureCryptoService: CryptoService<Signature>,
  ) {}

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.repository.getById(id, session);
    },
  );

  getByVisualisationId = transactional(
    async (
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.repository.getByVisualisationId(visualisationId, session);
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
        const sameSignatureResult = await this.getByVisualisationId(
          visualisationId,
          session,
        );
        if (sameSignatureResult.success) {
          throw new Error(
            `Signature for visualisationId ${visualisationId} already exists`,
          );
        }

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
          value: ulid(),
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
