import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.js";
import { assignRootRoute } from "@/routes/assign/root/assign-root.route.js";
import { assignCancelRoute } from "@/routes/assign/cancel/assign-cancel.route.js";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.js";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.js";

export async function assignRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  const res: SuccessDataAny = await handleRoutes(
    [assignRootRoute, assignCancelRoute],
    fastify,
  );

  Logger.report("Assign routes init", res);
}
