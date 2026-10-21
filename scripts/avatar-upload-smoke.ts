import assert from "node:assert/strict";
import { mock } from "node:test";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import {
  ProfileAvatarUploadResponseSchema,
  ProfileAvatarUploadSessionSchema,
} from "@kk-garden/shared/schemas";
import type {
  ProfileAvatarUploadSession,
  User,
  UserStatus,
} from "@kk-garden/shared/types";
import { AvatarUploadRepository } from "../src/services/avatar-upload/avatar-upload.repository.ts";
import { AvatarStorageService } from "../src/services/avatar-storage/avatar-storage.service.ts";
import { AvatarCleanupService } from "../src/services/avatar-cleanup/avatar-cleanup.service.ts";
import type { AvatarCleanupData } from "../src/services/avatar-cleanup/types.ts";
import type {
  AvatarContentType,
  AvatarStorageUpload,
} from "../src/services/avatar-storage/types.ts";
import { getAvatarCleanupService } from "../src/services/avatar-cleanup/index.ts";
import { getUserService } from "../src/services/crud/user/index.ts";
import { profileAvatarUploadRoute } from "../src/routes/profile/avatar/upload/profile-avatar-upload.route.ts";

/* eslint-disable no-console */

let authenticated: boolean = true;
let status: UserStatus = "active";
let failure: "save" | "queue" | "sign" | null = null;
const saved: ProfileAvatarUploadSession[] = [];
const order: string[] = [];
const failed = <T extends object>(): SuccessDataAny<T> => ({
  success: false,
  errors: [new AppError({ status: 503, message: "Dependency unavailable" })],
});

mock.method(AvatarUploadRepository.prototype, "initialize", async () => ({
  success: true,
  data: { ready: true },
}));
mock.method(
  getUserService().getById,
  "direct",
  async (id: string): Promise<SuccessDataAny<User>> => ({
    success: true,
    data: {
      _id: id,
      authId: id,
      email: "owner@example.test",
      role: "user",
      status,
    },
  }),
);
mock.method(
  AvatarUploadRepository.prototype,
  "create",
  async (
    upload: ProfileAvatarUploadSession,
  ): Promise<SuccessDataAny<ProfileAvatarUploadSession>> => {
    order.push("persist");
    if (failure === "save") {
      return failed();
    }
    saved.push(ProfileAvatarUploadSessionSchema.parse(upload));
    return { success: true, data: upload };
  },
);
mock.method(
  AvatarCleanupService.prototype,
  "enqueue",
  async (
    data: AvatarCleanupData,
  ): Promise<SuccessDataAny<{ queued: true }>> => {
    order.push("queue");
    const upload = saved.at(-1);
    assert(upload);
    assert.equal(data.ownerId, upload.ownerId);
    assert.equal(data.target.kind, "staging");
    assert.equal(data.target.objectKey, upload.stagingObjectKey);
    return failure === "queue"
      ? failed()
      : { success: true, data: { queued: true } };
  },
);
mock.method(
  AvatarStorageService.prototype,
  "issueUpload",
  async (
    contentType: AvatarContentType,
    objectKey?: string,
    issuedAt?: number,
  ): Promise<SuccessDataAny<AvatarStorageUpload>> => {
    order.push("sign");
    const upload = saved.at(-1);
    assert(upload);
    assert.equal(objectKey, upload.stagingObjectKey);
    assert(objectKey);
    assert.equal(contentType, upload.contentType);
    assert.equal(issuedAt, new Date(upload.createdAt).getTime());
    return failure === "sign"
      ? failed()
      : {
          success: true,
          data: {
            objectKey,
            url: "https://storage.example.test/signed-upload",
            expiresAt: new Date(upload.expiresAt).toISOString(),
          },
        };
  },
);

const app = Fastify();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.decorate("avatarCleanup", getAvatarCleanupService());
app.decorateRequest("user", {
  getter: () =>
    authenticated
      ? {
          id: "owner",
          createdAt: new Date(),
          updatedAt: new Date(),
          email: "owner@example.test",
          emailVerified: true,
          name: "Owner",
        }
      : null,
});
await app.register(
  async (scope): Promise<void> => {
    await profileAvatarUploadRoute(scope);
  },
  { prefix: "/profile" },
);

const metadata = { contentType: "image/png", byteSize: 100 };
const post = (payload: object = metadata) =>
  app.inject({ method: "POST", url: "/profile/avatar/upload", payload });

try {
  const response = await post();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "private, no-store");
  const body = ProfileAvatarUploadResponseSchema.parse(response.json());
  const upload = saved[0];
  assert(upload);
  assert.equal(upload.ownerId, "owner");
  assert.equal(body.uploadId, upload._id);
  assert.notEqual(upload._id, upload.stagingObjectKey);
  assert.equal(
    new Date(body.expiresAt).getTime() - new Date(upload.createdAt).getTime(),
    900_000,
  );
  assert.deepEqual(Object.keys(body).sort(), [
    "expiresAt",
    "uploadId",
    "uploadUrl",
  ]);
  assert.deepEqual(order, ["persist", "queue", "sign"]);
  for (const invalid of [
    { ...metadata, ownerId: "another-owner" },
    { ...metadata, objectKey: "caller-chosen" },
    { ...metadata, contentType: "image/gif" },
    { ...metadata, byteSize: 0 },
    { ...metadata, byteSize: 5_000_001 },
    { ...metadata, byteSize: 1.5 },
  ]) {
    assert.equal((await post(invalid)).statusCode, 400);
  }
  assert.equal(saved.length, 1, "Invalid input must not reserve uploads");
  authenticated = false;
  assert.equal((await post()).statusCode, 401);
  authenticated = true;
  for (const blocked of ["suspended", "inactive", "deleted"] as const) {
    status = blocked;
    assert.equal((await post()).statusCode, 403);
  }
  assert.equal(saved.length, 1, "Ineligible owners must not reserve uploads");
  status = "active";
  for (const stage of ["save", "queue", "sign"] as const) {
    failure = stage;
    order.length = 0;
    const result = await post();
    assert.equal(result.statusCode, 503);
    assert.equal(result.headers["cache-control"], "private, no-store");
    assert.deepEqual(
      order,
      stage === "save"
        ? ["persist"]
        : stage === "queue"
          ? ["persist", "queue"]
          : ["persist", "queue", "sign"],
    );
    assert(
      !result.body.includes("uploadUrl"),
      "Dependency failures must not issue an upload URL",
    );
  }
  console.log("Avatar upload smoke checks passed.");
} finally {
  await app.close();
  mock.restoreAll();
}
