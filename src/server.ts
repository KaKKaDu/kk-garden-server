import { init } from "@/init.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { generateRoutes } from "@/routes/generate/generate.routes.js";
import { assignRoutes } from "@/routes/assign/assign.routes.js";
import cors from "@fastify/cors";

void init(async (app: FastifyInstance) => {
  await app
    .withTypeProvider<ZodTypeProvider>()
    .register(generateRoutes, { prefix: "/generate" })
    .register(assignRoutes, { prefix: "/assign" })
    .register(cors, { origin: true });
});
