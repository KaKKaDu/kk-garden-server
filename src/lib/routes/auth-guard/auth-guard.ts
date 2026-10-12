import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { AppError, handleError } from "@kk-garden/shared/errors";
import type { ErrorResponse } from "@kk-garden/shared/types";
import { getAuthService } from "@/lib/auth/index.js";
import { HandleRouteError } from "@lib/route-error/route-error.js";
import { Logger } from "@lib/logs/logger.js";

export const authGuard = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  try {
    const authResult = await getAuthService();
    if (!authResult.success) {
      Logger.report("authGuard", authResult);
      const error: ErrorResponse = HandleRouteError.success(authResult);
      reply.status(error.statusCode).send(error);
      return;
    }
    if (!authResult.data) {
      throw new AppError({
        status: 500,
        message: "Auth initialization returned no data",
      });
    }

    const session = await authResult.data.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      throw new AppError({ status: 401, message: "Authentication required" });
    }

    request.user = session.user;
    request.session = session.session;
  } catch (error: unknown) {
    const result = handleError(error);
    Logger.report("authGuard", result);
    const response: ErrorResponse = HandleRouteError.success(result);
    reply.status(response.statusCode).send(response);
  }
};

export const registerAuthGuard = (fastify: FastifyInstance): void => {
  fastify.decorateRequest("user", null);
  fastify.decorateRequest("session", null);
  fastify.addHook("preHandler", authGuard);
};
