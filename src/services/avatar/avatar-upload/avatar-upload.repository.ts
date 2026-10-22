import { MongoServerError, type Filter } from "mongodb";
import type { ClientSession, Mongoose } from "mongoose";
import { RateLimiterMongo, RateLimiterRes } from "rate-limiter-flexible";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import {
  ProfileAvatarUploadResultSchema,
  ProfileAvatarUploadSessionSchema,
} from "@kk-garden/shared/schemas";
import type {
  Nullable,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type {
  AvatarUploadClaim,
  AvatarUploadClaimLookup,
  AvatarUploadLookup,
  AvatarUploadStateChange,
  AvatarUploadTransition,
} from "@/services/avatar/avatar-upload/types.ts";
import { avatarUploadPolicy } from "@/services/avatar/avatar-upload/policy.ts";
import { transactional } from "@/types/mongo.types.ts";
import { Variables } from "@lib/variables/variables.ts";

const uploadVariables = Variables.of({
  "collection-name": "profile_avatar_upload_sessions",
  "rate-collection-name": "avatar_upload_limits",
  "issuance-attempts": 5,
  "rate-duration-seconds": 3_600,
} as const);

export class AvatarUploadRepository {
  private limiter?: RateLimiterMongo;

  constructor(private readonly mongoService: MongoService) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.mongoService.execute(async (connection: Mongoose) => {
      const db = connection.connection.getClient().db();
      await db
        .collection<ProfileAvatarUploadSession>(
          uploadVariables.get("collection-name"),
        )
        .createIndex(
          { ownerId: 1 },
          {
            name: "one_active_avatar_upload",
            unique: true,
            partialFilterExpression: {
              state: { $in: ["pending", "processing"] },
            },
          },
        );
      this.limiter = new RateLimiterMongo({
        storeClient: db,
        tableName: uploadVariables.get("rate-collection-name"),
        keyPrefix: "avatar-upload",
        points: uploadVariables.get("issuance-attempts"),
        duration: uploadVariables.get("rate-duration-seconds"),
        disableIndexesCreation: true,
      });
      await this.limiter.createIndexes();
      return { ready: true };
    }, "AvatarUploadRepository.initialize");
  }

  consumeIssueLimit(
    ownerId: string,
  ): Promise<SuccessDataAny<{ consumed: true }>> {
    return this.mongoService.execute(async (): Promise<{ consumed: true }> => {
      if (!this.limiter) {
        throw new AppError({
          status: 503,
          message: "Avatar uploads are not ready",
        });
      }
      try {
        await this.limiter.consume(ownerId);
      } catch (error: unknown) {
        throw new AppError({
          status: error instanceof RateLimiterRes ? 429 : 503,
          message:
            error instanceof RateLimiterRes
              ? "Avatar upload limit reached; try again later"
              : "Avatar upload rate limiter is unavailable",
        });
      }
      return { consumed: true };
    }, "AvatarUploadRepository.consumeIssueLimit");
  }

  create(
    upload: ProfileAvatarUploadSession,
    session: Nullable<ClientSession>,
  ): Promise<SuccessDataAny<ProfileAvatarUploadSession>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<ProfileAvatarUploadSession> => {
        const payload = ProfileAvatarUploadSessionSchema.parse(upload);
        if (payload.state !== "pending" || payload.attempts !== 0) {
          throw new AppError({
            status: 400,
            message: "New avatar uploads must be pending",
          });
        }

        const uploads = connection.connection
          .getClient()
          .db()
          .collection<ProfileAvatarUploadSession>(
            uploadVariables.get("collection-name"),
          );
        const now: Date = new Date();
        await uploads.updateMany(
          {
            ownerId: payload.ownerId,
            state: "pending",
            expiresAt: { $lte: now },
          },
          {
            $set: { state: "expired", updatedAt: now, finishedAt: now },
            $unset: { retryAt: "", lastFailure: "" },
          },
          { session: session ?? undefined },
        );
        await uploads.updateMany(
          {
            ownerId: payload.ownerId,
            state: "processing",
            "claim.leaseExpiresAt": { $lte: now },
            expiresAt: { $lte: now },
          },
          {
            $set: { state: "expired", updatedAt: now, finishedAt: now },
            $unset: { claim: "", candidateObjectKey: "" },
          },
          { session: session ?? undefined },
        );
        await uploads.updateMany(
          {
            ownerId: payload.ownerId,
            state: "processing",
            "claim.leaseExpiresAt": { $lte: now },
            expiresAt: { $gt: now },
          },
          {
            $set: {
              state: "pending",
              updatedAt: now,
              retryAt: now,
              lastFailure: { code: "lease-expired", occurredAt: now },
            },
            $unset: { claim: "", candidateObjectKey: "" },
          },
          { session: session ?? undefined },
        );
        try {
          await uploads.insertOne(payload, { session: session ?? undefined });
        } catch (error: unknown) {
          const mongoDuplicate: boolean =
            error instanceof MongoServerError && error.code === 11000;
          const ownerIndexConflict: boolean =
            error instanceof MongoServerError &&
            Boolean(error.keyPattern?.ownerId);
          if (mongoDuplicate && ownerIndexConflict) {
            throw new AppError({
              status: 429,
              message:
                "An avatar upload is already active; finish it or wait for expiry",
            });
          }
          throw error;
        }
        return payload;
      },
      "AvatarUploadRepository.create",
    );
  }

  getById = transactional(
    async (
      uploadId: string,
      ownerId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<AvatarUploadLookup>> =>
      this.mongoService.execute(
        async (connection: Mongoose): Promise<AvatarUploadLookup> => {
          const upload: Nullable<ProfileAvatarUploadSession> =
            await connection.connection
              .getClient()
              .db()
              .collection<ProfileAvatarUploadSession>(
                uploadVariables.get("collection-name"),
              )
              .findOne(
                { _id: uploadId, ownerId },
                { session: session ?? undefined },
              );
          return {
            upload: upload
              ? ProfileAvatarUploadSessionSchema.parse(upload)
              : null,
          };
        },
        "AvatarUploadRepository.getById",
      ),
  );

  claimPending(
    uploadId: string,
    ownerId: string,
    claim: AvatarUploadClaim["claim"],
    candidateObjectKey: string,
    now: Date,
  ): Promise<SuccessDataAny<AvatarUploadClaimLookup>> {
    return this.claim(
      {
        _id: uploadId,
        ownerId,
        state: "pending",
        attempts: { $lt: avatarUploadPolicy.get("finalize-max-attempts") },
        retryAt: { $lte: now },
        expiresAt: { $gt: now },
      },
      uploadId,
      ownerId,
      claim,
      candidateObjectKey,
      now,
    );
  }

  private claim(
    filter: Filter<ProfileAvatarUploadSession>,
    uploadId: string,
    ownerId: string,
    claim: AvatarUploadClaim["claim"],
    candidateObjectKey: string,
    now: Date,
  ): Promise<SuccessDataAny<AvatarUploadClaimLookup>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<AvatarUploadClaimLookup> => {
        const uploads = connection.connection
          .getClient()
          .db()
          .collection<ProfileAvatarUploadSession>(
            uploadVariables.get("collection-name"),
          );
        const updated = await uploads.updateOne(filter, {
          $set: {
            state: "processing",
            claim,
            candidateObjectKey,
            updatedAt: now,
          },
          $inc: { attempts: 1 },
          $unset: { retryAt: "", lastFailure: "" },
        });
        const upload: Nullable<ProfileAvatarUploadSession> =
          updated.modifiedCount === 1
            ? await uploads.findOne({
                _id: uploadId,
                ownerId,
                state: "processing",
                "claim.token": claim.token,
              })
            : null;
        const parsed: Nullable<ProfileAvatarUploadSession> = upload
          ? ProfileAvatarUploadSessionSchema.parse(upload)
          : null;
        return { upload: parsed?.state === "processing" ? parsed : null };
      },
      "AvatarUploadRepository.claim",
    );
  }

  transition(
    uploadId: string,
    ownerId: string,
    from: "pending" | "processing",
    claimToken: Nullable<string>,
    change: AvatarUploadStateChange,
    now: Date,
    lease: "active" | "expired" | "any" = "any",
  ): Promise<SuccessDataAny<AvatarUploadTransition>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<AvatarUploadTransition> => {
        const filter: Filter<ProfileAvatarUploadSession> = {
          _id: uploadId,
          ownerId,
          state: from,
        };
        if (from === "processing" && claimToken) {
          filter["claim.token"] = claimToken;
          if (lease === "active") {
            filter["claim.leaseExpiresAt"] = { $gt: now };
          } else if (lease === "expired") {
            filter["claim.leaseExpiresAt"] = { $lte: now };
          }
        }
        if (change.state === "expired") {
          filter.expiresAt = { $lte: now };
        } else if (change.state === "rejected") {
          filter.expiresAt = { $gt: now };
          if (change.reason === "attempts-exhausted") {
            filter.attempts = {
              $gte: avatarUploadPolicy.get("finalize-max-attempts"),
            };
          }
        } else {
          filter.expiresAt = { $gt: now };
          filter["claim.leaseExpiresAt"] = { $gt: now };
        }

        const uploads = connection.connection
          .getClient()
          .db()
          .collection<ProfileAvatarUploadSession>(
            uploadVariables.get("collection-name"),
          );
        const updated =
          change.state === "pending"
            ? await uploads.updateOne(filter, {
                $set: {
                  state: "pending",
                  retryAt: change.retryAt,
                  lastFailure: change.failure,
                  updatedAt: now,
                },
                $unset: { claim: "", candidateObjectKey: "" },
              })
            : change.state === "expired"
              ? await uploads.updateOne(filter, {
                  $set: { state: "expired", finishedAt: now, updatedAt: now },
                  $unset: {
                    claim: "",
                    candidateObjectKey: "",
                    retryAt: "",
                    lastFailure: "",
                  },
                })
              : await uploads.updateOne(filter, {
                  $set: {
                    state: "rejected",
                    reason: change.reason,
                    finishedAt: now,
                    updatedAt: now,
                  },
                  $unset: {
                    claim: "",
                    candidateObjectKey: "",
                    retryAt: "",
                    lastFailure: "",
                  },
                });
        return { updated: updated.modifiedCount === 1 };
      },
      "AvatarUploadRepository.transition",
    );
  }

  async recoverStaleProcessing(
    uploadId: string,
    ownerId: string,
    claimToken: string,
    now: Date,
  ): Promise<SuccessDataAny<AvatarUploadTransition>> {
    const lookup = await this.getById.direct(uploadId, ownerId);
    if (!lookup.success) {
      return { success: false, errors: lookup.errors };
    }
    const upload = lookup.data?.upload;
    if (upload?.state !== "processing") {
      return { success: true, data: { updated: false } };
    }
    if (upload.claim.token !== claimToken) {
      return { success: true, data: { updated: false } };
    }
    const leaseIsActive: boolean =
      new Date(upload.claim.leaseExpiresAt).getTime() > now.getTime();
    if (leaseIsActive) {
      return { success: true, data: { updated: false } };
    }
    const change: AvatarUploadStateChange =
      new Date(upload.expiresAt).getTime() <= now.getTime()
        ? { state: "expired" }
        : upload.attempts >= avatarUploadPolicy.get("finalize-max-attempts")
          ? { state: "rejected", reason: "attempts-exhausted" }
          : {
              state: "pending",
              retryAt: now,
              failure: { code: "lease-expired", occurredAt: now },
            };
    return this.transition(
      uploadId,
      ownerId,
      "processing",
      claimToken,
      change,
      now,
      "expired",
    );
  }

  complete = transactional(
    async (
      input: {
        uploadId: string;
        ownerId: string;
        claimToken: string;
        candidateObjectKey: string;
        result: Extract<
          ProfileAvatarUploadSession,
          { state: "completed" }
        >["result"];
        committedAt: Date;
      },
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<AvatarUploadTransition>> =>
      this.mongoService.execute(
        async (connection: Mongoose): Promise<AvatarUploadTransition> => {
          const result = ProfileAvatarUploadResultSchema.parse(input.result);
          const updated = await connection.connection
            .getClient()
            .db()
            .collection<ProfileAvatarUploadSession>(
              uploadVariables.get("collection-name"),
            )
            .updateOne(
              {
                _id: input.uploadId,
                ownerId: input.ownerId,
                state: "processing",
                "claim.token": input.claimToken,
                "claim.leaseExpiresAt": { $gt: input.committedAt },
                candidateObjectKey: input.candidateObjectKey,
                expiresAt: { $gt: input.committedAt },
              },
              {
                $set: {
                  state: "completed",
                  result,
                  updatedAt: input.committedAt,
                },
                $unset: { claim: "", candidateObjectKey: "" },
              },
              { session: session ?? undefined },
            );
          return { updated: updated.modifiedCount === 1 };
        },
        "AvatarUploadRepository.complete",
      ),
  );
}
