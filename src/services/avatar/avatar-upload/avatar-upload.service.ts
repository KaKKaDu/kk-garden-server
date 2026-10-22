import { randomUUID } from "node:crypto";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import {
  ProfileAvatarFinalizeRequestSchema,
  ProfileAvatarUploadRequestSchema,
  type ProfileAvatarFinalizeRequest,
  type ProfileAvatarFinalizeResponse,
  type ProfileAvatarUploadRequest,
  type ProfileAvatarUploadResponse,
} from "@kk-garden/shared/schemas";
import type {
  Nullable,
  Profile,
  ProfileAvatarUploadSession,
  User,
} from "@kk-garden/shared/types";
import type { ClientSession, Mongoose } from "mongoose";
import type { AvatarCleanupService } from "@/services/avatar/avatar-cleanup/avatar-cleanup.service.ts";
import type { AvatarImageService } from "@/services/avatar/avatar-image/avatar-image.service.ts";
import type { AvatarStorageService } from "@/services/avatar/avatar-storage/avatar-storage.service.ts";
import type { AvatarUploadRepository } from "@/services/avatar/avatar-upload/avatar-upload.repository.ts";
import type {
  AvatarUploadClaim,
  AvatarUploadFailure,
  AvatarUploadStateChange,
} from "@/services/avatar/avatar-upload/types.ts";
import { avatarUploadPolicy } from "@/services/avatar/avatar-upload/policy.ts";
import type {
  ProfileAvatarFinalizeCommit,
  ProfileAvatarFinalizeInput,
} from "@/services/crud/profile/types.ts";
import type { ProfileService } from "@/services/crud/profile/profile.service.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";
import { Logger } from "@lib/logs/logger.ts";
import { Variables } from "@lib/variables/variables.ts";

const uploadVariables = Variables.of({
  "upload-expiry-ms": 900_000,
} as const);

class AvatarMetadataMismatchError extends AppError {
  constructor() {
    super({
      status: 400,
      message: "Uploaded image size does not match the declared size",
    });
  }
}

export class AvatarUploadService {
  constructor(
    private readonly repository: AvatarUploadRepository,
    private readonly storage: AvatarStorageService,
    private readonly cleanup: AvatarCleanupService,
    private readonly users: UserService,
    private readonly profiles: ProfileService,
    private readonly images: AvatarImageService,
    private readonly mongoService: MongoService,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.repository.initialize();
  }

  async issue(
    ownerId: string,
    input: ProfileAvatarUploadRequest,
  ): Promise<SuccessDataAny<ProfileAvatarUploadResponse>> {
    let result: SuccessDataAny<ProfileAvatarUploadResponse>;
    try {
      const metadata: ProfileAvatarUploadRequest =
        ProfileAvatarUploadRequestSchema.parse(input);
      const user: User = this.requireData(
        await this.users.getById.direct(ownerId),
        "Avatar owner lookup failed",
      );
      if (user.status !== "active") {
        throw new AppError({
          status: 403,
          message: "Only active accounts can upload avatars",
        });
      }
      const now: Date = new Date();
      const upload: ProfileAvatarUploadSession = {
        _id: randomUUID(),
        ownerId,
        stagingObjectKey: `avatars/staging/${randomUUID()}`,
        ...metadata,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(
          now.getTime() + uploadVariables.get("upload-expiry-ms"),
        ),
        state: "pending",
        attempts: 0,
        retryAt: now,
      };
      this.requireData(
        await this.repository.consumeIssueLimit(ownerId),
        "Avatar upload limit could not be checked",
      );
      const creationResult =
        await this.mongoService.execute<ProfileAvatarUploadSession>(
          async (db: Mongoose): Promise<ProfileAvatarUploadSession> => {
            const session: ClientSession = await db.startSession();
            try {
              const transactionResult =
                await session.withTransaction<ProfileAvatarUploadSession>(
                  async (): Promise<ProfileAvatarUploadSession> => {
                    await this.tombstones.assertMutationAllowed(
                      ownerId,
                      session,
                    );
                    const currentUser: User = this.requireData(
                      await this.users.getById(ownerId, session),
                      "Avatar owner lookup failed",
                    );
                    if (currentUser.status !== "active") {
                      throw new AppError({
                        status: 403,
                        message: "Only active accounts can upload avatars",
                      });
                    }
                    return this.requireData(
                      await this.repository.create(upload, session),
                      "Avatar upload could not be saved",
                    );
                  },
                );
              if (!transactionResult) {
                throw new AppError({
                  status: 503,
                  message: "Avatar upload transaction did not complete",
                });
              }
              return transactionResult;
            } finally {
              await session.endSession();
            }
          },
          "AvatarUploadService.issue",
        );
      this.requireData(creationResult, "Avatar upload could not be saved");
      await this.enqueueCleanup(ownerId, {
        kind: "staging",
        uploadId: upload._id,
        objectKey: upload.stagingObjectKey,
      });
      if (Date.now() >= new Date(upload.expiresAt).getTime()) {
        throw new AppError({
          status: 503,
          message: "Avatar upload expired before issuance; try again",
        });
      }
      const signed = this.requireData(
        await this.storage.issueUpload(
          metadata.contentType,
          upload.stagingObjectKey,
          now.getTime(),
        ),
        "Avatar upload URL could not be signed",
      );
      result = {
        success: true,
        data: {
          uploadId: upload._id,
          uploadUrl: signed.url,
          expiresAt: signed.expiresAt,
        },
      };
    } catch (error: unknown) {
      result = handleError<ProfileAvatarUploadResponse>(error);
    }
    Logger.report("AvatarUploadService.issue", result);
    return result;
  }

