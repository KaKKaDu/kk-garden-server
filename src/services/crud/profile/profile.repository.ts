import { MongoServerError } from "mongodb";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import {
  ProfileAccentHexSchema,
  ProfileAvatarObjectKeySchema,
  ProfileBioSchema,
  ProfileDisplayNameSchema,
} from "@kk-garden/shared/schemas";
import type { Nullable, Profile } from "@kk-garden/shared/types";
import type { ClientSession, Model, Mongoose, UpdateQuery } from "mongoose";
import { parseProfile, ProfileMongoSchema } from "@/schemas/models/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type {
  ProfileAvatarReferenceChange,
  ProfileLookup,
  ProfileUpdateFields,
} from "@/services/crud/profile/types.ts";
import { transactional, type DocumentLike } from "@/types/mongo.types.ts";

import { Variables } from "@lib/variables/variables.ts";

const profileVariables = Variables.of({
  "model-name": "Profile",
  "collection-name": "profiles",
} as const);

export class ProfileRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<Profile> {
    const existingModel: Nullable<Model<Profile>> = db.models[
      profileVariables.get("model-name")
    ] as Nullable<Model<Profile>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<Profile>(
      profileVariables.get("model-name"),
      ProfileMongoSchema,
      profileVariables.get("collection-name"),
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
    const isDuplicateKey: boolean =
      error instanceof MongoServerError && error.code === 11000;
    const hasProfileIdKey: boolean =
      error instanceof MongoServerError && Boolean(error.keyPattern?._id);
    const isProfileIdCollision: boolean = isDuplicateKey && hasProfileIdKey;
    return isProfileIdCollision;
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

          const hasNoSetFields: boolean = Object.keys(setFields).length === 0;
          const hasNoUnsetFields: boolean =
            Object.keys(unsetFields).length === 0;
          const hasNoChanges: boolean = hasNoSetFields && hasNoUnsetFields;
          if (hasNoChanges) {
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
            const hasNoTransaction: boolean = !session;
            const createsProfile: boolean = canCreateProfile;
            const profileIdCollision: boolean =
              this.isProfileIdCollision(error);
            const canRetryCollision: boolean =
              hasNoTransaction && createsProfile && profileIdCollision;
            if (canRetryCollision) {
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

  setAvatarObjectKeyIfCurrent = transactional(
    async (
      userId: string,
      objectKey: string,
      expectedObjectKey: Nullable<string>,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      return this.mongoService.execute<ProfileAvatarReferenceChange>(
        async (db: Mongoose): Promise<ProfileAvatarReferenceChange> => {
          const validatedObjectKey: string =
            ProfileAvatarObjectKeySchema.parse(objectKey);
          const model: Model<Profile> = this.getModel(db);
          const avatarMissing: boolean = !expectedObjectKey;
          const document: Nullable<DocumentLike> = avatarMissing
            ? await model
                .findOneAndUpdate(
                  { _id: userId, avatarObjectKey: { $exists: false } },
                  { $set: { avatarObjectKey: validatedObjectKey } },
                  { new: false, session: session ?? undefined },
                )
                .exec()
            : await model
                .findOneAndUpdate(
                  { _id: userId, avatarObjectKey: expectedObjectKey },
                  { $set: { avatarObjectKey: validatedObjectKey } },
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
        "ProfileRepository.setAvatarObjectKeyIfCurrent",
      );
    },
  );

  clearAvatarObjectKeyIfCurrent = transactional(
    async (
      userId: string,
      expectedObjectKey: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      return this.mongoService.execute<ProfileAvatarReferenceChange>(
        async (db: Mongoose): Promise<ProfileAvatarReferenceChange> => {
          const validatedObjectKey: string =
            ProfileAvatarObjectKeySchema.parse(expectedObjectKey);
          const model: Model<Profile> = this.getModel(db);
          const document: Nullable<DocumentLike> = await model
            .findOneAndUpdate(
              { _id: userId, avatarObjectKey: validatedObjectKey },
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
        "ProfileRepository.clearAvatarObjectKeyIfCurrent",
      );
    },
  );
}
