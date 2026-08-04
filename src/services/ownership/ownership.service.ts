import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, Ownership } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import crypto from "node:crypto";
import type { CryptoService } from "@/services/crypto/crypto.service.js";
import type { OwnershipRepository } from "@/services/ownership/ownership.repository.js";
import type { CreateOwnershipPayload } from "@/services/ownership/types.js";
import type { SignatureService } from "@/services/signature/signature.service.js";
import { transactional } from "@/types/mongo.types.js";
import type { UserService } from "@/services/user/user.service.js";

export class OwnershipService {
  constructor(
    private readonly repository: OwnershipRepository,
    private readonly userService: UserService,
    private readonly signatureService: SignatureService,
    private readonly ownershipCryptoService: CryptoService<Ownership>,
  ) {}

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.repository.getById(id, session);
    },
  );

  getByUserId = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.repository.getByUserId(userId, session);
    },
  );

  getBySignatureId = transactional(
    async (
      signatureId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.repository.getBySignatureId(signatureId, session);
    },
  );

  create = transactional(
    async (
      payload: CreateOwnershipPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.repository.create(payload, session);
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.repository.delete(id, session);
    },
  );

  assign = transactional(
    async (
      userId: string,
      signatureId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      try {
        const sameUserOwnershipResult: SuccessDataAny<Ownership> =
          await this.getByUserId(userId, session);
        if (sameUserOwnershipResult.success) {
          throw new Error(`Ownership for userId ${userId} already exists`);
        }

        const sameSignatureOwnershipResult: SuccessDataAny<Ownership> =
          await this.getBySignatureId(signatureId, session);
        if (sameSignatureOwnershipResult.success) {
          throw new Error(
            `Ownership for signatureId ${signatureId} already exists`,
          );
        }

        const userResult = await this.userService.getById(userId, session);
        if (!userResult.success || !userResult.data) {
          throw new Error(`User with id ${userId} was not found`);
        }

        const signatureResult = await this.signatureService.getById(
          signatureId,
          session,
        );
        if (!signatureResult.success || !signatureResult.data) {
          throw new Error(`Signature with id ${signatureId} was not found`);
        }

        const draftOwnership: Ownership = {
          _id: crypto.randomUUID(),
          userId,
          signatureId,
          ownershipProof: "",
          assignedAt: new Date(),
        };

        const proofResult: SuccessDataAny<string> =
          this.ownershipCryptoService.createProofSignature(draftOwnership);
        if (!proofResult.success || !proofResult.data) {
          throw new Error("Failed to create ownership proof");
        }

        const payload: CreateOwnershipPayload = {
          ...draftOwnership,
          ownershipProof: proofResult.data,
        };

        return this.create(payload, session);
      } catch (e: unknown) {
        return handleError<Ownership>(e);
      }
    },
  );
}
