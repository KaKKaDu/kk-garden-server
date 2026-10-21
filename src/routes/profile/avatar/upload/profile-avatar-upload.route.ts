import {
  ErrorSchema,
  ProfileAvatarUploadRequestSchema,
  ProfileAvatarUploadResponseSchema,
} from "@kk-garden/shared/schemas";
import { AppError } from "@kk-garden/shared/errors";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AvatarCleanupService } from "@/services/avatar-cleanup/avatar-cleanup.service.ts";
import { getAvatarUploadService } from "@/services/avatar-upload/index.ts";
import type { RouteFactory } from "@/types/route.types.ts";
import { HandleRouteError } from "@lib/route-error/route-error.ts";

export const profileAvatarUploadRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  const uploads = getAvatarUploadService(
    fastify.getDecorator<AvatarCleanupService>("avatarCleanup"),
  );
  fastify.addHook("onReady", async (): Promise<void> => {
    const result = await uploads.initialize();
    if (!result.success) {
      throw new Error("Avatar upload persistence could not initialize");
    }
  });
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/avatar/upload",
    {
      bodyLimit: 1_024,
      schema: {
        body: ProfileAvatarUploadRequestSchema,
        response: {
          200: ProfileAvatarUploadResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply): Promise<void> => {
      reply.header("Cache-Control", "private, no-store");
      try {
        const ownerId: string | undefined = request.user?.id;
        if (!ownerId) {
          throw new AppError({
            status: 401,
            message: "Authentication required",
          });
        }
        const result = await uploads.issue(ownerId, request.body);
        if (!result.success) {
          const error = HandleRouteError.success(result);
          reply.status(error.statusCode).send(error);
          return;
        }
        if (!result.data) {
          throw new AppError({
            status: 500,
            message: "Avatar upload issuance returned no data",
          });
        }
        reply.status(200).send(result.data);
      } catch (error: unknown) {
        const response = HandleRouteError.raw(error);
        reply.status(response.statusCode).send(response);
      }
    },
  );
};
