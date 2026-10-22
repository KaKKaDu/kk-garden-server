import type { FastifyInstance } from "fastify";
import { AppError } from "@kk-garden/shared/errors";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const addMutationOriginGuard = (
  fastify: FastifyInstance,
  trustedOrigins: string[],
): void => {
  fastify.addHook("preHandler", async (request, reply): Promise<void> => {
    const isReadOnly: boolean =
      request.method === "GET" ||
      request.method === "HEAD" ||
      request.method === "OPTIONS";
    if (isReadOnly) {
      return;
    }
    const origin: string | undefined = request.headers.origin;
    if (origin !== undefined && trustedOrigins.includes(origin)) {
      return;
    }
    const error = HandleRouteError.raw(
      new AppError({
        status: 403,
        message: "Request origin is not allowed",
      }),
    );
    reply.status(error.statusCode).send(error);
  });
};
