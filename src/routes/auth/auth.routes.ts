import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.js";
import { authCatchAllRoute } from "@/routes/auth/auth-catch-all.route.js";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.js";

export async function authRoutes(fastify: FastifyInstance) {
  const res: SuccessDataAny = await handleRoutes([authCatchAllRoute], fastify);

  Logger.report("Auth routes init", res);
}
