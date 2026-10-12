import { init } from "@/init.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { generateRoutes } from "@/routes/generate/generate.routes.js";
import { assignRoutes } from "@/routes/assign/assign.routes.js";
import { verifyRoutes } from "@/routes/verify/verify.routes.js";
import { authRoutes } from "@/routes/auth/auth.routes.js";
import cors from "@fastify/cors";
import { getEnvService } from "@/services/env/index.js";
import type { Nullable } from "@kk-garden/shared/types";

void init(async (app: FastifyInstance) => {
  const rawTrustedOrigins: Nullable<string> =
    getEnvService().getRawEnvValue("CLIENT_ORIGINS");
  const trustedOrigins: string[] = (rawTrustedOrigins ?? "")
    .split(",")
    .map((origin: string): string => origin.trim())
    .filter((origin: string): boolean => origin.length > 0);

  await app
    .withTypeProvider<ZodTypeProvider>()
    .register(cors, { origin: trustedOrigins, credentials: true })
    .register(authRoutes, { prefix: "/api/auth" })
    .register(generateRoutes, { prefix: "/generate" })
    .register(assignRoutes, { prefix: "/assign" })
    .register(verifyRoutes, { prefix: "/verify" });
});
