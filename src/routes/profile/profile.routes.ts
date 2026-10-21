import type { FastifyInstance } from "fastify";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { profileRootGetRoute } from "@/routes/profile/root/profile-root.get.route.ts";
import { profileRootPatchRoute } from "@/routes/profile/root/profile-root.patch.route.ts";
import { profileAvatarUploadRoute } from "@/routes/profile/avatar/upload/profile-avatar-upload.route.ts";

export const profileRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  const result: SuccessDataAny = await handleRoutes(
    [profileRootGetRoute, profileRootPatchRoute, profileAvatarUploadRoute],
    fastify,
  );
  Logger.report("Profile routes init", result);
};
