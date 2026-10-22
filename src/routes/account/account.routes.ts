import type { FastifyInstance } from "fastify";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { accountDeleteRoute } from "@/routes/account/account-delete.route.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";

export const accountRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  const result: SuccessDataAny = await handleRoutes(
    [accountDeleteRoute],
    fastify,
  );
  Logger.report("Account routes init", result);
};
