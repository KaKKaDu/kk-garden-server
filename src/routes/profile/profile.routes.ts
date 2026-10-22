import type { FastifyInstance } from "fastify";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { profileRootGetRoute } from "@/routes/profile/root/profile-root.get.route.ts";
import { profileRootPatchRoute } from "@/routes/profile/root/profile-root.patch.route.ts";
import { profileAvatarUploadRoute } from "@/routes/profile/avatar/upload/profile-avatar-upload.route.ts";
import { profileAvatarFinalizeRoute } from "@/routes/profile/avatar/finalize/profile-avatar-finalize.route.ts";
import { profileAvatarDeleteRoute } from "@/routes/profile/avatar/delete/profile-avatar-delete.route.ts";
import { AppError } from "@kk-garden/shared/errors";
import { getEnvService } from "@/services/env/index.ts";
import type { Nullable } from "@kk-garden/shared/types";
import { parseClientOrigins } from "@/lib/auth/auth-origins.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const addProfileMutationOriginGuard = (
  fastify: FastifyInstance,
  trustedOrigins: string[],
): void => {
  fastify.addHook("preHandler", async (request, reply): Promise<void> => {
    const isReadOnly: boolean =
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.method === "OPTIONS";
    if (isReadOnly) {
      return;
    }
    const origin: string | undefined = request.headers.origin;
    const originIsTrusted: boolean =
      origin !== undefined && trustedOrigins.includes(origin);
    if (originIsTrusted) {
      return;
    }
    const error = HandleRouteError.raw(
      new AppError({
        status: 403,
        message: "Request origin is not allowed",
      }),
    );
    reply.status(error.statusCode).send(error);
  });
};

export const profileRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  const rawTrustedOrigins: Nullable<string> =
    getEnvService().getRawEnvValue("CLIENT_ORIGINS");
  if (!rawTrustedOrigins) {
    throw new Error("CLIENT_ORIGINS is not defined in environment variables");
  }
  const trustedOrigins: string[] = parseClientOrigins(
    rawTrustedOrigins,
    process.env.NODE_ENV === "production",
  );
  addProfileMutationOriginGuard(fastify, trustedOrigins);
  const result: SuccessDataAny = await handleRoutes(
    [
      profileRootGetRoute,
      profileRootPatchRoute,
      profileAvatarUploadRoute,
      profileAvatarFinalizeRoute,
      profileAvatarDeleteRoute,
    ],
    fastify,
  );
  Logger.report("Profile routes init", result);
};
