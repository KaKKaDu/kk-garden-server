import {
  ErrorSchema,
  ProfileAvatarDeleteResponseSchema,
  type ProfileAvatarDeleteResponse,
} from "@kk-garden/shared/schemas";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse, Nullable } from "@kk-garden/shared/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getProfileService } from "@/services/crud/profile/index.ts";
import type { RouteFactory } from "@/types/route.types.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const profileAvatarDeleteRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().delete(
    "/avatar",
    {
      schema: {
        response: {
          200: ProfileAvatarDeleteResponseSchema,
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
        const result: SuccessDataAny<ProfileAvatarDeleteResponse> =
          await getProfileService().removeAvatar(userId);
        if (!result.success || !result.data) {
          const error: ErrorResponse = HandleRouteError.success(
            result as SuccessDataAny<ProfileAvatarDeleteResponse> & {
              success: false;
            },
          );
          reply.status(error.statusCode).send(error);
          return;
        }
        reply.status(200).send(result.data);
      } catch (error: unknown) {
        const response: ErrorResponse = HandleRouteError.raw(error);
        reply.status(response.statusCode).send(response);
      }
    },
  );
};
