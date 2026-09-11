import type { RouteFactory } from "@/types/route.types.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  AssignCancelRequestSchema,
  AssignCancelResponseSchema,
  ErrorSchema,
} from "@kk-garden/shared/schemas";
import { HandleRouteError } from "@lib/route-error/route-error.js";
import type { ErrorResponse } from "@kk-garden/shared/types";
import { getVisualisationPendingService } from "@/services/crud/visualisation-pending/index.js";
import type { SuccessDataAny } from "@kk-garden/shared/errors";

export const assignCancelRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    "/",
    {
      schema: {
        body: AssignCancelRequestSchema,
        response: {
          200: AssignCancelResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { pendingId }: { pendingId: string } = request.body;

        const deleteResult: SuccessDataAny =
          await getVisualisationPendingService().deleteByPendingId.direct(
            pendingId,
          );

        if (!deleteResult.success) {
          const err: ErrorResponse = HandleRouteError.success(deleteResult);
          reply.status(err.statusCode).send(err);
          return;
        }

        const response = {
          success: true,
        };

        reply.status(200).send(response);
      } catch (e: unknown) {
        const err: ErrorResponse = HandleRouteError.raw(e);
        reply.status(err.statusCode).send(err);
      }
    },
  );
};
