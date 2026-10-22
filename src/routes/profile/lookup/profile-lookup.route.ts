import {
  ErrorSchema,
  ProfileLookupCardRequestSchema,
  ProfileLookupCardResponseSchema,
  type ProfileLookupCardResponse,
} from "@kk-garden/shared/schemas";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { ErrorResponse, Nullable } from "@kk-garden/shared/types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getProfileLookupService } from "@/services/crud/profile-lookup/index.ts";
import type { RouteFactory } from "@/types/route.types.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const profileLookupRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  const lookupService = getProfileLookupService();
  fastify.addHook("onReady", async (): Promise<void> => {
    const result = await lookupService.initialize();
    if (!result.success) {
      throw new Error("Profile lookup could not be initialized");
    }
  });

  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/lookup",
    {
      bodyLimit: 1_024,
      schema: {
        body: ProfileLookupCardRequestSchema,
        response: {
          200: ProfileLookupCardResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply): Promise<void> => {
      reply.header("Cache-Control", "private, no-store");
      try {
        const requesterId: Nullable<string> = request.user?.id;
        if (!requesterId) {
          throw new AppError({
            status: 401,
            message: "Authentication required",
          });
        }

        const result: SuccessDataAny<ProfileLookupCardResponse> =
          await lookupService.resolveCard(requesterId, request.body.lookupCode);
        if (!result.success || !result.data) {
          const error: ErrorResponse = HandleRouteError.success(
            result as SuccessDataAny<ProfileLookupCardResponse> & {
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