  async finalize(
    ownerId: string,
    input: ProfileAvatarFinalizeRequest,
  ): Promise<SuccessDataAny<ProfileAvatarFinalizeResponse>> {
    let result: SuccessDataAny<ProfileAvatarFinalizeResponse>;
    try {
      const request: ProfileAvatarFinalizeRequest =
        ProfileAvatarFinalizeRequestSchema.parse(input);
      const user: User = this.requireData(
        await this.users.getById.direct(ownerId),
        "Avatar owner lookup failed",
      );
      if (user.status !== "active") {
        throw new AppError({
          status: 403,
          message: "Only active accounts can finalize avatars",
        });
      }
      const upload: Nullable<ProfileAvatarUploadSession> = this.requireData(
        await this.repository.getById.direct(request.uploadId, ownerId),
        "Avatar upload lookup failed",
      ).upload;
      if (!upload) {
        throw new AppError({
          status: 404,
          message: "Avatar upload session was not found",
        });
      }
      if (upload.state === "completed") {
        result = {
          success: true,
          data: await this.deliver(ownerId, upload.result.objectKey),
        };
      } else {
        if (upload.state === "expired" || upload.state === "rejected") {
          throw new AppError({
            status: 410,
            message: "Avatar upload session is no longer usable",
          });
        }
        const profile: Nullable<Profile> = this.requireData(
          await this.profiles.getById.direct(ownerId),
          "Avatar profile lookup failed",
        ).profile;
        if (!profile?.displayName) {
          throw new AppError({
            status: 409,
            message: "Save a profile display name before finalizing an avatar",
          });
        }
        const claim: AvatarUploadClaim = await this.claim(ownerId, upload);
        result = {
          success: true,
          data: await this.processClaim(claim),
        };
      }
    } catch (error: unknown) {
      result = handleError<ProfileAvatarFinalizeResponse>(error);
    }
    Logger.report("AvatarUploadService.finalize", result);
    return result;
  }

  private async claim(
    ownerId: string,
    upload: Extract<
      ProfileAvatarUploadSession,
      { state: "pending" | "processing" }
    >,
  ): Promise<AvatarUploadClaim> {
    const now: Date = new Date();
    if (upload.state === "processing") {
      if (new Date(upload.claim.leaseExpiresAt).getTime() > now.getTime()) {
        throw new AppError({
          status: 409,
          message: "Avatar finalization is already in progress",
        });
      }
      this.requireTransition(
        await this.repository.recoverStaleProcessing(
          upload._id,
          ownerId,
          upload.claim.token,
          now,
        ),
      );
      const current: Nullable<ProfileAvatarUploadSession> = this.requireData(
        await this.repository.getById.direct(upload._id, ownerId),
        "Avatar upload state could not be checked",
      ).upload;
      if (current?.state === "pending") {
        return this.claim(ownerId, current);
      }
      throw new AppError({
        status: current?.state === "expired" ? 410 : 409,
        message: "Avatar finalization claim was recovered; retry the request",
      });
    }

    if (now.getTime() >= new Date(upload.expiresAt).getTime()) {
      this.requireTransition(
        await this.repository.transition(
          upload._id,
          ownerId,
          "pending",
          null,
          { state: "expired" },
          now,
        ),
      );
      throw new AppError({
        status: 410,
        message: "Avatar upload session expired",
      });
    }
    if (new Date(upload.retryAt).getTime() > now.getTime()) {
      throw new AppError({
        status: 409,
        message: "Avatar finalization is waiting before its next retry",
      });
    }
    if (upload.attempts >= avatarUploadPolicy.get("finalize-max-attempts")) {
      this.requireTransition(
        await this.repository.transition(
          upload._id,
          ownerId,
          "pending",
          null,
          { state: "rejected", reason: "attempts-exhausted" },
          now,
        ),
      );
      throw new AppError({
        status: 409,
        message: "Avatar finalization attempts were exhausted",
      });
    }
    const claim: AvatarUploadClaim["claim"] = this.newClaim(now);
    const claimed = this.requireData(
      await this.repository.claimPending(
        upload._id,
        ownerId,
        claim,
        this.newCandidateKey(),
        now,
      ),
      "Avatar finalization could not be claimed",
    );
    if (!claimed.upload) {
      throw new AppError({
        status: 409,
        message: "Avatar finalization was claimed by another request",
      });
    }
    return claimed.upload;
  }

