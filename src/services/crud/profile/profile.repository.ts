import { MongoServerError } from "mongodb";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Collection } from "mongodb";
import {
  ProfileAccentHexSchema,
  ProfileAvatarObjectKeySchema,
  ProfileBioSchema,
  ProfileDisplayNameSchema,
} from "@kk-garden/shared/schemas";
import type { Nullable, Profile } from "@kk-garden/shared/types";
import type { ClientSession, Model, Mongoose, UpdateQuery } from "mongoose";
import { parseProfile, ProfileMongoSchema } from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type {
  ProfileAvatarReferenceChange,
  ProfileLookup,
  ProfileUpdateRateLimit,
  ProfileUpdateFields,
} from "@/services/crud/profile/types.js";
import { transactional, type DocumentLike } from "@/types/mongo.types.js";

const PROFILE_MODEL_NAME: string = "Profile";
const PROFILE_COLLECTION_NAME: string = "profiles";
const PROFILE_UPDATE_RATE_LIMIT_COLLECTION_NAME: string =
  "profileUpdateRateLimits";
const PROFILE_UPDATE_RATE_LIMIT: number = 20;
const PROFILE_UPDATE_RATE_WINDOW_MS: number = 60_000;
const PROFILE_UPDATE_RATE_RETENTION_MS: number = 120_000;

type ProfileUpdateRateLimitRecord = {
  _id: string;
  count: number;
  expiresAt: Date;
};

