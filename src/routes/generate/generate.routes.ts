import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { generateRootRoute } from "@/routes/generate/generate-root.route.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";

export async function generateRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  await handleRoutes([generateRootRoute], fastify, "Generation");
}
