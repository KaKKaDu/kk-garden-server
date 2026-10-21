import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { generateRootRoute } from "@/routes/generate/root/generate-root.route.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";

export async function generateRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  const res: SuccessDataAny = await handleRoutes([generateRootRoute], fastify);

  Logger.report("Generation routes init", res);
}
