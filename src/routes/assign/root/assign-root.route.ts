import type { RouteFactory } from "@/types/route.types.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  AssignRootRequestSchema,
  type AssignRootResponse,
  AssignRootResponseSchema,
  ErrorSchema,
} from "@kk-garden/shared/schemas";
import { HandleRouteError } from "@lib/route-error/route-error.js";
import type { ErrorResponse, Ownership } from "@kk-garden/shared/types";
import { getOwnershipCreationService } from "@/services/transactions/ownership-creation/index.js";
import type { SuccessDataAny } from "@kk-garden/shared/errors";

export const assignRootRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/",
    {
      schema: {
        body: AssignRootRequestSchema,
        response: {
          200: AssignRootResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, visualisationId, pendingId } = request.body;

        const createOwnershipResult: SuccessDataAny<Ownership> =
          await getOwnershipCreationService().createOwnershipTransaction(
            userId,
            visualisationId,
            pendingId,
          );

        if (!createOwnershipResult.success) {
          const err: ErrorResponse = HandleRouteError.success(
            createOwnershipResult,
          );
          reply.status(err.statusCode).send(err);
          return;
        }

        const response: AssignRootResponse = {
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
