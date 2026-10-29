import type { RouteFactory } from "@/types/route.types.ts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  VerifyRootRequestSchema,
  type VerifyRootResponse,
  VerifyRootResponseSchema,
  ErrorSchema,
} from "@kk-garden/shared/schemas";
import { HandleRouteError } from "@lib/route-error/route-error.ts";
import type {
  ErrorResponse,
  OwnershipVerificationResult,
} from "@kk-garden/shared/types";
import { getOwnershipVerificationService } from "@/services/transactions/ownership-verification/index.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";

export const verifyRootRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/",
    {
      schema: {
        body: VerifyRootRequestSchema,
        response: {
          200: VerifyRootResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.body;

        const verifyOwnershipResult: SuccessDataAny<OwnershipVerificationResult> =
          await getOwnershipVerificationService().verifyOwnership(userId);

        if (!verifyOwnershipResult.success) {
          const err: ErrorResponse = HandleRouteError.success(
            verifyOwnershipResult,
          );
          reply.status(err.statusCode).send(err);
          return;
        }

        if (!verifyOwnershipResult.data) {
          throw new Error("Ownership verification returned no data");
        }

        const verificationResult: OwnershipVerificationResult =
          verifyOwnershipResult.data;

        const response: VerifyRootResponse = {
          success:
            getOwnershipVerificationService().isFullyVerified(
              verificationResult,
            ),
          data: verificationResult,
        };

        reply.status(200).send(response);
      } catch (e: unknown) {
        const err: ErrorResponse = HandleRouteError.raw(e);
        reply.status(err.statusCode).send(err);
      }
    },
  );
};