  private async processClaim(
    upload: AvatarUploadClaim,
  ): Promise<ProfileAvatarFinalizeResponse> {
    let committedKey: string;
    try {
      await this.enqueueCleanup(upload.ownerId, {
        kind: "candidate",
        uploadId: upload._id,
        objectKey: upload.candidateObjectKey,
      });
      const deadline: AbortSignal = AbortSignal.timeout(
        Math.max(
          1,
          new Date(upload.claim.leaseExpiresAt).getTime() - Date.now(),
        ),
      );
      const bytes: Buffer = this.requireData(
        await this.storage.readStaging(upload.stagingObjectKey, deadline),
        "Avatar staging object could not be read",
      );
      if (bytes.length !== upload.byteSize) {
        throw new AvatarMetadataMismatchError();
      }
      const normalized = this.requireData(
        await this.images.normalize(bytes, upload.contentType),
        "Avatar image could not be normalized",
      );
      const latest = this.requireData(
        await this.repository.getById.direct(upload._id, upload.ownerId),
        "Avatar upload claim could not be revalidated",
      ).upload;
      const isProcessing: boolean = latest?.state === "processing";
      const tokenMatches: boolean =
        latest?.state === "processing" &&
        latest.claim.token === upload.claim.token;
      const claimLeaseExpired: boolean =
        Date.now() >= new Date(upload.claim.leaseExpiresAt).getTime();
      const uploadExpired: boolean =
        Date.now() >= new Date(upload.expiresAt).getTime();
      const claimCurrent: boolean = isProcessing && tokenMatches;
      const claimExpired: boolean = claimLeaseExpired || uploadExpired;
      if (!claimCurrent || claimExpired) {
        throw new AppError({
          status: 409,
          message: "Avatar finalization claim expired; retry the upload",
        });
      }
      const stored = this.requireData(
        await this.storage.putFinal(
          normalized.bytes,
          upload.candidateObjectKey,
          deadline,
        ),
        "Final avatar could not be stored",
      );
      if (stored.objectKey !== upload.candidateObjectKey) {
        throw new AppError({
          status: 502,
          message: "Avatar storage returned an unexpected object reference",
        });
      }
      const profile: Nullable<Profile> = this.requireData(
        await this.profiles.getById.direct(upload.ownerId),
        "Avatar profile lookup failed",
      ).profile;
      if (!profile?.displayName) {
        throw new AppError({
          status: 409,
          message: "Save a profile display name before finalizing an avatar",
        });
      }
      const expectedAvatarObjectKey: Nullable<string> =
        profile.avatarObjectKey ?? null;
      if (expectedAvatarObjectKey) {
        await this.enqueueCleanup(upload.ownerId, {
          kind: "displaced-avatar",
          objectKey: expectedAvatarObjectKey,
        });
      }
      const commitInput: ProfileAvatarFinalizeInput = {
        ownerId: upload.ownerId,
        uploadId: upload._id,
        claimToken: upload.claim.token,
        candidateObjectKey: upload.candidateObjectKey,
        expectedAvatarObjectKey,
        width: normalized.width,
        height: normalized.height,
      };
      const committed: SuccessDataAny<ProfileAvatarFinalizeCommit> =
        await this.profiles.finalizeAvatar(commitInput);
      if (!committed.success || !committed.data) {
        const latestUpload: Nullable<ProfileAvatarUploadSession> =
          this.requireData(
            await this.repository.getById.direct(upload._id, upload.ownerId),
            "Avatar upload state could not be checked",
          ).upload;
        if (latestUpload?.state !== "completed") {
          throw this.resultError(
            committed,
            "Avatar profile update could not be committed",
          );
        }
        committedKey = latestUpload.result.objectKey;
      } else {
        committedKey = committed.data.result.objectKey;
      }
    } catch (error: unknown) {
      const now: Date = new Date();
      const permanentReason: Nullable<"invalid-image" | "metadata-mismatch"> =
        error instanceof AvatarMetadataMismatchError
          ? "metadata-mismatch"
          : error instanceof AppError && error.status === 400
            ? "invalid-image"
            : error instanceof AppError && error.status === 413
              ? "metadata-mismatch"
              : null;
      const expired: boolean =
        now.getTime() >= new Date(upload.expiresAt).getTime();
      const failureCode: AvatarUploadFailure["code"] =
        error instanceof AppError && error.status === 502
          ? "storage-unavailable"
          : error instanceof AppError && error.status === 409
            ? "source-changed"
            : "processing-unavailable";
      const change: AvatarUploadStateChange = expired
        ? { state: "expired" as const }
        : permanentReason
          ? { state: "rejected" as const, reason: permanentReason }
          : {
              state: "pending",
              retryAt: this.nextRetryAt(upload, now),
              failure: { code: failureCode, occurredAt: now },
            };
      const transition = this.requireData(
        await this.repository.transition(
          upload._id,
          upload.ownerId,
          "processing",
          upload.claim.token,
          change,
          now,
          expired ? "any" : "active",
        ),
        "Avatar failure could not be recorded",
      );
      if (transition.updated) {
        throw error;
      }
      const latest: Nullable<ProfileAvatarUploadSession> = this.requireData(
        await this.repository.getById.direct(upload._id, upload.ownerId),
        "Avatar upload state could not be checked",
      ).upload;
      if (latest?.state !== "completed") {
        throw error;
      }
      committedKey = latest.result.objectKey;
    }
    return this.deliver(upload.ownerId, committedKey);
  }

