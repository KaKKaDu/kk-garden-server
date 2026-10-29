import { randomInt } from "node:crypto";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import {
  ProfileLookupCodeSchema,
  type ProfileLookupCardResponse,
} from "@kk-garden/shared/schemas";
import type { Nullable, Profile, User } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import type { ProfileLookupRepository } from "@/services/crud/profile-lookup/profile-lookup.repository.ts";
import type { ProfileLookup } from "@/services/crud/profile/types.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import type { AvatarStorageService } from "@/services/avatar/avatar-storage/avatar-storage.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";
import { captureSuccessData } from "@/utils/capture-success-data.ts";
import { requireData } from "@/utils/require-data.ts";
import { Logger } from "@lib/logs/logger.ts";
import { transactional } from "@/types/mongo.types.ts";

const lookupCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const createLookupCode = (): string => {
  let lookupCode: string = "";
  for (let index: number = 0; index < 16; index += 1) {
    lookupCode += lookupCodeAlphabet.charAt(
      randomInt(lookupCodeAlphabet.length),
    );
  }
  return ProfileLookupCodeSchema.parse(lookupCode);
};

export class ProfileLookupService {
  constructor(
    private readonly lookupRepository: ProfileLookupRepository,
    private readonly userService: UserService,
    private readonly mongoService: MongoService,
    private readonly avatarStorage: AvatarStorageService,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.lookupRepository.initialize();
  }

  async ensureOwnerProfile(
    userId: string,
    existingProfile: Nullable<Profile>,
  ): Promise<SuccessDataAny<ProfileLookup>> {
    if (!existingProfile || existingProfile.lookupCode) {
      const result: SuccessDataAny<ProfileLookup> = {
        success: true,
        data: { profile: existingProfile },
      };
      Logger.report("ProfileLookupService.ensureOwnerProfile", result);
      return result;
    }

    const result: SuccessDataAny<ProfileLookup> =
      await this.mongoService.execute(async (db): Promise<ProfileLookup> => {
        const session = await db.startSession();
        try {
          const transactionResult = await session.withTransaction(
            async (): Promise<ProfileLookup> => {
              const current: ProfileLookup = requireData(
                await this.lookupRepository.getProfileById(userId, session),
                "Profile lookup failed",
              );
              if (!current.profile || current.profile.lookupCode) {
                return current;
              }

              await this.tombstones.assertMutationAllowed(userId, session);
              return requireData(
                await this.lookupRepository.setCodeIfMissing(
                  userId,
                  createLookupCode(),
                  session,
                ),
                "Profile lookup code could not be assigned",
              );
            },
          );
          if (!transactionResult) {
            throw new AppError({
              status: 503,
              message: "Profile lookup code transaction did not complete",
            });
          }
          return transactionResult;
        } finally {
          await session.endSession();
        }
      }, "ProfileLookupService.ensureOwnerProfile");
    Logger.report("ProfileLookupService.ensureOwnerProfile", result);
    return result;
  }

  async resolveCard(
    requesterId: string,
    lookupCode: string,
  ): Promise<SuccessDataAny<ProfileLookupCardResponse>> {
    try {
      requireData(
        await this.lookupRepository.consumeLimit(requesterId),
        "Profile lookup rate limit could not be checked",
      );

      const profileLookup: ProfileLookup = requireData(
        await this.lookupRepository.findByLookupCode(lookupCode),
        "Profile lookup failed",
      );
      const profile: Nullable<Profile> = profileLookup.profile;
      if (!profile?.lookupCode) {
        throw new AppError({
          status: 404,
          message: "Profile not found",
        });
      }

      await this.tombstones.assertNotDeletedAsNotFound(
        profile._id,
        "Profile not found",
      );

      const targetResult: SuccessDataAny<User> =
        await this.userService.getById.direct(profile._id);
      if (!targetResult.success || !targetResult.data) {
        const targetError = targetResult.success
          ? undefined
          : targetResult.errors[0];
        if (targetError?.status === 404) {
          throw new AppError({
            status: 404,
            message: "Profile not found",
          });
        }
        throw new AppError({
          status: targetError?.status ?? 503,
          message: "Profile owner status could not be checked",
        });
      }
      if (targetResult.data.status !== "active") {
        throw new AppError({
          status: 404,
          message: "Profile not found",
        });
      }

      const avatar: ProfileLookupCardResponse["avatar"] =
        profile.avatarObjectKey
          ? requireData(
              await this.avatarStorage.signRead(profile.avatarObjectKey),
              "Avatar delivery could not be signed",
            )
          : null;
      const result: SuccessDataAny<ProfileLookupCardResponse> = {
        success: true,
        data: { displayName: profile.displayName, avatar },
      };
      Logger.report("ProfileLookupService.resolveCard", result);
      return result;
    } catch (error: unknown) {
      const result: SuccessDataAny<ProfileLookupCardResponse> =
        handleError<ProfileLookupCardResponse>(error);
      Logger.report("ProfileLookupService.resolveCard", result);
      return result;
    }
  }

