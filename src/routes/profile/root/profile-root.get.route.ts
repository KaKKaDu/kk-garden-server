import {
  ErrorSchema,
  ProfileOwnerResponseSchema,
  type ProfileOwnerResponse,
} from "@kk-garden/shared/schemas";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse } from "@kk-garden/shared/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { RouteFactory } from "@/types/route.types.js";
import { getProfileService } from "@/services/crud/profile/index.js";
import { HandleRouteError } from "@lib/route-error/route-error.js";

export const profileRootGetRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/",
    {
      prefixTrailingSlash: "no-slash",
      schema: {
        response: {
          200: ProfileOwnerResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply): Promise<void> => {
      try {
        const userId: string | undefined = request.user?.id;
        if (!userId) {
          throw new AppError({
            status: 401,
            message: "Authentication required",
          });
        }

        const result: SuccessDataAny<ProfileOwnerResponse> =
          await getProfileService().getProfile(userId);
        if (!result.success || !result.data) {
          const error: ErrorResponse = HandleRouteError.success(
            result as SuccessDataAny<ProfileOwnerResponse> & {
              success: false;
            },
          );
          reply.status(error.statusCode).send(error);
          return;
        }

        reply
          .header("Cache-Control", "private, no-store")
          .status(200)
          .send(result.data);
      } catch (error: unknown) {
        const response: ErrorResponse = HandleRouteError.raw(error);
        reply.status(response.statusCode).send(response);
      }
    },
  );
};
