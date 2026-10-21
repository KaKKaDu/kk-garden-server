import { MongoServerError } from "mongodb";
import type { ClientSession, Mongoose } from "mongoose";
import { RateLimiterMongo, RateLimiterRes } from "rate-limiter-flexible";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { ProfileAvatarUploadSessionSchema } from "@kk-garden/shared/schemas";
import type {
  Nullable,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { AvatarUploadLookup } from "@/services/avatar-upload/types.ts";
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
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<{ ready: true }> => {
        const db = connection.connection.getClient().db();
        const uploads = db.collection<ProfileAvatarUploadSession>(
          uploadVariables.get("collection-name"),
        );
        await uploads.createIndex(
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
      },
      "AvatarUploadRepository.initialize",
    );
  }

  create(
    upload: ProfileAvatarUploadSession,
  ): Promise<SuccessDataAny<ProfileAvatarUploadSession>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<ProfileAvatarUploadSession> => {
        if (!this.limiter) {
          throw new AppError({
            status: 503,
            message: "Avatar uploads are not ready",
          });
        }
        const payload: ProfileAvatarUploadSession =
          ProfileAvatarUploadSessionSchema.parse(upload);
        if (payload.state !== "pending" || payload.attempts !== 0) {
          throw new AppError({
            status: 400,
            message: "New avatar uploads must be pending",
          });
        }
        try {
          await this.limiter.consume(payload.ownerId);
        } catch (error: unknown) {
          throw new AppError({
            status: error instanceof RateLimiterRes ? 429 : 503,
            message:
              error instanceof RateLimiterRes
                ? "Avatar upload limit reached; try again later"
                : "Avatar upload rate limiter is unavailable",
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
        );
        try {
          await uploads.insertOne(payload);
        } catch (error: unknown) {
          if (
            error instanceof MongoServerError &&
            error.code === 11000 &&
            error.keyPattern?.ownerId
          ) {
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
          const upload = await connection.connection
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
}
