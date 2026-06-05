import type { RouteFactory } from "@/types/route.types.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

export const generateRootRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().get("/", async () => {
    return { message: "Generate route is working" };
  });
};
