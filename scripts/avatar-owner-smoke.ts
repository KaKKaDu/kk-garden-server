import assert from "node:assert/strict";
import Fastify from "fastify";
import { mock } from "node:test";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import {
  ProfileAvatarDeleteResponseSchema,
  ProfileOwnerResponseSchema,
} from "@kk-garden/shared/schemas";
import type {
  Nullable,
  Profile,
  User,
  UserStatus,
} from "@kk-garden/shared/types";
import { getAvatarCleanupService } from "../src/services/avatar/avatar-cleanup/index.ts";
import type { AvatarCleanupData } from "../src/services/avatar/avatar-cleanup/types.ts";
import { getAvatarStorageService } from "../src/services/avatar/avatar-storage/index.ts";
import type { AvatarStorageSignedUrl } from "../src/services/avatar/avatar-storage/types.ts";
import { getProfileService } from "../src/services/crud/profile/index.ts";
import { getUserService } from "../src/services/crud/user/index.ts";
import { profileAvatarDeleteRoute } from "../src/routes/profile/avatar/delete/profile-avatar-delete.route.ts";
import { profileRootGetRoute } from "../src/routes/profile/root/profile-root.get.route.ts";
import { addMutationOriginGuard } from "../src/lib/routes/mutation-origin-guard.ts";

/* eslint-disable no-console */

const ownerId: string = "avatar-owner";
const currentKey: string =
  "avatars/final/00000000-0000-4000-8000-000000000001.webp";
const replacementKey: string =
  "avatars/final/00000000-0000-4000-8000-000000000002.webp";
const baseProfile: Profile = {
  _id: ownerId,
  displayName: "Avatar owner",
};
let authenticated: boolean = true;
let userStatus: UserStatus = "active";
let configured: boolean = true;
let currentAvatarKey: Nullable<string> = currentKey;
let cleanupFailure: boolean = false;
let signingFailure: boolean = false;
let simulateRace: boolean = false;
let clearCalls: number = 0;
let cleanupCalls: number = 0;
let signingCalls: number = 0;
const order: string[] = [];
const cleanupTargets: string[] = [];

const profileSnapshot = (): Nullable<Profile> => {
  if (!configured) {
    return null;
  }
  return currentAvatarKey
    ? { ...baseProfile, avatarObjectKey: currentAvatarKey }
    : baseProfile;
};

const failed = <T extends object>(status: number): SuccessDataAny<T> => ({
  success: false,
  errors: [new AppError({ status, message: "Dependency unavailable" })],
});

const users = getUserService();
const profiles = getProfileService();
const cleanup = getAvatarCleanupService();
const storage = getAvatarStorageService();

