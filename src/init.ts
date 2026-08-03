import Fastify, { type FastifyInstance } from "fastify";
import dotenv from "dotenv";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

export const generator = {
  version: "1.0.0",
  normalization: "1.0.0",
} as const;

export const init = async (
  content: (app: FastifyInstance) => Promise<void>,
): Promise<void> => {
  dotenv.config({ quiet: true });
  const app: FastifyInstance = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await content(app);

  app.listen({ port: 8090, host: "0.0.0.0" }).then(() => {
    // eslint-disable-next-line no-console
    console.log("Server running on http://localhost:8090");
  });
};
