import { Resend } from "resend";
import type { emailOTP } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import { getProfileService } from "@/services/crud/profile/index.ts";
import type { Nullable } from "@kk-garden/shared/types";
import { getEnvService } from "@/services/env/index.ts";
import {
  createAuthOtpAccentResolver,
  type AuthOtpContext,
  type AuthOtpPayload,
} from "@/lib/auth/auth-email-accent.ts";
import { renderAuthOtpEmail } from "@/lib/auth/auth-email-template.ts";
import { Logger } from "@lib/logs/logger.ts";

import { Variables } from "@lib/variables/variables.ts";

export const authEmailVariables = Variables.of({
  "otp-expires-in": 300,
} as const);

type SendVerificationOTP = Parameters<
  typeof emailOTP
>[0]["sendVerificationOTP"];

type AuthEmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type AuthEmailTransportResult = {
  error: { statusCode?: number | null } | null;
};

type AuthEmailTransport = (
  message: AuthEmailMessage,
) => Promise<AuthEmailTransportResult>;

type AuthEmailSender = (
  payload: AuthOtpPayload,
  context: AuthOtpContext,
) => Promise<SuccessDataAny>;

export const createAuthEmailSenderWithTransport =
  (
    from: string,
    sendEmail: AuthEmailTransport,
    resolveAccent: ReturnType<typeof createAuthOtpAccentResolver>,
  ): AuthEmailSender =>
  async (
    { email, otp, type }: AuthOtpPayload,
    context: AuthOtpContext,
  ): Promise<SuccessDataAny> => {
    const accent = await resolveAccent({ email, otp, type }, context);
    const content = renderAuthOtpEmail({
      otp,
      type,
      expiresInSeconds: authEmailVariables.get("otp-expires-in"),
      accentHex: accent.accentHex,
    });

    let result: SuccessDataAny;
    try {
      const { error } = await sendEmail({
        from,
        to: email,
        ...content,
      });

      result = error
        ? {
            success: false,
            errors: [
              new AppError({
                message: "Resend rejected the OTP email",
                status: 502,
                context: { provider: "resend", statusCode: error.statusCode },
              }),
            ],
          }
        : { success: true };
    } catch {
      // Transport exceptions may contain credentials or the email payload.
      result = {
        success: false,
        errors: [
          new AppError({
            message: "OTP email transport failed",
            status: 502,
            context: { provider: "resend" },
          }),
        ],
      };
    }
    Logger.report("auth-email.sendVerificationOTP", result);
    return result;
  };

export const createAuthEmailSender = (): SuccessDataAny<AuthEmailSender> => {
  try {
    const apiKey: Nullable<string> =
      getEnvService().getRawEnvValue("RESEND_API_KEY");
    const from: Nullable<string> = getEnvService().getRawEnvValue("EMAIL_FROM");

    if (!apiKey || !from) {
      throw new Error(
        "RESEND_API_KEY/EMAIL_FROM are not defined in environment variables",
      );
    }

    const resend = new Resend(apiKey);
    const resolveAccent = createAuthOtpAccentResolver((userId) =>
      getProfileService().getById.direct(userId),
    );
    const sender = createAuthEmailSenderWithTransport(
      from,
      (message) => resend.emails.send(message),
      resolveAccent,
    );
    const result: SuccessDataAny<AuthEmailSender> = {
      success: true,
      data: sender,
    };
    Logger.report("auth-email.createAuthEmailSender", result);
    return result;
  } catch (error: unknown) {
    const result = handleError<AuthEmailSender>(error);
    Logger.report("auth-email.createAuthEmailSender", result);
    return result;
  }
};

export const createAuthEmailDelivery = (sender: AuthEmailSender) => {
  const failedRequests: WeakSet<object> = new WeakSet<object>();

  const sendVerificationOTP: SendVerificationOTP = async (
    payload,
    ctx,
  ): Promise<void> => {
    if (!ctx) {
      throw new APIError("INTERNAL_SERVER_ERROR", {
        message: "Email delivery requires an auth request context",
      });
    }
    const result: SuccessDataAny = await sender(payload, ctx);
    if (!result.success) {
      failedRequests.add(ctx.context);
    }
  };

  // Better Auth swallows sender exceptions; surface failures after the endpoint.
  const after = createAuthMiddleware(async (ctx): Promise<void> => {
    if (failedRequests.delete(ctx.context)) {
      throw new APIError("BAD_GATEWAY", {
        message: "Unable to deliver the verification email. Please try again.",
      });
    }
  });

  return { sendVerificationOTP, after };
};
