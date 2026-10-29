import type { RouteFactory } from "@/types/route.types.ts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ErrorSchema,
  GenerateRootQueryStringSchema,
  type GenerateRootResponse,
  GenerateRootResponseSchema,
} from "@kk-garden/shared/schemas";
import { HandleRouteError } from "@lib/route-error/route-error.ts";
import type {
  ErrorResponse,
  GardenDrawData,
  GardenDrawDataDto,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import { GardenGenerator } from "@lib/generations/generate/generate-garden.ts";
import { gardenDrawDataTransformer } from "@kk-garden/shared/transformers";
import { randomUUID } from "node:crypto";
import { getPendingVisualisationCreationService } from "@/services/transactions/pending-visualisation-creation/index.ts";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { AppError } from "@kk-garden/shared/errors";

export const generateRootRoute: RouteFactory = (
  fastify: FastifyInstance,
): void => {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/",
    {
      schema: {
        querystring: GenerateRootQueryStringSchema,
        response: {
          200: GenerateRootResponseSchema,
          "4xx": ErrorSchema,
          "5xx": ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const ownerId: string | undefined = request.user?.id;
        if (!ownerId) {
          throw new AppError({
            status: 401,
            message: "Authentication required",
          });
        }
        const { count = 3, pendingId } = request.query;
        const resolvedPendingId: string = pendingId
          ? String(pendingId)
          : randomUUID().toString();

        const generations: GardenDrawData[] = [];

        for (let i: number = 0; i < count; i++) {
          generations.push(GardenGenerator.generate());
        }

        const transformedGenerations: GardenDrawDataDto[] = generations.map(
          (generation: GardenDrawData): GardenDrawDataDto => {
            return gardenDrawDataTransformer.toDto(generation);
          },
        );

        const createPendingVisualisations: SuccessDataAny<
          VisualisationPendingDto[]
        > =
          await getPendingVisualisationCreationService().createPendingVisualisationsTransaction(
            ownerId,
            resolvedPendingId,
            transformedGenerations,
          );

        if (
          !createPendingVisualisations.success ||
          !createPendingVisualisations.data
        ) {
          throw new Error("Failed to create pending visualisations");
        }

        const generationsDto: GenerateRootResponse = {
          constants: GardenGenerator.getGridConstantsDto(),
          generations: createPendingVisualisations.data.map(
            (visualisation: VisualisationPendingDto) => ({
              ...visualisation.data,
              visualisationId: visualisation._id,
            }),
          ),
          pendingId: resolvedPendingId,
        };

        reply.status(200).send(generationsDto);
      } catch (e: unknown) {
        const err: ErrorResponse = HandleRouteError.raw(e);
        reply.status(err.statusCode).send(err);
      }
    },
  );
};
