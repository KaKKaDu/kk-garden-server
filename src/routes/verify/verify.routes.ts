import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { verifyRootRoute } from "@/routes/verify/root/verify-root.route.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";

export async function verifyRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  const res: SuccessDataAny = await handleRoutes([verifyRootRoute], fastify);

  Logger.report("Verify routes init", res);
}
