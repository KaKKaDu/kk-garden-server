import type { FastifyInstance } from "fastify";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { gardenViewRoute } from "@/routes/garden/grantId/garden-view.route.ts";
export const gardenRoutes = async (fastify: FastifyInstance): Promise<void> => {
  registerAuthGuard(fastify);
  registerAuthGuard(fastify);
  await handleRoutes([gardenViewRoute], fastify, "Garden");
};
