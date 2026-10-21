import { init } from "@/init.js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { generateRoutes } from "@/routes/generate/generate.routes.js";
import { assignRoutes } from "@/routes/assign/assign.routes.js";
import { verifyRoutes } from "@/routes/verify/verify.routes.js";
import { authRoutes } from "@/routes/auth/auth.routes.js";
import { profileRoutes } from "@/routes/profile/profile.routes.js";
import cors from "@fastify/cors";
import { getEnvService } from "@/services/env/index.js";
import type { Nullable } from "@kk-garden/shared/types";
import { parseClientOrigins } from "@/lib/auth/auth-origins.js";

void init(async (app: FastifyInstance) => {
  const rawTrustedOrigins: Nullable<string> =
    getEnvService().getRawEnvValue("CLIENT_ORIGINS");
  if (!rawTrustedOrigins) {
    throw new Error("CLIENT_ORIGINS is not defined in environment variables");
  }
  const trustedOrigins: string[] = parseClientOrigins(
    rawTrustedOrigins,
    process.env.NODE_ENV === "production",
  );

  await app
    .withTypeProvider<ZodTypeProvider>()
    .register(cors, {
      origin: trustedOrigins,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PATCH"],
    })
    .register(authRoutes, { prefix: "/api/auth" })
    .register(profileRoutes, { prefix: "/profile" })
    .register(generateRoutes, { prefix: "/generate" })
    .register(assignRoutes, { prefix: "/assign" })
    .register(verifyRoutes, { prefix: "/verify" });
});
