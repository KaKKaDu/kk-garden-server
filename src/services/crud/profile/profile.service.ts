import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import {
  DEFAULT_PROFILE_ACCENT_HEX,
  createProfilePalette,
} from "@kk-garden/shared/constants";
import type { ProfileOwnerResponse } from "@kk-garden/shared/schemas";
import type { ClientSession } from "mongoose";
import type { Nullable, Profile, User } from "@kk-garden/shared/types";
import type { ProfileRepository } from "@/services/crud/profile/profile.repository.js";
import type {
  ProfileAvatarReferenceChange,
  ProfileLookup,
  ProfileUpdateFields,
} from "@/services/crud/profile/types.js";
import type { UserService } from "@/services/crud/user/user.service.js";
import { transactional } from "@/types/mongo.types.js";
import { Logger } from "@lib/logs/logger.js";

export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly userService: UserService,
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

      const profile: Nullable<Profile> = profileResult.data.profile;
      const customHex: Nullable<string> = profile?.accentHex;
      const palette = createProfilePalette(
        customHex ?? DEFAULT_PROFILE_ACCENT_HEX,
      );
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
            avatar: null,
          }
        : {
            configured: false,
            accent,
            avatar: null,
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
      return this.repository.updateFields(userId, fields, session);
    },
  );

  setAvatarObjectKey = transactional(
    async (
      userId: string,
      objectKey: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      return this.repository.setAvatarObjectKey(userId, objectKey, session);
    },
  );

  clearAvatarObjectKey = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<ProfileAvatarReferenceChange>> => {
      return this.repository.clearAvatarObjectKey(userId, session);
    },
  );
}
