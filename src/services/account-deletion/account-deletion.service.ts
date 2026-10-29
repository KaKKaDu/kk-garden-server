import { ObjectId } from "mongodb";
import type { ClientSession, Mongoose } from "mongoose";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  AvatarCleanupTarget,
  Nullable,
  Ownership,
  Profile,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";
import type { AvatarCleanupService } from "@/services/avatar/avatar-cleanup/avatar-cleanup.service.ts";
import type { GardenSharingRepository } from "@/services/crud/garden-sharing/garden-sharing.repository.ts";
import type { ProfileLookupService } from "@/services/crud/profile-lookup/profile-lookup.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getConfiguredMongoDatabase } from "@/services/mongo/mongo.repository.ts";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";
import { requireData } from "@/utils/require-data.ts";

type UserDocument = {
  _id: ObjectId | string;
  email: string;
  updatedAt?: Date;
};

type DeletionSnapshot = {
  user: Nullable<UserDocument>;
  profile: Nullable<Profile>;
  uploads: ProfileAvatarUploadSession[];
};

type DeletionResult = {
  deleted: true;
};

const mongoUserId = (userId: string): ObjectId | string =>
  ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

export class AccountDeletionService {
  constructor(
    private readonly mongoService: MongoService,
    private readonly tombstones: AccountDeletionTombstoneService,
    private readonly avatarCleanup: AvatarCleanupService,
    private readonly profileLookup: ProfileLookupService,
    private readonly gardenSharingRepository: GardenSharingRepository,
  ) {}

  async deleteAccount(userId: string): Promise<SuccessDataAny<DeletionResult>> {
    try {
      const snapshot = requireData(
        await this.mongoService.execute(
          async (connection: Mongoose): Promise<DeletionSnapshot> => {
            const db = getConfiguredMongoDatabase(connection);
            const users = db.collection<UserDocument>("user");
            const user = await users.findOne({ _id: mongoUserId(userId) });
            const [profile, uploads] = await Promise.all([
              db.collection<Profile>("profiles").findOne({ _id: userId }),
              db
                .collection<ProfileAvatarUploadSession>(
                  "profile_avatar_upload_sessions",
                )
                .find({ ownerId: userId })
                .toArray(),
            ]);
            return { user, profile, uploads };
          },
          "AccountDeletionService.readSnapshot",
        ),
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
                const db = getConfiguredMongoDatabase(connection);
                const users = db.collection<UserDocument>("user");
                const user = await users.findOne(
                  { _id: mongoUserId(userId) },
                  { session },
                );
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

                const ownershipsCollection =
                  db.collection<Ownership>("ownerships");
                const signaturesCollection = db.collection<{
                  _id: string;
                  visualisationId: string;
                }>("signatures");
                const ownerships = await ownershipsCollection
                  .find({ userId }, { session })
                  .toArray();
                const signatureIds = ownerships.map(
                  (ownership) => ownership.signatureId,
                );
                const signatures = signatureIds.length
                  ? await signaturesCollection
                      .find({ _id: { $in: signatureIds } }, { session })
                      .toArray()
                  : [];
                const visualisationIds = [
                  ...new Set(
                    signatures.map((signature) => signature.visualisationId),
                  ),
                ];

                await ownershipsCollection.deleteMany({ userId }, { session });
                if (signatureIds.length) {
                  await signaturesCollection.deleteMany(
                    { _id: { $in: signatureIds } },
                    { session },
                  );
                }
                if (visualisationIds.length) {
                  await db
                    .collection<{ _id: string }>("visualisations")
                    .deleteMany(
                      { _id: { $in: visualisationIds } },
                      { session },
                    );
                }
                await db
                  .collection("visualisations_pending")
                  .deleteMany({ ownerId: userId }, { session });
                await this.purgeSharingForUser(userId, session);
                await db
                  .collection<{ _id: string }>("profiles")
                  .deleteOne({ _id: userId }, { session });

                const rawUserId = mongoUserId(userId);
                await db
                  .collection("session")
                  .deleteMany({ userId: rawUserId }, { session });
                await db
                  .collection("account")
                  .deleteMany({ userId: rawUserId }, { session });
                await db
                  .collection("passkey")
                  .deleteMany({ userId: rawUserId }, { session });

                const verification = db.collection("verification");
                const email = user.email.toLowerCase();
                const escapedEmail = email.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&",
                );
                const verificationIds = await verification
                  .find(
                    {
                      identifier: {
                        $regex: `^(?:sign-in|email-verification|forget-password)-otp-${escapedEmail}$|^change-email-otp-${escapedEmail}-`,
                        $options: "i",
                      },
                    },
                    { projection: { _id: 1 }, session },
                  )
                  .toArray();
                if (verificationIds.length) {
                  await verification.deleteMany(
                    { _id: { $in: verificationIds.map(({ _id }) => _id) } },
                    { session },
                  );
                }

                const deletedUser = await users.deleteOne(
                  { _id: rawUserId },
                  { session },
                );
                if (deletedUser.deletedCount !== 1) {
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
    snapshot: DeletionSnapshot,
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
