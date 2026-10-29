import {
  ErrorSchema,
  GardenShareListQuerySchema,
  GardenShareListResponseSchema,
  type GardenShareListResponse,
} from "@kk-garden/shared/schemas";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse, Nullable } from "@kk-garden/shared/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getGardenSharingService } from "@/services/crud/garden-sharing/index.ts";
import type { RouteFactory } from "@/types/route.types.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const sharingGrantListRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/grants",
    {
      schema: {
        querystring: GardenShareListQuerySchema,
        response: {
          200: GardenShareListResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply): Promise<void> => {
      reply.header("Cache-Control", "private, no-store");
      try {
        const userId: Nullable<string> = request.user?.id;
        if (!userId) {
          throw new AppError({
            status: 401,
            message: "Authentication required",
          });
        }
        const result: SuccessDataAny<GardenShareListResponse> =
          await getGardenSharingService().listGrants(userId, request.query);
        if (!result.success) {
          const error: ErrorResponse = HandleRouteError.success(result);
          reply.status(error.statusCode).send(error);
          return;
        }
        if (!result.data) {
          throw new AppError({
            status: 500,
            message: "Garden access list returned no data",
          });
        }
        reply.status(200).send(result.data);
      } catch (error: unknown) {
        const response: ErrorResponse = HandleRouteError.raw(error);
        reply.status(response.statusCode).send(response);
      }
    },
  );
};
