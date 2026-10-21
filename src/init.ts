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

  const close = (): void => {
    void app.close().then(
      (): never => process.exit(0),
      (error: unknown): never => {
        app.log.error(error, "Server shutdown failed");
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  app.addHook("onClose", async (): Promise<void> => {
    process.removeListener("SIGINT", close);
    process.removeListener("SIGTERM", close);
  });

  app.listen({ port: 8090, host: "0.0.0.0" }).then(() => {
    // eslint-disable-next-line no-console
    console.log("Server running on http://localhost:8090");
  });
};
