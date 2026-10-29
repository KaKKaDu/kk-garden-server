import type { RouteFactory } from "@/types/route.types.ts";
import type { FastifyInstance } from "fastify";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";

export const handleRoutes = async (
  routes: RouteFactory[],
  fastify: FastifyInstance,
  routeGroup: string,
): Promise<void> => {
  const results: { route: string; result: SuccessDataAny }[] =
    await Promise.all(
      routes.map(async (route: RouteFactory) => {
        try {
          await route(fastify);
          return {
            route: route.name || "anonymous route",
            result: { success: true },
          };
        } catch (error) {
          return {
            route: route.name || "anonymous route",
            result: handleError(error),
          };
        }
      }),
    );
  const errors: string[] = results.flatMap(({ route, result }) =>
    result.success
      ? []
      : result.errors.map((error) => `${route}: ${error.message}`),
  );
  if (errors.length) {
    throw new Error(
      `${routeGroup} route registration failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
};
