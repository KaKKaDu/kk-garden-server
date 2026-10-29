import {
  ErrorSchema,
  GardenShareActionResponseSchema,
  GardenShareRequestIdParamsSchema,
  type GardenShareActionResponse,
} from "@kk-garden/shared/schemas";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse, Nullable } from "@kk-garden/shared/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getGardenSharingService } from "@/services/crud/garden-sharing/index.ts";
import type { RouteFactory } from "@/types/route.types.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const sharingRequestDeclineRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/requests/:requestId/decline",
    {
      schema: {
        params: GardenShareRequestIdParamsSchema,
        response: {
          200: GardenShareActionResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply): Promise<void> => {
      reply.header("Cache-Control", "private, no-store");
      try {
        const ownerId: Nullable<string> = request.user?.id;
        if (!ownerId) {
          throw new AppError({
            status: 401,
            message: "Authentication required",
          });
        }
        const result: SuccessDataAny<GardenShareActionResponse> =
          await getGardenSharingService().declineRequest(
            ownerId,
            request.params.requestId,
          );
        if (!result.success) {
          const error: ErrorResponse = HandleRouteError.success(result);
          reply.status(error.statusCode).send(error);
          return;
        }
        if (!result.data) {
          throw new AppError({
            status: 500,
            message: "Garden sharing action returned no data",
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
