import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { authCatchAllRoute } from "@/routes/auth/auth-catch-all.route.ts";

export async function authRoutes(fastify: FastifyInstance) {
  await handleRoutes([authCatchAllRoute], fastify, "Authentication");
}
