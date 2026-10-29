import type { ClientSession, Mongoose } from "mongoose";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { AvatarCleanupTarget, Nullable } from "@kk-garden/shared/types";
import type { AvatarCleanupService } from "@/services/avatar/avatar-cleanup/avatar-cleanup.service.ts";
import type { GardenSharingRepository } from "@/services/crud/garden-sharing/garden-sharing.repository.ts";
import type { ProfileLookupService } from "@/services/crud/profile-lookup/profile-lookup.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { AccountDeletionRepository } from "@/services/account-deletion/account-deletion.repository.ts";
import type {
  AccountDeletionCascadeRecords,
  AccountDeletionSnapshot,
  AccountDeletionUserDocument,
} from "@/services/account-deletion/types.ts";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/account-deletion-tombstone.service.ts";
import { requireData } from "@/utils/require-data.ts";

type DeletionResult = {
  deleted: true;
};

export class AccountDeletionService {
  constructor(
    private readonly mongoService: MongoService,
    private readonly repository: AccountDeletionRepository,
    private readonly tombstones: AccountDeletionTombstoneService,
    private readonly avatarCleanup: AvatarCleanupService,
    private readonly profileLookup: ProfileLookupService,
    private readonly gardenSharingRepository: GardenSharingRepository,
  ) {}

  async deleteAccount(userId: string): Promise<SuccessDataAny<DeletionResult>> {
    try {
      const snapshot: AccountDeletionSnapshot = requireData(
        await this.repository.getSnapshot(userId),
        "Account state could not be loaded",
      );

      if (!snapshot.user) {
        throw new AppError({ status: 404, message: "Account not found" });
      }

      const cleanupTargets = this.getAvatarCleanupTargets(snapshot);
      for (const target of cleanupTargets) {
        requireData(
          await this.avatarCleanup.enqueue({ ownerId: userId, target }),
          "Avatar cleanup could not be queued",
        );
      }

      return await this.mongoService.execute(
        async (connection: Mongoose): Promise<DeletionResult> => {
          const session: ClientSession = await connection.startSession();
          try {
            const result = await session.withTransaction(
              async (): Promise<DeletionResult> => {
                const userLookup = requireData(
                  await this.repository.getUserForDeletion(userId, session),
                  "Account state could not be loaded",
                );
                const user: Nullable<AccountDeletionUserDocument> =
                  userLookup.user;
                if (!user) {
                  throw new AppError({
                    status: 404,
                    message: "Account not found",
                  });
                }
                if (
                  user.updatedAt?.getTime() !==
                  snapshot.user?.updatedAt?.getTime()
                ) {
                  throw new AppError({
                    status: 409,
                    message:
                      "Account changed while deletion was being prepared; retry the request",
                  });
                }

                const cascadeRecords: AccountDeletionCascadeRecords =
                  requireData(
                    await this.repository.getCascadeRecords(userId, session),
                    "Account records could not be loaded",
                  );
                requireData(
                  await this.repository.deleteGardenRecords(
                    userId,
                    cascadeRecords,
                    session,
                  ),
                  "Garden records could not be deleted",
                );
                await this.purgeSharingForUser(userId, session);
                requireData(
                  await this.repository.deleteProfile(userId, session),
                  "Profile could not be deleted",
                );

                const userDeleteResult = requireData(
                  await this.repository.deleteAuthRecordsAndUser(
                    userId,
                    user.email,
                    session,
                  ),
                  "Authentication records could not be deleted",
                );
                if (userDeleteResult.deletedCount !== 1) {
                  throw new AppError({
                    status: 409,
                    message: "Account changed during deletion",
                  });
                }
                await this.tombstones.create(userId, new Date(), session);
                return { deleted: true };
              },
            );
            if (!result) {
              throw new AppError({
                status: 500,
                message: "Account deletion transaction returned no result",
              });
            }
            return result;
          } finally {
            await session.endSession();
          }
        },
        "AccountDeletionService.deleteAccount",
      );
    } catch (error: unknown) {
      return {
        success: false,
        errors: [
          error instanceof AppError
            ? error
            : new AppError({
                status: 500,
                message: "Account deletion failed",
              }),
        ],
      };
    }
  }

  private async purgeSharingForUser(
    userId: string,
    session: ClientSession,
  ): Promise<void> {
    requireData(
      await this.profileLookup.invalidateLookupCode(userId, session),
      "Profile lookup code could not be invalidated",
    );
    requireData(
      await this.gardenSharingRepository.deleteForAccount(userId, session),
      "Garden sharing records could not be deleted",
    );
  }

  private getAvatarCleanupTargets(
    snapshot: AccountDeletionSnapshot,
  ): AvatarCleanupTarget[] {
    const targets = new Map<string, AvatarCleanupTarget>();
    for (const upload of snapshot.uploads) {
      targets.set(upload.stagingObjectKey, {
        kind: "staging",
        uploadId: upload._id,
        objectKey: upload.stagingObjectKey,
      });
      const finalObjectKey =
        upload.state === "processing"
          ? upload.candidateObjectKey
          : upload.state === "completed"
            ? upload.result.objectKey
            : undefined;
      if (finalObjectKey) {
        targets.set(finalObjectKey, {
          kind: "candidate",
          uploadId: upload._id,
          objectKey: finalObjectKey,
        });
      }
    }
    const profileAvatar = snapshot.profile?.avatarObjectKey;
    if (profileAvatar && !targets.has(profileAvatar)) {
      targets.set(profileAvatar, {
        kind: "displaced-avatar",
        objectKey: profileAvatar,
      });
    }
    return [...targets.values()];
  }
}
