import { ObjectId } from "mongodb";
import type { ClientSession, Mongoose } from "mongoose";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import {
  ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
  AccountDeletionTombstoneSchema,
  type AccountDeletionTombstone,
} from "@/schemas/models/account-deletion-tombstone.mongo.schema.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getConfiguredMongoDatabase } from "@/services/mongo/mongo.repository.ts";
import { transactional } from "@/types/mongo.types.ts";

type AccountDeletionTombstoneLookup = {
  deleted: boolean;
};

type AccountMutationFence = {
  allowed: boolean;
};

type BetterAuthUserFenceDocument = {
  _id: ObjectId | string;
  updatedAt?: Date;
};

const getMongoUserId = (userId: string): ObjectId | string =>
  ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

export class AccountDeletionTombstoneRepository {
  constructor(private readonly mongoService: MongoService) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<{ ready: true }> => {
        await getConfiguredMongoDatabase(connection)
          .collection<AccountDeletionTombstone>(
            ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
          )
          .createIndex(
            { userId: 1 },
            {
              name: "unique_account_deletion_tombstone_user_id",
              unique: true,
            },
          );
        return { ready: true };
      },
      "AccountDeletionTombstoneRepository.initialize",
      false,
    );
  }

  isDeleted = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<AccountDeletionTombstoneLookup>> =>
      this.mongoService.execute(
        async (
          connection: Mongoose,
        ): Promise<AccountDeletionTombstoneLookup> => {
          const tombstone = await getConfiguredMongoDatabase(connection)
            .collection<AccountDeletionTombstone>(
              ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
            )
            .findOne(
              { userId },
              {
                projection: { _id: 0, userId: 1, deletedAt: 1 },
                session: session ?? undefined,
              },
            );
          if (tombstone) {
            AccountDeletionTombstoneSchema.parse({
              userId: tombstone.userId,
              deletedAt: tombstone.deletedAt,
            });
          }
          return { deleted: tombstone !== null };
        },
        "AccountDeletionTombstoneRepository.isDeleted",
        false,
      ),
  );

  fenceMutation = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<AccountMutationFence>> => {
      if (!session) {
        return {
          success: false,
          errors: [
            new AppError({
              status: 500,
              message: "Account mutation fence requires a Mongo transaction",
            }),
          ],
        };
      }

      return this.mongoService.execute(
        async (connection: Mongoose): Promise<AccountMutationFence> => {
          const db = getConfiguredMongoDatabase(connection);
          const tombstone = await db
            .collection<AccountDeletionTombstone>(
              ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
            )
            .findOne({ userId }, { projection: { _id: 1 }, session });
          if (tombstone) {
            return { allowed: false };
          }

          const userCollection =
            db.collection<BetterAuthUserFenceDocument>("user");
          const mongoUserId = getMongoUserId(userId);
          const user = await userCollection.findOne(
            { _id: mongoUserId },
            { projection: { updatedAt: 1 }, session },
          );
          if (!user) {
            return { allowed: false };
          }

          const nextUpdatedAt = new Date(
            Math.max(Date.now(), (user.updatedAt?.getTime() ?? 0) + 1),
          );
          const updatedAtFilter = user.updatedAt
            ? { updatedAt: user.updatedAt }
            : { updatedAt: { $exists: false } };
          const touched = await userCollection.updateOne(
            { _id: mongoUserId, ...updatedAtFilter },
            { $set: { updatedAt: nextUpdatedAt } },
            { session },
          );
          if (touched.matchedCount !== 1) {
            throw new AppError({
              status: 409,
              message: "Account changed while applying the mutation fence",
            });
          }

          return { allowed: true };
        },
        "AccountDeletionTombstoneRepository.fenceMutation",
        false,
      );
    },
  );

  create = transactional(
    async (
      tombstone: AccountDeletionTombstone,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<AccountDeletionTombstone>> => {
      if (!session) {
        return {
          success: false,
          errors: [
            new AppError({
              status: 500,
              message:
                "Account deletion tombstones require a Mongo transaction",
            }),
          ],
        };
      }
      return this.mongoService.execute(
        async (connection: Mongoose): Promise<AccountDeletionTombstone> => {
          const payload: AccountDeletionTombstone =
            AccountDeletionTombstoneSchema.parse(tombstone);
          await getConfiguredMongoDatabase(connection)
            .collection<AccountDeletionTombstone>(
              ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
            )
            .insertOne(payload, { session });
          return payload;
        },
        "AccountDeletionTombstoneRepository.create",
        false,
      );
    },
  );
}