  async resolveUserIdByLookupCode(
    requesterId: string,
    lookupCode: string,
  ): Promise<SuccessDataAny<{ userId: string }>> {
    try {
      requireData(
        await this.lookupRepository.consumeLimit(requesterId),
        "Profile lookup rate limit could not be checked",
      );
      const profile: Nullable<Profile> = requireData(
        await this.lookupRepository.findByLookupCode(lookupCode),
        "Profile lookup failed",
      ).profile;
      if (!profile?.lookupCode) {
        throw new AppError({ status: 404, message: "Profile not found" });
      }

      await this.tombstones.assertNotDeletedAsNotFound(
        profile._id,
        "Profile not found",
      );
      const targetResult: SuccessDataAny<User> =
        await this.userService.getById.direct(profile._id);
      if (!targetResult.success || !targetResult.data) {
        const targetError = targetResult.success
          ? undefined
          : targetResult.errors[0];
        if (targetError?.status === 404) {
          throw new AppError({ status: 404, message: "Profile not found" });
        }
        throw new AppError({
          status: targetError?.status ?? 503,
          message: "Profile owner status could not be checked",
        });
      }
      if (targetResult.data.status !== "active") {
        throw new AppError({ status: 404, message: "Profile not found" });
      }

      const result: SuccessDataAny<{ userId: string }> = {
        success: true,
        data: { userId: profile._id },
      };
      Logger.report("ProfileLookupService.resolveUserIdByLookupCode", result);
      return result;
    } catch (error: unknown) {
      const result: SuccessDataAny<{ userId: string }> = handleError<{
        userId: string;
      }>(error);
      Logger.report("ProfileLookupService.resolveUserIdByLookupCode", result);
      return result;
    }
  }

  getCardForUserId(
    userId: string,
  ): Promise<SuccessDataAny<ProfileLookupCardResponse>> {
    return captureSuccessData(
      "ProfileLookupService.getCardForUserId",
      async (): Promise<ProfileLookupCardResponse> => {
        await this.tombstones.assertNotDeletedAsNotFound(
          userId,
          "Profile not found",
        );
        const user: User = requireData(
          await this.userService.getById.direct(userId),
          "Profile status could not be checked",
        );
        if (user.status !== "active") {
          throw new AppError({ status: 404, message: "Profile not found" });
        }

        const profile: Nullable<Profile> = requireData(
          await this.lookupRepository.getProfileById(userId, null),
          "Profile lookup failed",
        ).profile;
        const avatar: ProfileLookupCardResponse["avatar"] =
          profile?.avatarObjectKey
            ? requireData(
                await this.avatarStorage.signRead(profile.avatarObjectKey),
                "Avatar delivery could not be signed",
              )
            : null;
        return {
          displayName: profile?.displayName ?? "Garden visitor",
          avatar,
        };
      },
    );
  }

  invalidateLookupCode = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<{ invalidated: boolean }>> => {
      return this.lookupRepository.invalidateLookupCode(userId, session);
    },
  );
}
