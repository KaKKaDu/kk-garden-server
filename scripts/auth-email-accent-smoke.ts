import assert from "node:assert/strict";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { DEFAULT_PROFILE_ACCENT_HEX } from "@kk-garden/shared/constants";
import type { Profile } from "@kk-garden/shared/types";
import {
  createAuthOtpAccentResolver,
  type AuthOtpContext,
  type AuthOtpPayload,
} from "../src/lib/auth/auth-email-accent.ts";
import type { ProfileLookup } from "../src/services/crud/profile/types.ts";

/* eslint-disable no-console */

const ownerProfile: Profile = {
  _id: "profile-owner",
  displayName: "Profile owner",
  accentHex: "#bada55",
};

const successfulProfile = (
  profile: Profile | null,
): SuccessDataAny<ProfileLookup> => ({
  success: true,
  data: { profile },
});

const contextFor = (
  findUserByEmail: (email: string) => Promise<{ user: { id: string } } | null>,
  sessionUserId?: string,
): AuthOtpContext =>
  ({
    context: {
      internalAdapter: { findUserByEmail },
      session: sessionUserId
        ? { user: { id: sessionUserId }, session: {} }
        : null,
    },
  }) as unknown as AuthOtpContext;

const payloadFor = (
  type: AuthOtpPayload["type"],
  email: string = "user@example.test",
): AuthOtpPayload => ({ type, email, otp: "123456" });

const run = async (): Promise<void> => {
  const resolvedUserIds: string[] = [];
  const resolver = createAuthOtpAccentResolver(
    async (userId: string): Promise<SuccessDataAny<ProfileLookup>> => {
      resolvedUserIds.push(userId);
      return successfulProfile({ ...ownerProfile, _id: userId });
    },
  );

  for (const type of [
    "sign-in",
    "email-verification",
    "forget-password",
  ] as const) {
    let receivedEmail = "";
    const context = contextFor(async (email) => {
      receivedEmail = email;
      return { user: { id: `account-${type}` } };
    });
    const result = await resolver(
      payloadFor(type, "USER@EXAMPLE.TEST"),
      context,
    );
    assert.equal(receivedEmail, "user@example.test");
    assert.equal(result.accentHex, "#bada55");
    assert.equal(resolvedUserIds.at(-1), `account-${type}`);
  }

  let emailLookupCalls = 0;
  const changeEmailResult = await resolver(
    payloadFor("change-email", "new-address@example.test"),
    contextFor(async () => {
      emailLookupCalls++;
      return null;
    }, "current-account"),
  );
  assert.equal(changeEmailResult.accentHex, "#bada55");
  assert.equal(resolvedUserIds.at(-1), "current-account");
  assert.equal(emailLookupCalls, 0);

  const noAccountResult = await resolver(
    payloadFor("sign-in"),
    contextFor(async () => null),
  );
  assert.equal(noAccountResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);
  assert.equal(noAccountResult.fallbackReason, undefined);

  const noProfileResolver = createAuthOtpAccentResolver(
    async (): Promise<SuccessDataAny<ProfileLookup>> => successfulProfile(null),
  );
  const noProfileResult = await noProfileResolver(
    payloadFor("forget-password"),
    contextFor(async () => ({ user: { id: "no-profile-account" } })),
  );
  assert.equal(noProfileResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);
  assert.equal(noProfileResult.fallbackReason, undefined);

  const noCustomAccentResolver = createAuthOtpAccentResolver(
    async (): Promise<SuccessDataAny<ProfileLookup>> =>
      successfulProfile({
        _id: "default-accent-account",
        displayName: "Default accent owner",
      }),
  );
  const noCustomAccentResult = await noCustomAccentResolver(
    payloadFor("email-verification"),
    contextFor(async () => ({ user: { id: "default-accent-account" } })),
  );
  assert.equal(noCustomAccentResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);

  const accountFailureResolver = createAuthOtpAccentResolver(async () => ({
    success: true,
    data: { profile: ownerProfile },
  }));
  const accountFailureResult = await accountFailureResolver(
    payloadFor("sign-in"),
    contextFor(async () => {
      throw new Error("Contains private lookup details");
    }),
  );
  assert.equal(accountFailureResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);
  assert.equal(accountFailureResult.fallbackReason, "account-lookup-failed");

  const profileFailureResolver = createAuthOtpAccentResolver(
    async (): Promise<SuccessDataAny<ProfileLookup>> => ({
      success: false,
      errors: [new AppError({ status: 503, message: "Private DB detail" })],
    }),
  );
  const profileFailureResult = await profileFailureResolver(
    payloadFor("sign-in"),
    contextFor(async () => ({ user: { id: "failed-profile-account" } })),
  );
  assert.equal(profileFailureResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);
  assert.equal(profileFailureResult.fallbackReason, "profile-lookup-failed");

  const thrownProfileResolver = createAuthOtpAccentResolver(async () => {
    throw new Error("Contains private profile details");
  });
  const thrownProfileResult = await thrownProfileResolver(
    payloadFor("sign-in"),
    contextFor(async () => ({ user: { id: "thrown-profile-account" } })),
  );
  assert.equal(thrownProfileResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);
  assert.equal(thrownProfileResult.fallbackReason, "profile-lookup-failed");

  const missingSessionResult = await resolver(
    payloadFor("change-email"),
    contextFor(async () => null),
  );
  assert.equal(missingSessionResult.accentHex, DEFAULT_PROFILE_ACCENT_HEX);
  assert.equal(
    missingSessionResult.fallbackReason,
    "change-email-session-missing",
  );

  const concurrentResolver = createAuthOtpAccentResolver(
    async (userId: string): Promise<SuccessDataAny<ProfileLookup>> =>
      successfulProfile({
        ...ownerProfile,
        _id: userId,
        accentHex: userId === "first-account" ? "#112233" : "#aabbcc",
      }),
  );
  const [first, second] = await Promise.all([
    concurrentResolver(
      payloadFor("sign-in", "first@example.test"),
      contextFor(async () => ({ user: { id: "first-account" } })),
    ),
    concurrentResolver(
      payloadFor("sign-in", "second@example.test"),
      contextFor(async () => ({ user: { id: "second-account" } })),
    ),
  ]);
  assert.equal(first.accentHex, "#112233");
  assert.equal(second.accentHex, "#aabbcc");
};

void run()
  .then(() => {
    console.log("Auth email accent smoke checks passed.");
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Auth email accent smoke failed",
    );
    process.exitCode = 1;
  });
