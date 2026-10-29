import type { FastifyInstance } from "fastify";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { getGardenSharingService } from "@/services/crud/garden-sharing/index.ts";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { sharingGrantListRoute } from "@/routes/sharing/grants/sharing-grant-list.route.ts";
import { sharingGrantRevokeRoute } from "@/routes/sharing/grants/grantId/sharing-grant-revoke.route.ts";
import { sharingRequestAcceptRoute } from "@/routes/sharing/requests/requestId/accept/sharing-request-accept.route.ts";
import { sharingRequestCancelRoute } from "@/routes/sharing/requests/requestId/sharing-request-cancel.route.ts";
import { sharingRequestCreateRoute } from "@/routes/sharing/requests/sharing-request-create.route.ts";
import { sharingRequestDeclineRoute } from "@/routes/sharing/requests/requestId/decline/sharing-request-decline.route.ts";
import { sharingRequestListRoute } from "@/routes/sharing/requests/sharing-request-list.route.ts";

export const sharingRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  const result: SuccessDataAny = await handleRoutes(
    [
      sharingRequestCreateRoute,
      sharingRequestListRoute,
      sharingRequestAcceptRoute,
      sharingRequestDeclineRoute,
      sharingRequestCancelRoute,
      sharingGrantListRoute,
      sharingGrantRevokeRoute,
    ],
    fastify,
  );
  Logger.report("Sharing routes init", result);
  fastify.addHook("onReady", async (): Promise<void> => {
    const initializeResult = await getGardenSharingService().initialize();
    if (!initializeResult.success) {
      throw new Error("Garden sharing indexes could not be initialized");
    }
  });
};
