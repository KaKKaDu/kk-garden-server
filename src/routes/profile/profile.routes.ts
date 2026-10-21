import type { FastifyInstance } from "fastify";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.js";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.js";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.js";
import { profileRootGetRoute } from "@/routes/profile/root/profile-root.get.route.js";
import { profileRootPatchRoute } from "@/routes/profile/root/profile-root.patch.route.js";

export const profileRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  const result: SuccessDataAny = await handleRoutes(
    [profileRootGetRoute, profileRootPatchRoute],
    fastify,
  );
  Logger.report("Profile routes init", result);
};
