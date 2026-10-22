import type { BetterAuthOptions } from "better-auth";

export const getAuthSecurityOptions = (
  isProduction: boolean,
): Pick<BetterAuthOptions, "advanced" | "rateLimit" | "session"> => ({
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/social": { window: 60, max: 10 },
      "/sign-in/email-otp": { window: 60, max: 5 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/passkey/generate-authenticate-options": {
        window: 60,
        max: 10,
      },
      "/passkey/verify-authentication": { window: 60, max: 5 },
      "/passkey/generate-register-options": {
        window: 60,
        max: 10,
      },
      "/passkey/verify-registration": { window: 60, max: 5 },
    },
  },
  session: { expiresIn: 24 * 60 * 60, freshAge: 300 },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    },
    ipAddress: { ipAddressHeaders: ["x-auth-client-ip"] },
  },
});
