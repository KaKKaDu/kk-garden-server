import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { verifyRootRoute } from "@/routes/verify/verify-root.route.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";

export async function verifyRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  await handleRoutes([verifyRootRoute], fastify, "Verification");
}