mock.method(
  users.getById,
  "direct",
  async (id: string): Promise<SuccessDataAny<User>> => ({
    success: true,
    data: {
      _id: id,
      authId: id,
      email: "owner@example.test",
      role: "user",
      status: userStatus,
    },
  }),
);
mock.method(
  profiles.getById,
  "direct",
  async (): Promise<SuccessDataAny<{ profile: Nullable<Profile> }>> => ({
    success: true,
    data: { profile: profileSnapshot() },
  }),
);
mock.method(
  storage,
  "signRead",
  async (
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageSignedUrl>> => {
    signingCalls++;
    assert.equal(objectKey, currentAvatarKey);
    if (signingFailure) {
      return failed(502);
    }
    return {
      success: true,
      data: {
        url: "https://storage.example.test/private-avatar",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      },
    };
  },
);
mock.method(
  cleanup,
  "enqueue",
  async (
    data: AvatarCleanupData,
  ): Promise<SuccessDataAny<{ queued: true }>> => {
    cleanupCalls++;
    order.push("enqueue");
    assert.equal(data.ownerId, ownerId);
    assert.equal(data.target.kind, "displaced-avatar");
    cleanupTargets.push(data.target.objectKey);
    return cleanupFailure
      ? failed(503)
      : { success: true, data: { queued: true } };
  },
);
mock.method(
  profiles,
  "removeAvatar",
  async (id: string): Promise<SuccessDataAny<{ success: true }>> => {
    if (userStatus !== "active") {
      return failed<{ success: true }>(403);
    }
    const expectedObjectKey = currentAvatarKey;
    if (!expectedObjectKey) {
      return { success: true, data: { success: true } };
    }
    const queued = await cleanup.enqueue({
      ownerId: id,
      target: { kind: "displaced-avatar", objectKey: expectedObjectKey },
    });
    if (!queued.success) {
      return { success: false, errors: queued.errors };
    }
    clearCalls++;
    order.push("clear");
    assert.equal(id, ownerId);
    if (simulateRace) {
      currentAvatarKey = replacementKey;
      return failed<{ success: true }>(409);
    }
    currentAvatarKey = null;
    return { success: true, data: { success: true } };
  },
);

const app = Fastify();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.decorateRequest("user", {
  getter: () =>
    authenticated
      ? {
          id: ownerId,
          createdAt: new Date(),
          updatedAt: new Date(),
          email: "owner@example.test",
          emailVerified: true,
          name: "Avatar owner",
        }
      : null,
});
await app.register(
  async (scope): Promise<void> => {
    profileRootGetRoute(scope);
    profileAvatarDeleteRoute(scope);
  },
  { prefix: "/profile" },
);

const originApp = Fastify();
addMutationOriginGuard(originApp, ["https://client.example.test"]);
originApp.get("/profile", async () => ({ success: true }));
originApp.post("/profile", async () => ({ success: true }));

const getProfile = () => app.inject({ method: "GET", url: "/profile" });
const deleteAvatar = () =>
  app.inject({ method: "DELETE", url: "/profile/avatar" });

try {
  const delivered = await getProfile();
  assert.equal(delivered.statusCode, 200);
  assert.equal(delivered.headers["cache-control"], "private, no-store");
  const ownerResponse = ProfileOwnerResponseSchema.parse(delivered.json());
  assert.equal(ownerResponse.configured, true);
  assert.deepEqual(ownerResponse.avatar, {
    url: "https://storage.example.test/private-avatar",
    expiresAt: ownerResponse.avatar?.expiresAt,
  });
  assert(!delivered.body.includes(currentKey));

  currentAvatarKey = null;
  const absentAvatar = await getProfile();
  assert.equal(absentAvatar.statusCode, 200);
  assert.equal(
    ProfileOwnerResponseSchema.parse(absentAvatar.json()).avatar,
    null,
  );

  currentAvatarKey = currentKey;
  signingFailure = true;
  const unavailableDelivery = await getProfile();
  assert.equal(unavailableDelivery.statusCode, 502);
  assert.equal(
    unavailableDelivery.headers["cache-control"],
    "private, no-store",
  );
  signingFailure = false;

  order.length = 0;
  const removed = await deleteAvatar();
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.headers["cache-control"], "private, no-store");
  assert.deepEqual(ProfileAvatarDeleteResponseSchema.parse(removed.json()), {
    success: true,
  });
  assert.deepEqual(order, ["enqueue", "clear"]);
  assert.equal(cleanupTargets.at(-1), currentKey);
  assert.equal(currentAvatarKey, null);

  const cleanupCountAfterRemoval: number = cleanupCalls;
  const repeatedRemoval = await deleteAvatar();
  assert.equal(repeatedRemoval.statusCode, 200);
  assert.equal(cleanupCalls, cleanupCountAfterRemoval);

  currentAvatarKey = currentKey;
  cleanupFailure = true;
  const clearsBeforeQueueFailure: number = clearCalls;
  const queueUnavailable = await deleteAvatar();
  assert.equal(queueUnavailable.statusCode, 503);
  assert.equal(currentAvatarKey, currentKey);
  assert.equal(clearCalls, clearsBeforeQueueFailure);
  cleanupFailure = false;

  simulateRace = true;
  const racedRemoval = await deleteAvatar();
  assert.equal(racedRemoval.statusCode, 409);
  assert.equal(currentAvatarKey, replacementKey);
  simulateRace = false;

  currentAvatarKey = null;
  userStatus = "inactive";
  const ineligibleRemoval = await deleteAvatar();
  assert.equal(ineligibleRemoval.statusCode, 403);
  userStatus = "active";

  authenticated = false;
  const unauthenticatedRemoval = await deleteAvatar();
  assert.equal(unauthenticatedRemoval.statusCode, 401);
  authenticated = true;

  assert.equal(
    (
      await originApp.inject({
        method: "POST",
        url: "/profile",
        headers: { origin: "https://client.example.test" },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await originApp.inject({ method: "POST", url: "/profile" })).statusCode,
    403,
  );
  assert.equal(
    (
      await originApp.inject({
        method: "POST",
        url: "/profile",
        headers: { origin: "https://untrusted.example.test" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await originApp.inject({
        method: "GET",
        url: "/profile",
        headers: { origin: "https://untrusted.example.test" },
      })
    ).statusCode,
    200,
  );

  console.log("Avatar owner smoke checks passed.");
} finally {
  await app.close();
  await originApp.close();
  mock.restoreAll();
}
