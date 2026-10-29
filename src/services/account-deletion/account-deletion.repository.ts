import { ObjectId } from "mongodb";
import type { ClientSession, Mongoose } from "mongoose";
import { type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  Nullable,
  Ownership,
  Profile,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getConfiguredMongoDatabase } from "@/services/mongo/mongo.repository.ts";
import type {
  AccountDeletionCascadeRecords,
  AccountDeletionSnapshot,
  AccountDeletionUserDeleteResult,
  AccountDeletionUserDocument,
  AccountDeletionUserLookup,
} from "@/services/account-deletion/types.ts";

const mongoUserId = (userId: string): ObjectId | string =>
  ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

export class AccountDeletionRepository {
  constructor(private readonly mongoService: MongoService) {}

  getSnapshot(
    userId: string,
  ): Promise<SuccessDataAny<AccountDeletionSnapshot>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<AccountDeletionSnapshot> => {
        const db = getConfiguredMongoDatabase(connection);
        const user = await db
          .collection<AccountDeletionUserDocument>("user")
          .findOne({ _id: mongoUserId(userId) });
        const [profile, uploads]: [
          Nullable<Profile>,
          ProfileAvatarUploadSession[],
        ] = await Promise.all([
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
      "AccountDeletionRepository.getSnapshot",
    );
  }

  getUserForDeletion(
    userId: string,
    session: ClientSession,
  ): Promise<SuccessDataAny<AccountDeletionUserLookup>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<AccountDeletionUserLookup> => {
        const user = await getConfiguredMongoDatabase(connection)
          .collection<AccountDeletionUserDocument>("user")
          .findOne({ _id: mongoUserId(userId) }, { session });
        return { user };
      },
      "AccountDeletionRepository.getUserForDeletion",
    );
  }

  getCascadeRecords(
    userId: string,
    session: ClientSession,
  ): Promise<SuccessDataAny<AccountDeletionCascadeRecords>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<AccountDeletionCascadeRecords> => {
        const db = getConfiguredMongoDatabase(connection);
        const ownerships = await db
          .collection<Pick<Ownership, "signatureId">>("ownerships")
          .find({ userId }, { projection: { signatureId: 1 }, session })
          .toArray();
        const signatureIds: string[] = ownerships.map(
          (ownership) => ownership.signatureId,
        );
        const signatures = signatureIds.length
          ? await db
              .collection<{ _id: string; visualisationId: string }>(
                "signatures",
              )
              .find(
                { _id: { $in: signatureIds } },
                { projection: { visualisationId: 1 }, session },
              )
              .toArray()
          : [];
        return {
          signatureIds,
          visualisationIds: [
            ...new Set(
              signatures.map((signature) => signature.visualisationId),
            ),
          ],
        };
      },
      "AccountDeletionRepository.getCascadeRecords",
    );
  }

  deleteGardenRecords(
    userId: string,
    records: AccountDeletionCascadeRecords,
    session: ClientSession,
  ): Promise<SuccessDataAny<{ deleted: true }>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<{ deleted: true }> => {
        const db = getConfiguredMongoDatabase(connection);
        await db.collection("ownerships").deleteMany({ userId }, { session });
        if (records.signatureIds.length) {
          await db
            .collection<{ _id: string; visualisationId: string }>("signatures")
            .deleteMany({ _id: { $in: records.signatureIds } }, { session });
        }
        if (records.visualisationIds.length) {
          await db
            .collection<{ _id: string }>("visualisations")
            .deleteMany(
              { _id: { $in: records.visualisationIds } },
              { session },
            );
        }
        await db
          .collection("visualisations_pending")
          .deleteMany({ ownerId: userId }, { session });
        return { deleted: true };
      },
      "AccountDeletionRepository.deleteGardenRecords",
    );
  }

  deleteProfile(
    userId: string,
    session: ClientSession,
  ): Promise<SuccessDataAny<{ deleted: true }>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<{ deleted: true }> => {
        await getConfiguredMongoDatabase(connection)
          .collection<{ _id: string }>("profiles")
          .deleteOne({ _id: userId }, { session });
        return { deleted: true };
      },
      "AccountDeletionRepository.deleteProfile",
    );
  }

  deleteAuthRecordsAndUser(
    userId: string,
    email: string,
    session: ClientSession,
  ): Promise<SuccessDataAny<AccountDeletionUserDeleteResult>> {
    return this.mongoService.execute(
      async (
        connection: Mongoose,
      ): Promise<AccountDeletionUserDeleteResult> => {
        const db = getConfiguredMongoDatabase(connection);
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

        const normalizedEmail = email.toLowerCase();
        const escapedEmail = normalizedEmail.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        const verification = db.collection<{ _id: ObjectId | string }>(
          "verification",
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

        const deletedUser = await db
          .collection<AccountDeletionUserDocument>("user")
          .deleteOne({ _id: rawUserId }, { session });
        return { deletedCount: deletedUser.deletedCount };
      },
      "AccountDeletionRepository.deleteAuthRecordsAndUser",
    );
  }
}
