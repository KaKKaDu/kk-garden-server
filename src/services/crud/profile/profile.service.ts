import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import {
  DEFAULT_PROFILE_ACCENT_HEX,
  createProfilePalette,
} from "@kk-garden/shared/constants";
import type {
  ProfileAvatarDeleteResponse,
  ProfileOwnerResponse,
} from "@kk-garden/shared/schemas";
import type { ClientSession } from "mongoose";
import type { Nullable, Profile, User } from "@kk-garden/shared/types";
import type { ProfileRepository } from "@/services/crud/profile/profile.repository.ts";
import type {
  ProfileAvatarFinalizeCommit,
  ProfileAvatarFinalizeInput,
  ProfileAvatarReferenceChange,
  ProfileLookup,
  ProfileUpdateFields,
} from "@/services/crud/profile/types.ts";
import type { ProfileLookupService } from "@/services/crud/profile-lookup/profile-lookup.service.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import type { AvatarUploadRepository } from "@/services/avatar/avatar-upload/avatar-upload.repository.ts";
import type { AvatarStorageService } from "@/services/avatar/avatar-storage/avatar-storage.service.ts";
import type { AvatarCleanupService } from "@/services/avatar/avatar-cleanup/avatar-cleanup.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { transactional } from "@/types/mongo.types.ts";
import { requireData } from "@/utils/require-data.ts";
import { Logger } from "@lib/logs/logger.ts";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";

