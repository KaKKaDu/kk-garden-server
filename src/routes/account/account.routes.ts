import type { FastifyInstance } from "fastify";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { accountDeleteRoute } from "@/routes/account/account-delete.route.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";

export const accountRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  await handleRoutes([accountDeleteRoute], fastify, "Account");
};
