import assert from "node:assert/strict";
import Fastify from "fastify";
import { mock } from "node:test";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import {
  ProfileAvatarFinalizeResponseSchema,
  ProfileAvatarUploadSessionSchema,
} from "@kk-garden/shared/schemas";
import type {
  Nullable,
  Profile,
  ProfileAvatarUploadSession,
  User,
} from "@kk-garden/shared/types";
import { getAvatarCleanupService } from "../src/services/avatar/avatar-cleanup/index.ts";
import type { AvatarCleanupData } from "../src/services/avatar/avatar-cleanup/types.ts";
import { AvatarUploadService } from "../src/services/avatar/avatar-upload/avatar-upload.service.ts";
import { AvatarUploadRepository } from "../src/services/avatar/avatar-upload/avatar-upload.repository.ts";
import type {
  AvatarUploadClaim,
  AvatarUploadClaimLookup,
  AvatarUploadLookup,
  AvatarUploadStateChange,
  AvatarUploadTransition,
} from "../src/services/avatar/avatar-upload/types.ts";
import { getAvatarImageService } from "../src/services/avatar/avatar-image/index.ts";
import type { NormalizedAvatarImage } from "../src/services/avatar/avatar-image/types.ts";
import { getAvatarStorageService } from "../src/services/avatar/avatar-storage/index.ts";
import {
  getAvatarUploadRepository,
  getAvatarUploadService,
} from "../src/services/avatar/avatar-upload/index.ts";
import { getMongoService } from "../src/services/mongo/index.ts";
import { getAccountDeletionTombstoneService } from "../src/services/account-deletion/index.ts";
import { getProfileService } from "../src/services/crud/profile/index.ts";
import type {
  ProfileAvatarFinalizeInput,
  ProfileAvatarFinalizeCommit,
  ProfileLookup,
} from "../src/services/crud/profile/types.ts";
import { getUserService } from "../src/services/crud/user/index.ts";
import { profileAvatarFinalizeRoute } from "../src/routes/profile/avatar/finalize/profile-avatar-finalize.route.ts";

/* eslint-disable no-console */

const ownerId: string = "avatar-owner";
const uploadId: string = "upload-smoke-id";
const sourceBytes: Buffer = Buffer.from([1, 2, 3, 4]);
const finalBytes: Buffer = Buffer.from([5, 6, 7]);
const originalAvatarKey: string =
  "avatars/final/00000000-0000-4000-8000-000000000002.webp";
const cleanupOrder: string[] = [];
let upload: ProfileAvatarUploadSession;
let profile: Profile;
let mismatch: boolean = false;
let commitFailure: boolean = false;
let finalWrites: number = 0;

const pendingUpload = (): ProfileAvatarUploadSession => {
  const now: Date = new Date();
  return ProfileAvatarUploadSessionSchema.parse({
    _id: uploadId,
    ownerId,
    stagingObjectKey: "avatars/staging/00000000-0000-4000-8000-000000000001",
    contentType: "image/png",
    byteSize: sourceBytes.length,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 900_000),
    state: "pending",
    attempts: 0,
    retryAt: now,
  });
};

const userService = getUserService();
const profileService = getProfileService();
const repository = new AvatarUploadRepository(getMongoService());
const storage = getAvatarStorageService();
const cleanup = getAvatarCleanupService();
const images = getAvatarImageService();
assert.equal(getAvatarStorageService(), storage);
assert.equal(getAvatarCleanupService(), cleanup);
assert.equal(getAvatarImageService(), images);
assert.equal(getAvatarUploadRepository(), getAvatarUploadRepository());
assert.equal(getAvatarUploadService(), getAvatarUploadService());
const service = new AvatarUploadService(
  repository,
  storage,
  cleanup,
  userService,
  profileService,
  images,
  getMongoService(),
  getAccountDeletionTombstoneService(),
);

