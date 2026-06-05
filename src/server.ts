import { init } from "@/init.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { generateRoutes } from "@/routes/generate/generate.routes.js";

void init(async (app: FastifyInstance) => {
  await app
    .withTypeProvider<ZodTypeProvider>()
    .register(generateRoutes, { prefix: "/generate" });
});