export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly userService: UserService,
    private readonly uploadRepository: AvatarUploadRepository,
    private readonly mongoService: MongoService,
    private readonly avatarStorage: AvatarStorageService,
    private readonly avatarCleanup: AvatarCleanupService,
    private readonly tombstones: AccountDeletionTombstoneService,
    private readonly lookupService: ProfileLookupService,
  ) {}

  async getProfile(
    userId: string,
  ): Promise<SuccessDataAny<ProfileOwnerResponse>> {
    try {
      const userResult: SuccessDataAny<User> =
        await this.userService.getById.direct(userId);
      if (!userResult.success) {
        const failedResult: SuccessDataAny<ProfileOwnerResponse> = {
          success: false,
          errors: userResult.errors,
        };
        Logger.report("ProfileService.getProfile", failedResult);
        return failedResult;
      }
      if (!userResult.data) {
        throw new AppError({
          status: 500,
          message: "Profile owner lookup returned no data",
        });
      }
      if (userResult.data.status === "deleted") {
        throw new AppError({
          status: 403,
          message: "Deleted accounts cannot access profiles",
        });
      }

      const profileResult: SuccessDataAny<ProfileLookup> =
        await this.getById.direct(userId);
      if (!profileResult.success) {
        const failedResult: SuccessDataAny<ProfileOwnerResponse> = {
          success: false,
          errors: profileResult.errors,
        };
        Logger.report("ProfileService.getProfile", failedResult);
        return failedResult;
      }
      if (!profileResult.data) {
        throw new AppError({
          status: 500,
          message: "Profile lookup returned no data",
        });
      }

      const ownerProfileResult: SuccessDataAny<ProfileLookup> =
        await this.lookupService.ensureOwnerProfile(
          userId,
          profileResult.data.profile,
        );
      if (!ownerProfileResult.success) {
        const failedResult: SuccessDataAny<ProfileOwnerResponse> = {
          success: false,
          errors: ownerProfileResult.errors,
        };
        Logger.report("ProfileService.getProfile", failedResult);
        return failedResult;
      }
      if (!ownerProfileResult.data) {
        throw new AppError({
          status: 500,
          message: "Profile lookup code assignment returned no data",
        });
      }
      const profile: Nullable<Profile> = ownerProfileResult.data.profile;
      const customHex: Nullable<string> = profile?.accentHex;
      const palette = createProfilePalette(
        customHex ?? DEFAULT_PROFILE_ACCENT_HEX,
      );
      const avatar: ProfileOwnerResponse["avatar"] = profile?.avatarObjectKey
        ? requireData(
            await this.avatarStorage.signRead(profile.avatarObjectKey),
            "Avatar delivery could not be signed",
          )
        : null;
      const accent: ProfileOwnerResponse["accent"] = {
        ...(customHex ? { customHex } : {}),
        effectiveHex: palette.accent,
      };
      const response: ProfileOwnerResponse = profile
        ? {
            configured: true,
            displayName: profile.displayName,
            ...(profile.bio ? { bio: profile.bio } : {}),
            accent,
            avatar,
            lookupCode: profile?.lookupCode ?? null,
          }
        : {
            configured: false,
            accent,
            avatar: null,
            lookupCode: null,
          };

      const result: SuccessDataAny<ProfileOwnerResponse> = {
        success: true,
        data: response,
      };
      Logger.report("ProfileService.getProfile", result);
      return result;
    } catch (error: unknown) {
      const result: SuccessDataAny<ProfileOwnerResponse> =
        handleError<ProfileOwnerResponse>(error);
      Logger.report("ProfileService.getProfile", result);
      return result;
    }
  }

  async updateProfile(
    userId: string,
    fields: ProfileUpdateFields,
  ): Promise<SuccessDataAny<ProfileOwnerResponse>> {
    try {
      const updateResult = await this.mongoService.execute<{ updated: true }>(
        async (db): Promise<{ updated: true }> => {
          const session = await db.startSession();
          try {
            const transactionResult = await session.withTransaction(
              async (): Promise<{ updated: true }> => {
                const user: User = requireData(
                  await this.userService.getById(userId, session),
                  "Profile owner lookup failed",
                );
                if (user.status !== "active") {
                  throw new AppError({
                    status: 403,
                    message: "Only active accounts can update profiles",
                  });
                }

                const updated: ProfileLookup = requireData(
                  await this.updateFields(userId, fields, session),
                  "Profile update failed",
                );
                if (!updated.profile) {
                  throw new AppError({
                    status: 400,
                    message: "A display name is required to create a profile",
                  });
                }
                return { updated: true };
              },
            );
            if (!transactionResult) {
              throw new AppError({
                status: 503,
                message: "Profile update transaction did not complete",
              });
            }
            return transactionResult;
          } finally {
            await session.endSession();
          }
        },
        "ProfileService.updateProfile",
      );
      if (!updateResult.success || !updateResult.data) {
        const failedResult: SuccessDataAny<ProfileOwnerResponse> = {
          success: false,
          errors: updateResult.success
            ? [
                new AppError({
                  status: 503,
                  message: "Profile update transaction returned no data",
                }),
              ]
            : updateResult.errors,
        };
        Logger.report("ProfileService.updateProfile", failedResult);
        return failedResult;
      }

      return await this.getProfile(userId);
    } catch (error: unknown) {
      const result: SuccessDataAny<ProfileOwnerResponse> =
        handleError<ProfileOwnerResponse>(error);
      Logger.report("ProfileService.updateProfile", result);
      return result;
    }
  }

  async removeAvatar(
    userId: string,
  ): Promise<SuccessDataAny<ProfileAvatarDeleteResponse>> {
    let result: SuccessDataAny<ProfileAvatarDeleteResponse>;
    try {
      const user: User = requireData(
        await this.userService.getById.direct(userId),
        "Avatar owner lookup failed",
      );
      if (user.status !== "active") {
        throw new AppError({
          status: 403,
          message: "Only active accounts can remove avatars",
        });
      }

      const profile: Nullable<Profile> = requireData(
        await this.getById.direct(userId),
        "Avatar profile lookup failed",
      ).profile;
      const objectKey: Nullable<string> = profile?.avatarObjectKey;
      if (!objectKey) {
        result = { success: true, data: { success: true } };
      } else {
        requireData(
          await this.avatarCleanup.enqueue({
            ownerId: userId,
            target: { kind: "displaced-avatar", objectKey },
          }),
          "Avatar cleanup could not be scheduled",
        );
        const clearResult =
          await this.mongoService.execute<ProfileAvatarReferenceChange>(
            async (db): Promise<ProfileAvatarReferenceChange> => {
              const session = await db.startSession();
              try {
                const transactionResult = await session.withTransaction(
                  async (): Promise<ProfileAvatarReferenceChange> => {
                    const currentUser: User = requireData(
                      await this.userService.getById(userId, session),
                      "Avatar owner lookup failed",
                    );
                    if (currentUser.status !== "active") {
                      throw new AppError({
                        status: 403,
                        message: "Only active accounts can remove avatars",
                      });
                    }
                    return requireData(
                      await this.clearAvatarObjectKeyIfCurrent(
                        userId,
                        objectKey,
                        session,
                      ),
                      "Profile avatar could not be cleared",
                    );
                  },
                );
                if (!transactionResult) {
                  throw new AppError({
                    status: 503,
                    message: "Avatar removal transaction did not complete",
                  });
                }
                return transactionResult;
              } finally {
                await session.endSession();
              }
            },
            "ProfileService.removeAvatar",
          );
        const cleared: ProfileAvatarReferenceChange = requireData(
          clearResult,
          "Profile avatar could not be cleared",
        );
        if (!cleared.previousProfile) {
          const currentProfile: Nullable<Profile> = requireData(
            await this.getById.direct(userId),
            "Avatar profile lookup failed",
          ).profile;
          if (currentProfile?.avatarObjectKey) {
            throw new AppError({
              status: 409,
              message: "The profile avatar changed; retry removal",
            });
          }
        }
        result = { success: true, data: { success: true } };
      }
    } catch (error: unknown) {
      result = handleError<ProfileAvatarDeleteResponse>(error);
    }
    Logger.report("ProfileService.removeAvatar", result);
    return result;
  }

  async finalizeAvatar(
    input: ProfileAvatarFinalizeInput,
  ): Promise<SuccessDataAny<ProfileAvatarFinalizeCommit>> {
    return this.mongoService.execute(
      async (db): Promise<ProfileAvatarFinalizeCommit> => {
        const session = await db.startSession();
        try {
          const transactionResult: SuccessDataAny<ProfileAvatarFinalizeCommit> =
            await session.withTransaction(
              async (): Promise<
                SuccessDataAny<ProfileAvatarFinalizeCommit>
              > => {
                const user: User = requireData(
                  await this.userService.getById(input.ownerId, session),
                  "Avatar owner lookup failed",
                );
                if (user.status !== "active") {
                  throw new AppError({
                    status: 403,
                    message: "Only active accounts can finalize avatars",
                  });
                }

                const profile: Nullable<Profile> = requireData(
                  await this.getById(input.ownerId, session),
                  "Avatar profile lookup failed",
                ).profile;
                if (!profile?.displayName) {
                  throw new AppError({
                    status: 409,
                    message:
                      "Save a profile display name before finalizing an avatar",
                  });
                }
                if (
                  (profile.avatarObjectKey ?? null) !==
                  input.expectedAvatarObjectKey
                ) {
                  throw new AppError({
                    status: 409,
                    message: "The profile avatar changed; retry finalization",
                  });
                }

                const committedAt: Date = new Date();
                const avatarResult = {
                  objectKey: input.candidateObjectKey,
                  width: input.width,
                  height: input.height,
                  committedAt,
                };
                const completed = requireData(
                  await this.uploadRepository.complete(
                    {
                      uploadId: input.uploadId,
                      ownerId: input.ownerId,
                      claimToken: input.claimToken,
                      candidateObjectKey: input.candidateObjectKey,
                      result: avatarResult,
                      committedAt,
                    },
                    session,
                  ),
                  "Avatar completion could not be recorded",
                );
                if (!completed.updated) {
                  throw new AppError({
                    status: 409,
                    message: "Avatar finalization claim expired or changed",
                  });
                }

                const changed = requireData(
                  await this.setAvatarObjectKeyIfCurrent(
                    input.ownerId,
                    input.candidateObjectKey,
                    input.expectedAvatarObjectKey,
                    session,
                  ),
                  "Profile avatar update failed",
                );
                if (!changed.previousProfile) {
                  throw new AppError({
                    status: 409,
                    message: "Profile avatar changed during finalization",
                  });
                }
                return {
                  success: true,
                  data: {
                    result: avatarResult,
                    displacedAvatarObjectKey:
                      changed.displacedAvatarObjectKey ?? null,
                  },
                };
              },
            );
          return requireData(
            transactionResult,
            "Avatar finalization transaction failed",
          );
        } finally {
          await session.endSession();
        }
      },
      "ProfileService.finalizeAvatar",
    );
  }

  getById = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileLookup>> => {
      return this.repository.getById(userId, session);
    },
  );

  updateFields = transactional(
    async (
      userId: string,
      fields: ProfileUpdateFields,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileLookup>> => {
      await this.tombstones.assertMutationAllowed(userId, session);
      return this.repository.updateFields(userId, fields, session);
    },
  );

  setAvatarObjectKey = transactional(
    async (
      userId: string,
      objectKey: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      await this.tombstones.assertMutationAllowed(userId, session);
      return this.repository.setAvatarObjectKey(userId, objectKey, session);
    },
  );

  setAvatarObjectKeyIfCurrent = transactional(
    async (
      userId: string,
      objectKey: string,
      expectedObjectKey: Nullable<string>,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      await this.tombstones.assertMutationAllowed(userId, session);
      return this.repository.setAvatarObjectKeyIfCurrent(
        userId,
        objectKey,
        expectedObjectKey,
        session,
      );
    },
  );

  clearAvatarObjectKeyIfCurrent = transactional(
    async (
      userId: string,
      expectedObjectKey: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      await this.tombstones.assertMutationAllowed(userId, session);
      return this.repository.clearAvatarObjectKeyIfCurrent(
        userId,
        expectedObjectKey,
        session,
      );
    },
  );
}
