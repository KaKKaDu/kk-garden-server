import assert from "node:assert/strict";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { createProfilePalette } from "@kk-garden/shared/constants";
import type { Profile } from "@kk-garden/shared/types";
import {
  createAuthOtpAccentResolver,
  type AuthOtpContext,
  type AuthOtpPayload,
} from "../src/lib/auth/auth-email-accent.ts";
import {
  authEmailVariables,
  createAuthEmailSenderWithTransport,
} from "../src/lib/auth/auth-email.ts";
import type { ProfileLookup } from "../src/services/crud/profile/types.ts";

/* eslint-disable no-console */

type CapturedMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

const profileFor = (userId: string): Profile => ({
  _id: userId,
  displayName: "Test profile",
  accentHex: userId === "change-email-account" ? "#bada55" : "#123abc",
});

const contextFor = (userId: string): AuthOtpContext =>
  ({
    context: {
      internalAdapter: {
        findUserByEmail: async () => ({ user: { id: userId } }),
      },
      session: {
        user: { id: userId },
        session: {},
      },
    },
  }) as unknown as AuthOtpContext;

const payloadFor = (type: AuthOtpPayload["type"]): AuthOtpPayload => ({
  email:
    type === "change-email" ? "new-address@example.test" : "user@example.test",
  otp: "123456",
  type,
});

const run = async (): Promise<void> => {
  const resolvedIds: string[] = [];
  const resolveAccent = createAuthOtpAccentResolver(
    async (userId: string): Promise<SuccessDataAny<ProfileLookup>> => {
      resolvedIds.push(userId);
      return { success: true, data: { profile: profileFor(userId) } };
    },
  );
  const messages: CapturedMessage[] = [];
  const sender = createAuthEmailSenderWithTransport(
    "kk-garden@example.test",
    async (message) => {
      messages.push(message);
      return { error: null };
    },
    resolveAccent,
  );

  for (const type of [
    "sign-in",
    "email-verification",
    "forget-password",
    "change-email",
  ] as const) {
    const userId =
      type === "change-email" ? "change-email-account" : `${type}-account`;
    const result = await sender(payloadFor(type), contextFor(userId));
    assert.equal(result.success, true);
  }

  assert.equal(messages.length, 4);
  assert.deepEqual(
    messages.map(({ to }) => to),
    [
      "user@example.test",
      "user@example.test",
      "user@example.test",
      "new-address@example.test",
    ],
  );
  assert.deepEqual(
    messages.map(({ subject }) => subject),
    [
      "Your kk-garden sign-in code",
      "Your kk-garden verification code",
      "Your kk-garden verification code",
      "Your kk-garden verification code",
    ],
  );
  assert.ok(messages.every(({ text }) => text.includes("123456")));
  assert.ok(messages.every(({ html }) => html.includes("123456")));
  assert.ok(
    messages
      .slice(0, 3)
      .every(({ html }) =>
        html.includes(
          `background-color:${createProfilePalette("#123abc").accent};`,
        ),
      ),
  );
  assert.ok(
    messages[3]?.html.includes(
      `background-color:${createProfilePalette("#bada55").accent};`,
    ),
  );
  assert.ok(
    messages.every((message) => message.from === "kk-garden@example.test"),
  );
  assert.equal(authEmailVariables.get("otp-expires-in"), 300);
  assert.deepEqual(resolvedIds, [
    "sign-in-account",
    "email-verification-account",
    "forget-password-account",
    "change-email-account",
  ]);

  const failedSendResult = await createAuthEmailSenderWithTransport(
    "kk-garden@example.test",
    async () => ({ error: { statusCode: 422 } }),
    resolveAccent,
  )(payloadFor("sign-in"), contextFor("rejected-account"));
  assert.equal(failedSendResult.success, false);
  if (!failedSendResult.success) {
    assert.equal(failedSendResult.errors[0]?.status, 502);
  }

  const thrownSendResult = await createAuthEmailSenderWithTransport(
    "kk-garden@example.test",
    async () => {
      throw new Error("Provider details must not escape");
    },
    resolveAccent,
  )(payloadFor("sign-in"), contextFor("thrown-account"));
  assert.equal(thrownSendResult.success, false);
  if (!thrownSendResult.success) {
    assert.equal(thrownSendResult.errors[0]?.status, 502);
    assert.equal(
      thrownSendResult.errors[0]?.message,
      "OTP email transport failed",
    );
    assert.deepEqual(thrownSendResult.errors[0]?.context, {
      provider: "resend",
    });
  }

  const profileFailureResolver = createAuthOtpAccentResolver(async () => ({
    success: false,
    errors: [new AppError({ status: 503, message: "Private DB detail" })],
  }));
  const defaultMessage: CapturedMessage[] = [];
  const fallbackSender = createAuthEmailSenderWithTransport(
    "kk-garden@example.test",
    async (message) => {
      defaultMessage.push(message);
      return { error: null };
    },
    profileFailureResolver,
  );
  const fallbackResult = await fallbackSender(
    payloadFor("sign-in"),
    contextFor("profile-failure-account"),
  );
  assert.equal(fallbackResult.success, true);
  assert.ok(
    defaultMessage[0]?.html.includes(
      `background-color:${createProfilePalette().accent};`,
    ),
  );
};

void run()
  .then(() => {
    console.log("Auth email sender smoke checks passed.");
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Auth email smoke failed",
    );
    process.exitCode = 1;
  });