export class ProfileRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<Profile> {
    const existingModel: Nullable<Model<Profile>> = db.models[
      PROFILE_MODEL_NAME
    ] as Nullable<Model<Profile>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<Profile>(
      PROFILE_MODEL_NAME,
      ProfileMongoSchema,
      PROFILE_COLLECTION_NAME,
    );
  }

  private toDto(document: DocumentLike): Profile {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<Profile, "_id"> & { _id?: unknown };

    return parseProfile({
      ...raw,
      _id: String(raw._id),
    });
  }

  private isProfileIdCollision(error: unknown): boolean {
    return (
      error instanceof MongoServerError &&
      error.code === 11000 &&
      Boolean(error.keyPattern?._id)
    );
  }

  async consumeUpdateRateLimit(
    userId: string,
  ): Promise<SuccessDataAny<ProfileUpdateRateLimit>> {
    return this.mongoService.execute<ProfileUpdateRateLimit>(
      async (db: Mongoose): Promise<ProfileUpdateRateLimit> => {
        const collection: Collection<ProfileUpdateRateLimitRecord> =
          db.connection
            .getClient()
            .db()
            .collection<ProfileUpdateRateLimitRecord>(
              PROFILE_UPDATE_RATE_LIMIT_COLLECTION_NAME,
            );
        await collection.createIndex(
          { expiresAt: 1 },
          {
            expireAfterSeconds: 0,
            name: "profile_update_rate_limit_expiry",
          },
        );

        const now: Date = new Date();
        const nowMs: number = now.getTime();
        const windowStartMs: number =
          Math.floor(nowMs / PROFILE_UPDATE_RATE_WINDOW_MS) *
          PROFILE_UPDATE_RATE_WINDOW_MS;
        const windowEndMs: number =
          windowStartMs + PROFILE_UPDATE_RATE_WINDOW_MS;
        const bucketId: string = `${userId}:${windowStartMs}`;
        const filter: { _id: string } = { _id: bucketId };
        const update = {
          $inc: { count: 1 },
          $setOnInsert: {
            expiresAt: new Date(windowEndMs + PROFILE_UPDATE_RATE_RETENTION_MS),
          },
        };

        let record: ProfileUpdateRateLimitRecord | null;
        try {
          record = await collection.findOneAndUpdate(filter, update, {
            upsert: true,
            returnDocument: "after",
          });
        } catch (error: unknown) {
          if (!(error instanceof MongoServerError) || error.code !== 11000) {
            throw error;
          }
          record = await collection.findOneAndUpdate(filter, update, {
            returnDocument: "after",
          });
          if (!record) {
            throw error;
          }
        }

        if (!record) {
          throw new Error("Profile update rate limit counter was not returned");
        }

        const retryAfterSeconds: number = Math.max(
          1,
          Math.ceil((windowEndMs - nowMs) / 1_000),
        );
        return {
          allowed: record.count <= PROFILE_UPDATE_RATE_LIMIT,
          retryAfterSeconds,
        };
      },
      "ProfileRepository.consumeUpdateRateLimit",
    );
  }

  getById = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileLookup>> => {
      return this.mongoService.execute<ProfileLookup>(
        async (db: Mongoose): Promise<ProfileLookup> => {
          const model: Model<Profile> = this.getModel(db);
          const query = model.findById(userId);
          if (session) {
            query.session(session);
          }
          const document: Nullable<DocumentLike> = await query.exec();

          return {
            profile: document ? this.toDto(document) : null,
          };
        },
        "ProfileRepository.getById",
      );
    },
  );

  updateFields = transactional(
    async (
      userId: string,
      fields: ProfileUpdateFields,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileLookup>> => {
      return this.mongoService.execute<ProfileLookup>(
        async (db: Mongoose): Promise<ProfileLookup> => {
          const setFields: Partial<
            Pick<Profile, "displayName" | "bio" | "accentHex">
          > = {};
          const unsetFields: { bio?: 1; accentHex?: 1 } = {};

          if (fields.displayName !== undefined) {
            setFields.displayName = ProfileDisplayNameSchema.parse(
              fields.displayName,
            );
          }
          if (fields.bio !== undefined) {
            if (fields.bio === null) {
              unsetFields.bio = 1;
            } else {
              setFields.bio = ProfileBioSchema.parse(fields.bio);
            }
          }
          if (fields.accentHex !== undefined) {
            if (fields.accentHex === null) {
              unsetFields.accentHex = 1;
            } else {
              setFields.accentHex = ProfileAccentHexSchema.parse(
                fields.accentHex,
              );
            }
          }

          if (
            Object.keys(setFields).length === 0 &&
            Object.keys(unsetFields).length === 0
          ) {
            throw new Error("At least one profile field must be updated");
          }

          const update: UpdateQuery<Profile> = {};
          if (Object.keys(setFields).length > 0) {
            update.$set = setFields;
          }
          if (Object.keys(unsetFields).length > 0) {
            update.$unset = unsetFields;
          }

          const model: Model<Profile> = this.getModel(db);
          const canCreateProfile: boolean = fields.displayName !== undefined;
          const options = {
            new: true,
            upsert: canCreateProfile,
            setDefaultsOnInsert: false,
            session: session ?? undefined,
          };

          let document: Nullable<DocumentLike>;
          try {
            document = await model
              .findOneAndUpdate({ _id: userId }, update, options)
              .exec();
          } catch (error: unknown) {
            if (
              !session &&
              canCreateProfile &&
              this.isProfileIdCollision(error)
            ) {
              document = await model
                .findOneAndUpdate({ _id: userId }, update, {
                  ...options,
                  upsert: false,
                })
                .exec();
              if (!document) {
                throw error;
              }
            } else {
              throw error;
            }
          }

          return {
            profile: document ? this.toDto(document) : null,
          };
        },
        "ProfileRepository.updateFields",
      );
    },
  );

  setAvatarObjectKey = transactional(
    async (
      userId: string,
      objectKey: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      return this.mongoService.execute<ProfileAvatarReferenceChange>(
        async (db: Mongoose): Promise<ProfileAvatarReferenceChange> => {
          const validatedObjectKey: string =
            ProfileAvatarObjectKeySchema.parse(objectKey);
          const model: Model<Profile> = this.getModel(db);
          const document: Nullable<DocumentLike> = await model
            .findOneAndUpdate(
              { _id: userId },
              { $set: { avatarObjectKey: validatedObjectKey } },
              { new: false, session: session ?? undefined },
            )
            .exec();
          const previousProfile: Nullable<Profile> = document
            ? this.toDto(document)
            : null;
          const previousObjectKey: Nullable<string> =
            previousProfile?.avatarObjectKey;

          return {
            previousProfile,
            displacedAvatarObjectKey:
              previousObjectKey && previousObjectKey !== validatedObjectKey
                ? previousObjectKey
                : null,
          };
        },
        "ProfileRepository.setAvatarObjectKey",
      );
    },
  );

  clearAvatarObjectKey = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      return this.mongoService.execute<ProfileAvatarReferenceChange>(
        async (db: Mongoose): Promise<ProfileAvatarReferenceChange> => {
          const model: Model<Profile> = this.getModel(db);
          const document: Nullable<DocumentLike> = await model
            .findOneAndUpdate(
              { _id: userId },
              { $unset: { avatarObjectKey: 1 } },
              { new: false, session: session ?? undefined },
            )
            .exec();
          const previousProfile: Nullable<Profile> = document
            ? this.toDto(document)
            : null;

          return {
            previousProfile,
            displacedAvatarObjectKey: previousProfile?.avatarObjectKey ?? null,
          };
        },
        "ProfileRepository.clearAvatarObjectKey",
      );
    },
  );
}
