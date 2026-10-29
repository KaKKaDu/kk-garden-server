import type { FastifyInstance } from "fastify";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { gardenViewRoute } from "@/routes/garden/garden-view.route.ts";

export const gardenRoutes = async (fastify: FastifyInstance): Promise<void> => {
  registerAuthGuard(fastify);
  const result: SuccessDataAny = await handleRoutes([gardenViewRoute], fastify);
  Logger.report("Garden routes init", result);
};
