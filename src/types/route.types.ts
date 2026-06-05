import type { FastifyInstance } from "fastify";

export type RouteFactory = (fastify: FastifyInstance) => Promise<void> | void;
