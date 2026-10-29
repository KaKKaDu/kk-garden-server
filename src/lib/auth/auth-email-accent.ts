import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { DEFAULT_PROFILE_ACCENT_HEX } from "@kk-garden/shared/constants";
import type { Profile } from "@kk-garden/shared/types";
import type { emailOTP } from "better-auth/plugins";
import type { ProfileLookup } from "@/services/crud/profile/types.ts";
import { Logger } from "@lib/logs/logger.ts";

type SendVerificationOTP = Parameters<
  typeof emailOTP
>[0]["sendVerificationOTP"];

export type AuthOtpPayload = Parameters<SendVerificationOTP>[0];
export type AuthOtpContext = NonNullable<Parameters<SendVerificationOTP>[1]>;
export type AuthOtpAccentFallbackReason =
  | "account-lookup-failed"
  | "change-email-session-missing"
  | "profile-lookup-failed";

export type AuthOtpAccentResolution = {
  accentHex: string;
  fallbackReason?: AuthOtpAccentFallbackReason;
};

export type AuthOtpAccentResolver = (
  payload: AuthOtpPayload,
  context: AuthOtpContext,
) => Promise<AuthOtpAccentResolution>;

type ReadProfileById = (
  userId: string,
) => Promise<SuccessDataAny<ProfileLookup>>;

const logFallback = (
  reason: AuthOtpAccentFallbackReason,
): AuthOtpAccentResolution => {
  Logger.info(
    JSON.stringify({
      event: "auth.email.theme_fallback",
      reason,
    }),
  );
  return {
    accentHex: DEFAULT_PROFILE_ACCENT_HEX,
    fallbackReason: reason,
  };
};

export const createAuthOtpAccentResolver =
  (readProfileById: ReadProfileById): AuthOtpAccentResolver =>
  async (
    payload: AuthOtpPayload,
    context: AuthOtpContext,
  ): Promise<AuthOtpAccentResolution> => {
    let userId: string;

    if (payload.type === "change-email") {
      const sessionUserId = context.context.session?.user.id;
      if (!sessionUserId) {
        return logFallback("change-email-session-missing");
      }
      userId = sessionUserId;
    } else {
      try {
        const account = await context.context.internalAdapter.findUserByEmail(
          payload.email.toLowerCase(),
          { includeAccounts: false },
        );
        if (!account) {
          return { accentHex: DEFAULT_PROFILE_ACCENT_HEX };
        }
        userId = account.user.id;
      } catch {
        return logFallback("account-lookup-failed");
      }
    }

    let profileResult: SuccessDataAny<ProfileLookup>;
    try {
      profileResult = await readProfileById(userId);
    } catch {
      return logFallback("profile-lookup-failed");
    }

    if (!profileResult.success || !profileResult.data) {
      return logFallback("profile-lookup-failed");
    }

    const profile: Profile | null | undefined = profileResult.data.profile;
    return {
      accentHex: profile?.accentHex ?? DEFAULT_PROFILE_ACCENT_HEX,
    };
  };