mock.method(
  userService.getById,
  "direct",
  async (id: string): Promise<SuccessDataAny<User>> => ({
    success: true,
    data: {
      _id: id,
      authId: id,
      email: "avatar-owner@example.test",
      role: "user",
      status: "active",
    },
  }),
);
mock.method(
  profileService.getById,
  "direct",
  async (): Promise<SuccessDataAny<ProfileLookup>> => ({
    success: true,
    data: { profile },
  }),
);
mock.method(
  repository.getById,
  "direct",
  async (
    id: string,
    owner: string,
  ): Promise<SuccessDataAny<AvatarUploadLookup>> => ({
    success: true,
    data: { upload: id === uploadId && owner === ownerId ? upload : null },
  }),
);
mock.method(
  repository,
  "claimPending",
  async (
    _id: string,
    _owner: string,
    claim: AvatarUploadClaim["claim"],
    candidateObjectKey: string,
    now: Date,
  ): Promise<SuccessDataAny<AvatarUploadClaimLookup>> => {
    if (upload.state !== "pending") {
      return { success: true, data: { upload: null } };
    }
    const { retryAt: _retryAt, lastFailure: _lastFailure, ...pending } = upload;
    const claimed = ProfileAvatarUploadSessionSchema.parse({
      ...pending,
      state: "processing",
      attempts: 1,
      claim,
      candidateObjectKey,
      updatedAt: now,
    });
    if (claimed.state !== "processing") {
      throw new Error("Expected a processing upload");
    }
    upload = claimed;
    return { success: true, data: { upload } };
  },
);
mock.method(
  repository,
  "transition",
  async (
    _id: string,
    _owner: string,
    from: "pending" | "processing",
    _token: Nullable<string>,
    change: AvatarUploadStateChange,
    now: Date,
    _lease: "active" | "expired" | "any" = "any",
  ): Promise<SuccessDataAny<AvatarUploadTransition>> => {
    if (upload.state !== from) {
      return { success: true, data: { updated: false } };
    }
    if (change.state === "pending") {
      if (upload.state !== "processing") {
        return { success: true, data: { updated: false } };
      }
      const {
        claim: _claim,
        candidateObjectKey: _candidateObjectKey,
        ...processing
      } = upload;
      upload = ProfileAvatarUploadSessionSchema.parse({
        ...processing,
        state: "pending",
        updatedAt: now,
        retryAt: change.retryAt,
        lastFailure: change.failure,
      });
      return { success: true, data: { updated: true } };
    }
    if (change.state !== "rejected") {
      return { success: true, data: { updated: false } };
    }
    const reason = change.reason;
    upload = ProfileAvatarUploadSessionSchema.parse({
      _id: upload._id,
      ownerId: upload.ownerId,
      stagingObjectKey: upload.stagingObjectKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      createdAt: upload.createdAt,
      updatedAt: now,
      expiresAt: upload.expiresAt,
      state: "rejected",
      attempts: upload.attempts,
      reason,
      finishedAt: now,
    });
    return { success: true, data: { updated: true } };
  },
);
mock.method(
  cleanup,
  "enqueue",
  async (
    data: AvatarCleanupData,
  ): Promise<SuccessDataAny<{ queued: true }>> => {
    cleanupOrder.push(data.target.kind);
    return { success: true, data: { queued: true } };
  },
);
mock.method(
  storage,
  "readStaging",
  async (): Promise<SuccessDataAny<Buffer>> => ({
    success: true,
    data: mismatch ? sourceBytes.subarray(1) : sourceBytes,
  }),
);
mock.method(
  images,
  "normalize",
  async (): Promise<SuccessDataAny<NormalizedAvatarImage>> => ({
    success: true,
    data: {
      bytes: finalBytes,
      contentType: "image/webp",
      width: 2,
      height: 2,
    },
  }),
);
mock.method(
  storage,
  "putFinal",
  async (
    bytes: Buffer,
    objectKey: string,
  ): Promise<SuccessDataAny<{ objectKey: string }>> => {
    assert(bytes.equals(finalBytes));
    finalWrites++;
    cleanupOrder.push("write");
    return { success: true, data: { objectKey } };
  },
);
mock.method(
  profileService,
  "finalizeAvatar",
  async (
    input: ProfileAvatarFinalizeInput,
  ): Promise<SuccessDataAny<ProfileAvatarFinalizeCommit>> => {
    if (commitFailure) {
      return {
        success: false,
        errors: [
          new AppError({
            status: 503,
            message: "Simulated commit failure",
          }),
        ],
      };
    }
    const previousAvatarObjectKey: Nullable<string> =
      profile.avatarObjectKey ?? null;
    assert.equal(input.expectedAvatarObjectKey, previousAvatarObjectKey);
    const committedAt: Date = new Date();
    const result = {
      objectKey: input.candidateObjectKey,
      width: input.width,
      height: input.height,
      committedAt,
    };
    if (upload.state !== "processing") {
      throw new Error("Expected processing upload");
    }
    upload = ProfileAvatarUploadSessionSchema.parse({
      _id: upload._id,
      ownerId: upload.ownerId,
      stagingObjectKey: upload.stagingObjectKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      createdAt: upload.createdAt,
      updatedAt: committedAt,
      expiresAt: upload.expiresAt,
      state: "completed",
      attempts: upload.attempts,
      result,
    });
    profile = { ...profile, avatarObjectKey: input.candidateObjectKey };
    cleanupOrder.push("commit");
    return {
      success: true,
      data: { result, displacedAvatarObjectKey: previousAvatarObjectKey },
    };
  },
);
mock.method(
  storage,
  "signRead",
  async (): Promise<SuccessDataAny<{ url: string; expiresAt: string }>> => ({
    success: true,
    data: {
      url: "https://storage.example.test/private-avatar",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    },
  }),
);

