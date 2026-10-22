import assert from "node:assert/strict";
import Fastify from "fastify";
import { mock } from "node:test";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  ProfileLookupCardResponse,
  ProfileOwnerResponse,
  ProfileUpdateResponse,
} from "@kk-garden/shared/schemas";
import type {
  Nullable,
  Profile,
  User,
  UserStatus,
} from "@kk-garden/shared/types";
import { getAccountDeletionTombstoneService } from "../src/services/account-deletion/index.ts";
import { getAvatarStorageService } from "../src/services/avatar/avatar-storage/index.ts";
import { getProfileLookupService } from "../src/services/crud/profile-lookup/index.ts";
import { ProfileLookupRepository } from "../src/services/crud/profile-lookup/profile-lookup.repository.ts";
import { ProfileLookupService } from "../src/services/crud/profile-lookup/profile-lookup.service.ts";
import { getProfileService } from "../src/services/crud/profile/index.ts";
import { getUserService } from "../src/services/crud/user/index.ts";
import { getMongoService } from "../src/services/mongo/index.ts";
import { profileLookupRoute } from "../src/routes/profile/lookup/profile-lookup.route.ts";
import { profileRootGetRoute } from "../src/routes/profile/root/profile-root.get.route.ts";
import { profileRootPatchRoute } from "../src/routes/profile/root/profile-root.patch.route.ts";
import type { AvatarStorageSignedUrl } from "../src/services/avatar/avatar-storage/types.ts";

/* eslint-disable no-console */

const ownerId: string = "profile-lookup-owner";
const requesterId: string = "profile-lookup-requester";
const lookupCode: string = "ABCDEFGHJKMNPQRS";
const avatarObjectKey: string =
  "avatars/final/00000000-0000-4000-8000-000000000024.webp";
const signedAvatar: AvatarStorageSignedUrl = {
  url: "https://storage.example.test/profile-lookup-avatar",
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
};

const failed = <T extends object>(status: number): SuccessDataAny<T> => ({
  success: false,
  errors: [new AppError({ status, message: "Dependency unavailable" })],
});

const assertFailureStatus = <T extends object>(
  result: SuccessDataAny<T>,
  status: number,
): void => {
  if (result.success) {
    throw new Error(`Expected failure status ${status}, received success`);
  }
  assert.equal(result.errors[0]?.status, status);
};

const ownerProfile: Profile = {
  _id: ownerId,
  displayName: "Lookup owner",
  lookupCode,
  avatarObjectKey,
};
const ownerResponse: ProfileOwnerResponse = {
  configured: true,
  displayName: "Lookup owner",
  accent: { effectiveHex: "#6b9b75" },
  avatar: null,
  lookupCode,
};

let profile: Nullable<Profile> = ownerProfile;
let targetStatus: UserStatus = "active";
let tombstoned: boolean = false;
let rateLimited: boolean = false;
let lookupQueries: number = 0;
let userChecks: number = 0;
let signedObjectKeys: string[] = [];
let authenticated: boolean = true;
let updateCalls: number = 0;
let routeLookupCalls: number = 0;

const mongoService = getMongoService();
const users = getUserService();
const avatarStorage = getAvatarStorageService();
const tombstones = getAccountDeletionTombstoneService();
const lookupRepository = new ProfileLookupRepository(mongoService);
const lookupService = new ProfileLookupService(
  lookupRepository,
  users,
  mongoService,
  avatarStorage,
  tombstones,
);
const lookupRouteService = getProfileLookupService();
const profileService = getProfileService();

const app = Fastify();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.decorateRequest("user", {
  getter: () =>
    authenticated
      ? {
          id: requesterId,
          createdAt: new Date(),
          updatedAt: new Date(),
          email: "requester@example.test",
          emailVerified: true,
          name: "Lookup requester",
        }
      : null,
});

