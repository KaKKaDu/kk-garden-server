import type { RouteFactory } from "@/types/route.types.js";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse } from "@kk-garden/shared/types";
import { HandleRouteError } from "@lib/route-error/route-error.js";
import { getAuthService } from "@/lib/auth/index.js";
import type { AuthInstance } from "@/lib/auth/auth.js";

export const authCatchAllRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.route({
    method: ["GET", "POST"],
    url: "/*",
    async handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      try {
        const authResult: SuccessDataAny<AuthInstance> = await getAuthService();

        if (!authResult.success || !authResult.data) {
          const err: ErrorResponse = HandleRouteError.success(
            authResult as SuccessDataAny<AuthInstance> & { success: false },
          );
          reply.status(err.statusCode).send(err);
          return;
        }

        const url: URL = new URL(request.url, `http://${request.headers.host}`);
        const headers: Headers = fromNodeHeaders(request.headers);

        const req: Request = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });

        const response: Response = await authResult.data.handler(req);

        reply.status(response.status);
        response.headers.forEach((value: string, key: string): void => {
          reply.header(key, value);
        });
        reply.send(response.body ? await response.text() : null);
      } catch (e: unknown) {
        const err: ErrorResponse = HandleRouteError.raw(e);
        reply.status(err.statusCode).send(err);
      }
    },
  });
};
