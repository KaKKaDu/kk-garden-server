import type { RouteFactory } from "@/types/route.types.js";
import type { FastifyInstance } from "fastify";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";

export const handleRoutes = async (
  routes: RouteFactory[],
  fastify: FastifyInstance,
): Promise<SuccessDataAny> => {
  try {
    const resolves: SuccessDataAny[] = await Promise.all(
      routes.map(async (route: RouteFactory): Promise<SuccessDataAny> => {
        try {
          await route(fastify);
          return { success: true };
        } catch (e) {
          return handleError(e);
        }
      }),
    );
    const errors: AppError[] = resolves.reduce(
      (data: AppError[], current: SuccessDataAny): AppError[] => {
        if (!current.success) {
          return [...data, ...current.errors];
        }
        return current;
      },
      [],
    );
    if (errors.length) {
      return { success: false, errors };
    }
    return { success: true };
  } catch (e) {
    console.log(e);
    return handleError(e);
  }
};
