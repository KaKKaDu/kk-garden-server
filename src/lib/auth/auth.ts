import { betterAuth, type BetterAuthOptions } from "better-auth";
import { createAuthMiddleware, freshSessionMiddleware } from "better-auth/api";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import { Logger } from "@lib/logs/logger.ts";
import { getAuthDb, type AuthDbBridge } from "@/lib/auth/auth-db.ts";
import {
  parseClientOrigins,
  validateAuthBaseUrl,
} from "@/lib/auth/auth-origins.ts";
import { getAuthSecurityOptions } from "@/lib/auth/auth-security-config.ts";
import { ACCOUNT_DELETION_TOMBSTONE_COLLECTION } from "@/schemas/models/account-deletion-tombstone.mongo.schema.ts";
import { getEnvService } from "@/services/env/index.ts";
import {
  authEmailVariables,
  createAuthEmailDelivery,
  createAuthEmailSender,
} from "@/lib/auth/auth-email.ts";

export type AuthInstance = ReturnType<typeof betterAuth>;

const sensitiveAuthPaths: Set<string> = new Set([
  "/passkey/delete-passkey",
  "/passkey/update-passkey",
  "/email-otp/request-email-change",
]);

const requireFreshSensitiveSession = createAuthMiddleware(
  async (ctx): Promise<void> => {
    if (sensitiveAuthPaths.has(ctx.path)) {
      await freshSessionMiddleware(ctx);
    }
  },
);

// Passkey relying-party settings are tied to the configured client origins.
export const createAuthInstance = async (): Promise<
  SuccessDataAny<AuthInstance>
> => {
  const isProduction: boolean = process.env.NODE_ENV === "production";
  const authDbResult: SuccessDataAny<AuthDbBridge> = await getAuthDb();

  if (!authDbResult.success) {
    return authDbResult as unknown as SuccessDataAny<AuthInstance>;
  }

  try {
    const authDb: Nullable<AuthDbBridge> = authDbResult.data;
    if (!authDb) {
      throw new Error("Mongo bridge returned no data for better-auth adapter");
    }

    const secret: Nullable<string> =
      getEnvService().getRawEnvValue("BETTER_AUTH_SECRET");
    const baseURL: Nullable<string> =
      getEnvService().getRawEnvValue("BETTER_AUTH_URL");
    const rawTrustedOrigins: Nullable<string> =
      getEnvService().getRawEnvValue("CLIENT_ORIGINS");

    if (!secret) {
      throw new Error(
        "BETTER_AUTH_SECRET is not defined in environment variables",
      );
    }
    if (!baseURL) {
      throw new Error(
        "BETTER_AUTH_URL is not defined in environment variables",
      );
    }
    if (!rawTrustedOrigins) {
      throw new Error("CLIENT_ORIGINS is not defined in environment variables");
    }

    const googleClientId: Nullable<string> =
      getEnvService().getRawEnvValue("GOOGLE_CLIENT_ID");
    const googleClientSecret: Nullable<string> = getEnvService().getRawEnvValue(
      "GOOGLE_CLIENT_SECRET",
    );
    const githubClientId: Nullable<string> =
      getEnvService().getRawEnvValue("GITHUB_CLIENT_ID");
    const githubClientSecret: Nullable<string> = getEnvService().getRawEnvValue(
      "GITHUB_CLIENT_SECRET",
    );

    if (!googleClientId || !googleClientSecret) {
      throw new Error(
        "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not defined in environment variables",
      );
    }
    if (!githubClientId || !githubClientSecret) {
      throw new Error(
        "GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET are not defined in environment variables",
      );
    }

    const trustedOrigins: string[] = parseClientOrigins(
      rawTrustedOrigins,
      isProduction,
    );
    const relyingPartyOrigin: string | undefined = trustedOrigins[0];

    if (!relyingPartyOrigin) {
      throw new Error("CLIENT_ORIGINS must contain at least one valid origin");
    }

    const validatedBaseUrl: string = validateAuthBaseUrl(baseURL, isProduction);
    const emailSenderResult = createAuthEmailSender();
    if (!emailSenderResult.success) {
      return { success: false, errors: emailSenderResult.errors };
    }
    if (!emailSenderResult.data) {
      throw new Error("Auth email sender initialization returned no data");
    }
    const emailDelivery = createAuthEmailDelivery(emailSenderResult.data);

    const options: BetterAuthOptions = {
      database: mongodbAdapter(authDb.db, { client: authDb.client }),
      secret,
      baseURL: validatedBaseUrl,
      trustedOrigins,
      hooks: {
        before: requireFreshSensitiveSession,
        after: emailDelivery.after,
      },
      ...getAuthSecurityOptions(isProduction),
      databaseHooks: {
        user: {
          create: {
            after: async (): Promise<void> => {
              Logger.info(
                JSON.stringify({
                  event: "auth.user.created",
                  outcome: "success",
                }),
              );
            },
          },
        },
        session: {
          create: {
            before: async (session): Promise<false | void> => {
              const tombstone = await authDb.db
                .collection(ACCOUNT_DELETION_TOMBSTONE_COLLECTION)
                .findOne(
                  { userId: session.userId },
                  { projection: { _id: 1 } },
                );
              if (tombstone) {
                return false;
              }
            },
            after: async (_session, context): Promise<void> => {
              Logger.info(
                JSON.stringify({
                  event: "auth.session.created",
                  outcome: "success",
                  path: context?.path ?? "unknown",
                }),
              );
            },
          },
        },
      },
      onAPIError: {
        onError: async (): Promise<void> => {
          Logger.error(
            JSON.stringify({
              event: "auth.request.failed",
              outcome: "failure",
            }),
          );
        },
      },
      user: {
        additionalFields: {
          deletedAt: { type: "date", required: false, input: false },
          deactivated: {
            type: "boolean",
            required: false,
            defaultValue: false,
            input: false,
          },
        },
      },
      socialProviders: {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
        github: {
          clientId: githubClientId,
          clientSecret: githubClientSecret,
        },
      },
      plugins: [
        admin({ defaultRole: "user", adminRoles: ["admin"] }),
        passkey({
          rpID: new URL(relyingPartyOrigin).hostname,
          rpName: "kk-garden",
          origin: trustedOrigins,
        }),
        emailOTP({
          sendVerificationOTP: emailDelivery.sendVerificationOTP,
          disableSignUp: true,
          otpLength: 6,
          expiresIn: authEmailVariables.get("otp-expires-in"),
          allowedAttempts: 3,
          storeOTP: "hashed",
          resendStrategy: "rotate",
          rateLimit: { window: 60, max: 3 },
        }),
      ],
    };

    const auth: AuthInstance = betterAuth(options);
    const result: SuccessDataAny<AuthInstance> = { success: true, data: auth };
    Logger.report("auth.createAuthInstance", result);
    return result;
  } catch (error: unknown) {
    const failedResult: SuccessDataAny<AuthInstance> =
      handleError<AuthInstance>(error);
    Logger.report("auth.createAuthInstance", failedResult);
    return failedResult;
  }
};
