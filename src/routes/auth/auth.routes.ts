import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { authCatchAllRoute } from "@/routes/auth/auth-catch-all.route.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";

export async function authRoutes(fastify: FastifyInstance) {
  const res: SuccessDataAny = await handleRoutes([authCatchAllRoute], fastify);

  Logger.report("Auth routes init", res);
}