  private async deliver(
    ownerId: string,
    objectKey: string,
  ): Promise<ProfileAvatarFinalizeResponse> {
    const user: User = this.requireData(
      await this.users.getById.direct(ownerId),
      "Avatar owner lookup failed",
    );
    if (user.status !== "active") {
      throw new AppError({
        status: 403,
        message: "Only active accounts can access avatars",
      });
    }
    const profile: Nullable<Profile> = this.requireData(
      await this.profiles.getById.direct(ownerId),
      "Avatar profile lookup failed",
    ).profile;
    if (profile?.avatarObjectKey !== objectKey) {
      throw new AppError({
        status: 409,
        message: "This upload is complete but is no longer the current avatar",
      });
    }
    const signed = this.requireData(
      await this.storage.signRead(objectKey),
      "Avatar delivery could not be signed",
    );
    return { avatar: { url: signed.url, expiresAt: signed.expiresAt } };
  }

  private async enqueueCleanup(
    ownerId: string,
    target:
      | {
          kind: "staging" | "candidate";
          uploadId: string;
          objectKey: string;
        }
      | {
          kind: "displaced-avatar";
          objectKey: string;
        },
  ): Promise<void> {
    const result = this.requireData(
      await this.cleanup.enqueue({ ownerId, target }),
      "Avatar cleanup could not be scheduled",
    );
    if (!result.queued) {
      throw new AppError({
        status: 503,
        message: "Avatar cleanup was not scheduled",
      });
    }
  }

  private newClaim(now: Date): AvatarUploadClaim["claim"] {
    return {
      token: randomUUID(),
      claimedAt: now,
      leaseExpiresAt: new Date(
        now.getTime() + avatarUploadPolicy.get("finalize-claim-lease-ms"),
      ),
    };
  }

  private newCandidateKey(): string {
    return `avatars/final/${randomUUID()}.webp`;
  }

  private nextRetryAt(upload: AvatarUploadClaim, now: Date): Date {
    const delay: number = Math.min(
      avatarUploadPolicy.get("finalize-retry-base-ms") *
        2 ** Math.max(0, upload.attempts - 1),
      avatarUploadPolicy.get("finalize-retry-max-ms"),
    );
    return new Date(
      Math.min(now.getTime() + delay, new Date(upload.expiresAt).getTime()),
    );
  }

  private requireData<T extends object>(
    result: SuccessDataAny<T>,
    fallback: string,
  ): T {
    if (!result.success || !result.data) {
      throw this.resultError(result, fallback);
    }
    return result.data;
  }

  private requireTransition(
    result: SuccessDataAny<{ updated: boolean }>,
  ): void {
    const transition = this.requireData(
      result,
      "Avatar session state could not be changed",
    );
    if (!transition.updated) {
      throw new AppError({
        status: 409,
        message: "Avatar session state changed; retry the request",
      });
    }
  }

  private resultError<T extends object>(
    result: SuccessDataAny<T>,
    fallback: string,
  ): AppError {
    const error = result.success ? undefined : result.errors[0];
    return new AppError({
      status: error?.status ?? 503,
      message: error?.message ?? fallback,
    });
  }
}
