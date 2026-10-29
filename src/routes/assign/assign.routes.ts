import type { FastifyInstance } from "fastify";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { assignRootRoute } from "@/routes/assign/assign-root.route.ts";
import { assignCancelRoute } from "@/routes/assign/cancel/assign-cancel.route.ts";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";

export async function assignRoutes(fastify: FastifyInstance) {
  registerAuthGuard(fastify);
  await handleRoutes(
    [assignRootRoute, assignCancelRoute],
    fastify,
    "Assignment",
  );
}
