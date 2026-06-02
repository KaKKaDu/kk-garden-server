import Fastify, { type FastifyInstance } from "fastify";

const app: FastifyInstance = Fastify({ logger: true });

app.get("/health", async () => {
  return { status: "ok" };
});

app.listen({ port: 8090, host: "0.0.0.0" }).then(() => {
  console.log("Server running on http://localhost:8090");
});
