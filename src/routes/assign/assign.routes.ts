import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { assignRootRoute } from "@/routes/assign/root/assign-root.route.ts";
import { assignCancelRoute } from "@/routes/assign/cancel/assign-cancel.route.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";

export async function assignRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  const res: SuccessDataAny = await handleRoutes(
    [assignRootRoute, assignCancelRoute],
    fastify,
  );

  Logger.report("Assign routes init", res);
}