try {
  upload = pendingUpload();
  profile = {
    _id: ownerId,
    displayName: "Avatar owner",
    avatarObjectKey: originalAvatarKey,
  };
  const finalized = await service.finalize(ownerId, { uploadId });
  assert(finalized.success && finalized.data);
  ProfileAvatarFinalizeResponseSchema.parse(finalized.data);
  assert.equal(upload.state, "completed");
  assert.equal(finalWrites, 1);
  assert.deepEqual(cleanupOrder, [
    "candidate",
    "write",
    "displaced-avatar",
    "commit",
  ]);

  assert((await service.finalize(ownerId, { uploadId })).success);
  assert.equal(finalWrites, 1, "Completed retries must not promote again");
  const foreign = await service.finalize("other-owner", { uploadId });
  assert(!foreign.success);
  assert.equal(foreign.errors[0]?.status, 404);

  upload = pendingUpload();
  profile = {
    _id: ownerId,
    displayName: "Avatar owner",
    avatarObjectKey: originalAvatarKey,
  };
  mismatch = true;
  const rejected = await service.finalize(ownerId, { uploadId });
  assert(!rejected.success);
  assert.equal(rejected.errors[0]?.status, 400);
  assert.equal(upload.state, "rejected");
  assert.equal(profile.avatarObjectKey, originalAvatarKey);
  assert.equal(finalWrites, 1);

  upload = pendingUpload();
  mismatch = false;
  commitFailure = true;
  cleanupOrder.length = 0;
  const failedReplacement = await service.finalize(ownerId, { uploadId });
  assert(!failedReplacement.success);
  assert.equal(failedReplacement.errors[0]?.status, 503);
  assert.equal(upload.state, "pending");
  assert.equal(profile.avatarObjectKey, originalAvatarKey);
  assert.deepEqual(cleanupOrder, ["candidate", "write", "displaced-avatar"]);

  commitFailure = false;
  if (upload.state !== "pending") {
    throw new Error("Expected a retryable pending upload");
  }
  upload = ProfileAvatarUploadSessionSchema.parse({
    ...upload,
    retryAt: new Date(Date.now() - 1),
  });
  const retried = await service.finalize(ownerId, { uploadId });
  assert(retried.success);
  assert.equal(upload.state, "completed");
  assert.notEqual(profile.avatarObjectKey, originalAvatarKey);

  upload = pendingUpload();
  const writesBeforeConcurrentFinalize: number = finalWrites;
  const concurrent = await Promise.all([
    service.finalize(ownerId, { uploadId }),
    service.finalize(ownerId, { uploadId }),
  ]);
  assert(concurrent.some((result): boolean => result.success));
  assert.equal(finalWrites, writesBeforeConcurrentFinalize + 1);
  assert.equal(upload.state, "completed");

  mock.restoreAll();
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  let authenticated: boolean = true;
  app.decorateRequest("user", {
    getter: () =>
      authenticated
        ? {
            id: ownerId,
            createdAt: new Date(),
            updatedAt: new Date(),
            email: "avatar-owner@example.test",
            emailVerified: true,
            name: "Avatar owner",
          }
        : null,
  });
  mock.method(
    AvatarUploadService.prototype,
    "finalize",
    async (): Promise<
      SuccessDataAny<{
        avatar: { url: string; expiresAt: string };
      }>
    > => ({
      success: true,
      data: {
        avatar: {
          url: "https://storage.example.test/private-avatar",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        },
      },
    }),
  );
  await app.register(
    async (scope): Promise<void> => {
      await profileAvatarFinalizeRoute(scope);
    },
    { prefix: "/profile" },
  );
  try {
    const response = await app.inject({
      method: "POST",
      url: "/profile/avatar/finalize",
      payload: { uploadId },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert(
      ProfileAvatarFinalizeResponseSchema.safeParse(response.json()).success,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/profile/avatar/finalize",
          payload: { uploadId, ownerId },
        })
      ).statusCode,
      400,
    );
    authenticated = false;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/profile/avatar/finalize",
          payload: { uploadId },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
  console.log("Avatar finalization smoke checks passed.");
} finally {
  mock.restoreAll();
}
