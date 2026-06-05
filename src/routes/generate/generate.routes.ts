import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.js";
import { generateRootRoute } from "@/routes/generate/root/generate-root.route.js";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.js";

export async function generateRoutes(fastify: FastifyInstance) {
  const res: SuccessDataAny = await handleRoutes([generateRootRoute], fastify);

  Logger.report("Generation routes init", res);
}
