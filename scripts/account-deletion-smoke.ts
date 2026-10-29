import assert from "node:assert/strict";
import type { DataObject, SuccessDataAny } from "@kk-garden/shared/errors";
import { AppError } from "@kk-garden/shared/errors";
import { ProfileAvatarUploadSessionSchema } from "@kk-garden/shared/schemas";
import type { Mongoose } from "mongoose";
import type { AvatarCleanupService } from "../src/services/avatar/avatar-cleanup/avatar-cleanup.service.ts";
import type { AvatarCleanupData } from "../src/services/avatar/avatar-cleanup/types.ts";
import type { AccountDeletionTombstoneService } from "../src/services/account-deletion/account-deletion-tombstone.service.ts";
import { AccountDeletionService } from "../src/services/account-deletion/account-deletion.service.ts";
import type { GardenSharingRepository } from "../src/services/crud/garden-sharing/garden-sharing.repository.ts";
import type { ProfileLookupService } from "../src/services/crud/profile-lookup/profile-lookup.service.ts";
import type { MongoService } from "../src/services/mongo/mongo.service.ts";

/* eslint-disable no-console */

const ownerId = "507f1f77bcf86cd799439011";
const updatedAt = new Date("2026-10-22T10:00:00.000Z");
const upload = ProfileAvatarUploadSessionSchema.parse({
  _id: "account-delete-upload",
  ownerId,
  stagingObjectKey: "avatars/staging/00000000-0000-4000-8000-000000000001",
  contentType: "image/png",
  byteSize: 4,
  createdAt: updatedAt,
  updatedAt,
  expiresAt: new Date(updatedAt.getTime() + 900_000),
  state: "pending",
  attempts: 0,
  retryAt: updatedAt,
});

const runScenario = async (accountChanged: boolean): Promise<void> => {
  const events: string[] = [];
  let userReads = 0;
  const user = {
    _id: ownerId,
    email: "owner@example.test",
    updatedAt,
  };
  const ownership = {
    _id: "ownership-1",
    userId: ownerId,
    signatureId: "signature-1",
    ownershipProof: "proof",
    assignedAt: updatedAt,
  };
  const signature = {
    _id: "signature-1",
    visualisationId: "visualisation-1",
  };
  const db = {
    collection: (name: string) => ({
      findOne: async (): Promise<unknown> => {
        if (name === "user") {
          userReads++;
          return userReads === 2 && accountChanged
            ? { ...user, updatedAt: new Date(updatedAt.getTime() + 1) }
            : user;
        }
        return null;
      },
      find: () => ({
        toArray: async (): Promise<unknown[]> =>
          name === "profile_avatar_upload_sessions"
            ? [upload]
            : name === "ownerships"
              ? [ownership]
              : name === "signatures"
                ? [signature]
                : name === "verification"
                  ? [{ _id: "otp-1" }]
                  : [],
      }),
      deleteMany: async (_filter: unknown, options?: { session?: unknown }) => {
        assert.ok(options?.session, `${name} deletion must be transactional`);
        events.push(`${name}.deleteMany`);
        return { deletedCount: 1 };
      },
      deleteOne: async (_filter: unknown, options?: { session?: unknown }) => {
        assert.ok(options?.session, `${name} deletion must be transactional`);
        events.push(`${name}.deleteOne`);
        return { deletedCount: 1 };
      },
    }),
  };
  const session = {
    withTransaction: async <T>(callback: () => Promise<T>): Promise<T> =>
      callback(),
    endSession: async (): Promise<void> => undefined,
  };
  const connection = {
    connection: { db },
    startSession: async () => session,
  } as unknown as Mongoose;
  const mongoService = {
    execute: async <T extends DataObject>(
      callback: (connection: Mongoose) => Promise<T>,
    ): Promise<SuccessDataAny<T>> => {
      try {
        return { success: true, data: await callback(connection) };
      } catch (error: unknown) {
        return {
          success: false,
          errors: [
            error instanceof AppError
              ? error
              : new AppError({ status: 500, message: "Smoke test failure" }),
          ],
        };
      }
    },
  } as MongoService;
  const tombstones = {
    create: async (): Promise<void> => {
      events.push("tombstone.create");
    },
  } as unknown as AccountDeletionTombstoneService;
  const avatarCleanup = {
    enqueue: async (
      data: AvatarCleanupData,
    ): Promise<SuccessDataAny<object>> => {
      events.push(`avatar.enqueue:${data.target.kind}`);
      return { success: true, data: { queued: true } };
    },
  } as unknown as AvatarCleanupService;
  const profileLookup = {
    invalidateLookupCode: async (
      userId: string,
      transactionSession: unknown,
    ): Promise<SuccessDataAny<{ invalidated: boolean }>> => {
      assert.equal(userId, ownerId);
      assert.equal(transactionSession, session);
      events.push("profileLookup.invalidateLookupCode");
      return { success: true, data: { invalidated: true } };
    },
  } as unknown as ProfileLookupService;
  const gardenSharingRepository = {
    deleteForAccount: async (
      userId: string,
      transactionSession: unknown,
    ): Promise<
      SuccessDataAny<{ deletedRequests: number; deletedGrants: number }>
    > => {
      assert.equal(userId, ownerId);
      assert.equal(transactionSession, session);
      events.push("gardenSharing.deleteForAccount");
      return {
        success: true,
        data: { deletedRequests: 0, deletedGrants: 0 },
      };
    },
  } as unknown as GardenSharingRepository;

  const result = await new AccountDeletionService(
    mongoService,
    tombstones,
    avatarCleanup,
    profileLookup,
    gardenSharingRepository,
  ).deleteAccount(ownerId);

  if (accountChanged) {
    assert.equal(result.success, false);
    assert.equal(events.includes("ownerships.deleteMany"), false);
    assert.deepEqual(events, ["avatar.enqueue:staging"]);
    return;
  }

  assert.equal(result.success, true);
  assert.deepEqual(events, [
    "avatar.enqueue:staging",
    "ownerships.deleteMany",
    "signatures.deleteMany",
    "visualisations.deleteMany",
    "visualisations_pending.deleteMany",
    "profileLookup.invalidateLookupCode",
    "gardenSharing.deleteForAccount",
    "profiles.deleteOne",
    "session.deleteMany",
    "account.deleteMany",
    "passkey.deleteMany",
    "verification.deleteMany",
    "user.deleteOne",
    "tombstone.create",
  ]);
  assert.equal(
    events.some((event) => event.startsWith("profile_avatar_upload_sessions.")),
    false,
  );
};

await runScenario(false);
await runScenario(true);
console.log("Account deletion smoke checks passed.");
