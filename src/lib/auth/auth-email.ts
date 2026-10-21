import { Resend } from "resend";
import type { emailOTP } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import { getEnvService } from "@/services/env/index.ts";
import { Logger } from "@lib/logs/logger.ts";

import { Variables } from "@lib/variables/variables.ts";

export const authEmailVariables = Variables.of({
  "otp-expires-in": 300,
} as const);

type SendVerificationOTP = Parameters<
  typeof emailOTP
>[0]["sendVerificationOTP"];

type AuthEmailSender = (
  payload: Parameters<SendVerificationOTP>[0],
) => Promise<SuccessDataAny>;

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

    const resend: Resend = new Resend(apiKey);
    const sender: AuthEmailSender = async ({
      email,
      otp,
      type,
    }): Promise<SuccessDataAny> => {
      let result: SuccessDataAny;
      try {
        const { error } = await resend.emails.send({
          from,
          to: email,
          subject:
            type === "sign-in"
              ? "Your kk-garden sign-in code"
              : "Your kk-garden verification code",
          text: [
            `Your kk-garden code is: ${otp}`,
            "",
            `This code expires in ${authEmailVariables.get("otp-expires-in") / 60} minutes and can only be used once.`,
            "Do not share this code with anyone.",
            "",
            "If you did not request this code, you can ignore this email.",
          ].join("\n"),
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
    const result: SuccessDataAny = await sender(payload);
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