mock.method(
  lookupRepository,
  "consumeLimit",
  async (): Promise<SuccessDataAny<{ consumed: true }>> =>
    rateLimited ? failed(429) : { success: true, data: { consumed: true } },
);
mock.method(
  lookupRepository,
  "findByLookupCode",
  async (): Promise<SuccessDataAny<{ profile: Nullable<Profile> }>> => {
    lookupQueries += 1;
    return { success: true, data: { profile } };
  },
);
mock.method(
  users.getById,
  "direct",
  async (id: string): Promise<SuccessDataAny<User>> => {
    userChecks += 1;
    return {
      success: true,
      data: {
        _id: id,
        authId: id,
        email: "owner@example.test",
        role: "user",
        status: targetStatus,
      },
    };
  },
);
mock.method(
  tombstones,
  "assertNotDeletedAsNotFound",
  async (id: string, message: string): Promise<void> => {
    assert.equal(id, ownerId);
    if (tombstoned) {
      throw new AppError({ status: 404, message });
    }
  },
);
mock.method(
  avatarStorage,
  "signRead",
  async (
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageSignedUrl>> => {
    signedObjectKeys.push(objectKey);
    return { success: true, data: signedAvatar };
  },
);
mock.method(
  lookupRouteService,
  "initialize",
  async (): Promise<SuccessDataAny<{ ready: true }>> => ({
    success: true,
    data: { ready: true },
  }),
);
mock.method(
  lookupRouteService,
  "resolveCard",
  async (
    actualRequesterId: string,
    actualCode: string,
  ): Promise<SuccessDataAny<ProfileLookupCardResponse>> => {
    assert.equal(actualRequesterId, requesterId);
    assert.equal(actualCode, lookupCode);
    routeLookupCalls += 1;
    return {
      success: true,
      data: { displayName: "Lookup owner", avatar: signedAvatar },
    };
  },
);
mock.method(
  profileService,
  "getProfile",
  async (): Promise<SuccessDataAny<ProfileOwnerResponse>> => ({
    success: true,
    data: ownerResponse,
  }),
);
mock.method(
  profileService,
  "updateProfile",
  async (): Promise<SuccessDataAny<ProfileUpdateResponse>> => {
    updateCalls += 1;
    return { success: true, data: ownerResponse };
  },
);

await app.register(
  async (scope): Promise<void> => {
    profileRootGetRoute(scope);
    profileRootPatchRoute(scope);
    profileLookupRoute(scope);
  },
  { prefix: "/profile" },
);

try {
  const validCard = await lookupService.resolveCard(requesterId, lookupCode);
  if (!validCard.success || !validCard.data) {
    throw new Error("A valid active profile should resolve");
  }
  assert.deepEqual(Object.keys(validCard.data).sort(), [
    "avatar",
    "displayName",
  ]);
  assert.deepEqual(validCard.data, {
    displayName: "Lookup owner",
    avatar: signedAvatar,
  });
  assert.deepEqual(signedObjectKeys, [avatarObjectKey]);

  profile = null;
  const unknownProfile = await lookupService.resolveCard(
    requesterId,
    lookupCode,
  );
  assertFailureStatus(unknownProfile, 404);

  profile = ownerProfile;
  tombstoned = true;
  const deletedProfile = await lookupService.resolveCard(
    requesterId,
    lookupCode,
  );
  assertFailureStatus(deletedProfile, 404);
  tombstoned = false;

  targetStatus = "inactive";
  const inactiveProfile = await lookupService.resolveCard(
    requesterId,
    lookupCode,
  );
  assertFailureStatus(inactiveProfile, 404);
  targetStatus = "active";

  rateLimited = true;
  const limitedProfile = await lookupService.resolveCard(
    requesterId,
    lookupCode,
  );
  assertFailureStatus(limitedProfile, 429);
  assert.equal(lookupQueries, 4);
  assert.equal(userChecks, 2);
  rateLimited = false;

  const ownerCodeRead = await app.inject({ method: "GET", url: "/profile" });
  assert.equal(ownerCodeRead.statusCode, 200);
  assert.equal(ownerCodeRead.headers["cache-control"], "private, no-store");
  assert.equal(ownerCodeRead.json().lookupCode, lookupCode);

  authenticated = false;
  const unauthenticatedOwnerRead = await app.inject({
    method: "GET",
    url: "/profile",
  });
  assert.equal(unauthenticatedOwnerRead.statusCode, 401);
  const unauthenticatedLookup = await app.inject({
    method: "POST",
    url: "/profile/lookup",
    payload: { lookupCode },
  });
  assert.equal(unauthenticatedLookup.statusCode, 401);
  authenticated = true;

  const malformedLookup = await app.inject({
    method: "POST",
    url: "/profile/lookup",
    payload: { lookupCode: "not-a-code" },
  });
  assert.equal(malformedLookup.statusCode, 400);
  assert.equal(routeLookupCalls, 0);

  const arbitraryAvatarLookup = await app.inject({
    method: "POST",
    url: "/profile/lookup",
    payload: { lookupCode, avatarObjectKey },
  });
  assert.equal(arbitraryAvatarLookup.statusCode, 400);
  assert.equal(routeLookupCalls, 0);

  const routedCard = await app.inject({
    method: "POST",
    url: "/profile/lookup",
    payload: { lookupCode },
  });
  assert.equal(routedCard.statusCode, 200);
  assert.equal(routedCard.headers["cache-control"], "private, no-store");
  assert.deepEqual(Object.keys(routedCard.json()).sort(), [
    "avatar",
    "displayName",
  ]);

  const attemptedCodeUpdate = await app.inject({
    method: "PATCH",
    url: "/profile",
    payload: { lookupCode },
  });
  assert.equal(attemptedCodeUpdate.statusCode, 400);
  assert.equal(updateCalls, 0);

  console.log("Profile lookup smoke checks passed.");
} finally {
  await app.close();
  mock.restoreAll();
}
