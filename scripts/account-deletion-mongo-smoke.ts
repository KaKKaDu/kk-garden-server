import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import mongoose from "mongoose";
import type { DataObject, SuccessDataAny } from "@kk-garden/shared/errors";
import { AppError } from "@kk-garden/shared/errors";
import type { Mongoose } from "mongoose";
import {
  getAccountDeletionService,
  getAccountDeletionTombstoneService,
} from "../src/services/account-deletion/index.ts";
import { getMongoService } from "../src/services/mongo/index.ts";
import { getConfiguredMongoDatabase } from "../src/services/mongo/mongo.repository.ts";

/* eslint-disable no-console */

dotenv.config({ quiet: true });

type DeletionVerification = {
  remaining: number[];
  tombstone: { userId: string; deletedAt: Date } | null;
};

type EmailReuseVerification = {
  exists: boolean;
  tombstone: boolean;
};

const requireData = <T extends DataObject>(result: SuccessDataAny<T>): T => {
  if (!result.success || !result.data) {
    throw new Error("MongoDB smoke operation failed");
  }
  return result.data;
};

const run = async (): Promise<void> => {
  const mongo = getMongoService();
  const tombstones = getAccountDeletionTombstoneService();
  const tombstoneIndex = await tombstones.initialize();
  if (!tombstoneIndex.success) {
    throw new Error("Tombstone index initialization failed");
  }

  const id = new ObjectId();
  const userId = id.toHexString();
  const email = `shard23-${randomUUID()}@example.invalid`;
  const now = new Date();
  const signatureId = `shard23-signature-${randomUUID()}`;
  const visualisationId = `shard23-visualisation-${randomUUID()}`;
  const pendingId = `shard23-pending-${randomUUID()}`;
  const sessionToken = `shard23-session-${randomUUID()}`;

  try {
    requireData(
      await mongo.execute(async (connection: Mongoose): Promise<DataObject> => {
        const db = getConfiguredMongoDatabase(connection);
        await db.collection("user").insertOne({
          _id: id,
          name: "Shard 23 smoke account",
          email,
          emailVerified: true,
          role: "user",
          deactivated: false,
          createdAt: now,
          updatedAt: now,
        });
        await db.collection("account").insertOne({
          _id: new ObjectId(),
          userId: id,
          accountId: `shard23-provider-${randomUUID()}`,
          providerId: "google",
          createdAt: now,
          updatedAt: now,
        });
        await db.collection("session").insertOne({
          _id: new ObjectId(),
          userId: id,
          token: sessionToken,
          expiresAt: new Date(now.getTime() + 60_000),
          createdAt: now,
          updatedAt: now,
        });
        await db.collection("passkey").insertOne({
          _id: new ObjectId(),
          userId: id,
          credentialID: `shard23-credential-${randomUUID()}`,
        });
        await db.collection("verification").insertOne({
          _id: new ObjectId(),
          identifier: `sign-in-otp-${email}`,
          value: "smoke-test-hash",
          expiresAt: new Date(now.getTime() + 60_000),
        });
        await db
          .collection<{ _id: string; displayName: string }>("profiles")
          .insertOne({
            _id: userId,
            displayName: "Shard 23 smoke account",
          });
        await db
          .collection<{
            _id: string;
            userId: string;
            signatureId: string;
            ownershipProof: string;
            assignedAt: Date;
          }>("ownerships")
          .insertOne({
            _id: `shard23-ownership-${randomUUID()}`,
            userId,
            signatureId,
            ownershipProof: "smoke-test-proof",
            assignedAt: now,
          });
        await db
          .collection<{
            _id: string;
            value: string;
            visualisationId: string;
            signatureProof: string;
            createdAt: Date;
          }>("signatures")
          .insertOne({
            _id: signatureId,
            value: "smoke-test-signature",
            visualisationId,
            signatureProof: "smoke-test-proof",
            createdAt: now,
          });
        await db.collection<{ _id: string }>("visualisations").insertOne({
          _id: visualisationId,
        });
        await db
          .collection<{
            _id: string;
            ownerId: string;
            pendingId: string;
            visualisationId: string;
          }>("visualisations_pending")
          .insertOne({
            _id: `shard23-pending-record-${randomUUID()}`,
            ownerId: userId,
            pendingId,
            visualisationId,
          });
        return { created: true };
      }, "AccountDeletionMongoSmoke.createFixtures"),
    );

    const deletion = await getAccountDeletionService().deleteAccount(userId);
    assert.equal(deletion.success, true, "Deletion transaction must commit");

    const deletedState = requireData(
      await mongo.execute(
        async (connection: Mongoose): Promise<DeletionVerification> => {
          const db = getConfiguredMongoDatabase(connection);
          const remaining = await Promise.all([
            db.collection("user").countDocuments({ _id: id }),
            db.collection("account").countDocuments({ userId: id }),
            db.collection("session").countDocuments({ userId: id }),
            db.collection("passkey").countDocuments({ userId: id }),
            db
              .collection("verification")
              .countDocuments({ identifier: `sign-in-otp-${email}` }),
            db
              .collection<{ _id: string }>("profiles")
              .countDocuments({ _id: userId }),
            db
              .collection<{ _id: string; userId: string }>("ownerships")
              .countDocuments({ userId }),
            db
              .collection<{ _id: string }>("signatures")
              .countDocuments({ _id: signatureId }),
            db
              .collection<{ _id: string }>("visualisations")
              .countDocuments({ _id: visualisationId }),
            db
              .collection<{
                _id: string;
                ownerId: string;
              }>("visualisations_pending")
              .countDocuments({ ownerId: userId }),
          ]);
          const record = await db
            .collection<{
              userId: string;
              deletedAt: Date;
            }>("account_deletion_tombstones")
            .findOne(
              { userId },
              { projection: { _id: 0, userId: 1, deletedAt: 1 } },
            );
          return {
            remaining,
            tombstone: record
              ? {
                  userId: String(record.userId),
                  deletedAt: record.deletedAt,
                }
              : null,
          };
        },
        "AccountDeletionMongoSmoke.verifyDeletion",
      ),
    );
    assert.deepEqual(
      deletedState.remaining,
      Array(10).fill(0),
      "Account-owned and authentication records must be removed",
    );
    assert.equal(deletedState.tombstone?.userId, userId);
    assert.ok(deletedState.tombstone?.deletedAt instanceof Date);

    const replacementId = new ObjectId();
    requireData(
      await mongo.execute(async (connection: Mongoose): Promise<DataObject> => {
        await getConfiguredMongoDatabase(connection)
          .collection("user")
          .insertOne({
            _id: replacementId,
            name: "Shard 23 replacement account",
            email,
            emailVerified: true,
            role: "user",
            createdAt: now,
            updatedAt: now,
          });
        return { created: true };
      }, "AccountDeletionMongoSmoke.reuseEmail"),
    );
    const repeatedDeletion =
      await getAccountDeletionService().deleteAccount(userId);
    assert.equal(repeatedDeletion.success, false);
    const replacement = requireData(
      await mongo.execute(
        async (connection: Mongoose): Promise<EmailReuseVerification> => {
          const db = getConfiguredMongoDatabase(connection);
          return {
            exists:
              (await db
                .collection("user")
                .findOne(
                  { _id: replacementId },
                  { projection: { _id: 1 } },
                )) !== null,
            tombstone:
              (await db
                .collection("account_deletion_tombstones")
                .findOne({ userId })) !== null,
          };
        },
        "AccountDeletionMongoSmoke.verifyEmailReuse",
      ),
    );
    assert.equal(replacement.exists, true);
    assert.equal(replacement.tombstone, true);
  } finally {
    const cleanup = await mongo.execute(
      async (connection: Mongoose): Promise<DataObject> => {
        const db = getConfiguredMongoDatabase(connection);
        await Promise.all([
          db.collection("user").deleteMany({ email }),
          db.collection("account").deleteMany({ userId: id }),
          db.collection("session").deleteMany({ userId: id }),
          db.collection("passkey").deleteMany({ userId: id }),
          db
            .collection("verification")
            .deleteMany({ identifier: `sign-in-otp-${email}` }),
          db
            .collection<{ _id: string }>("profiles")
            .deleteMany({ _id: userId }),
          db
            .collection<{ _id: string; userId: string }>("ownerships")
            .deleteMany({ userId }),
          db
            .collection<{ _id: string }>("signatures")
            .deleteMany({ _id: signatureId }),
          db
            .collection<{ _id: string }>("visualisations")
            .deleteMany({ _id: visualisationId }),
          db
            .collection<{
              _id: string;
              ownerId: string;
            }>("visualisations_pending")
            .deleteMany({ ownerId: userId }),
          db.collection("account_deletion_tombstones").deleteMany({ userId }),
        ]);
        return { cleaned: true };
      },
      "AccountDeletionMongoSmoke.cleanup",
    );
    if (!cleanup.success) {
      throw new AppError({
        status: 500,
        message: "MongoDB smoke fixtures require cleanup",
      });
    }
  }
};

void run()
  .then(() => {
    console.log("Live MongoDB account deletion smoke checks passed.");
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Live MongoDB account deletion smoke failed",
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
