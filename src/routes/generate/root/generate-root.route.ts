import type { RouteFactory } from "@/types/route.types.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ErrorSchema,
  GenerateRootQueryStringSchema,
  type GenerateRootResponse,
  GenerateRootResponseSchema,
} from "@kk-garden/shared/schemas";
import { HandleRouteError } from "@lib/route-error/route-error.js";
import type {
  ErrorResponse,
  GardenDrawData,
  GardenDrawDataDto,
} from "@kk-garden/shared/types";
import { GardenGenerator } from "@lib/generations/generate/generate-garden.js";
import { gardenDrawDataTransformer } from "@kk-garden/shared/transformers";

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
        const { count } = request.query || 3;
        const generations: GardenDrawData[] = [];

        for (let i: number = 0; i < count; i++) {
          generations.push(GardenGenerator.generate());
        }

        const generationsDto: GenerateRootResponse = {
          constants: GardenGenerator.getGridConstantsDto(),
          generations: generations.map(
            (generation: GardenDrawData): GardenDrawDataDto =>
              gardenDrawDataTransformer.toDto(generation),
          ),
        };

        reply.status(200).send(generationsDto);
      } catch (e: unknown) {
        const err: ErrorResponse = HandleRouteError.raw(e);
        reply.status(err.statusCode).send(err);
      }
    },
  );
};
