import {
  ErrorSchema,
  ProfileAvatarFinalizeRequestSchema,
  ProfileAvatarFinalizeResponseSchema,
  type ProfileAvatarFinalizeResponse,
} from "@kk-garden/shared/schemas";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse, Nullable } from "@kk-garden/shared/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getAvatarUploadService } from "@/services/avatar/avatar-upload/index.ts";
import type { RouteFactory } from "@/types/route.types.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const profileAvatarFinalizeRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  const uploads = getAvatarUploadService();
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/avatar/finalize",
    {
      prefixTrailingSlash: "no-slash",
      bodyLimit: 1_024,
      schema: {
        body: ProfileAvatarFinalizeRequestSchema,
        response: {
          200: ProfileAvatarFinalizeResponseSchema,
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
        const result: SuccessDataAny<ProfileAvatarFinalizeResponse> =
          await uploads.finalize(userId, request.body);
        if (!result.success || !result.data) {
          const error: ErrorResponse = HandleRouteError.success(
            result as SuccessDataAny<ProfileAvatarFinalizeResponse> & {
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
