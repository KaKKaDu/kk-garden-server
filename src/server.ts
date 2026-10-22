import { init } from "@/init.ts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { generateRoutes } from "@/routes/generate/generate.routes.ts";
import { assignRoutes } from "@/routes/assign/assign.routes.ts";
import { verifyRoutes } from "@/routes/verify/verify.routes.ts";
import { authRoutes } from "@/routes/auth/auth.routes.ts";
import { profileRoutes } from "@/routes/profile/profile.routes.ts";
import cors from "@fastify/cors";
import { getEnvService } from "@/services/env/index.ts";
import type { Nullable } from "@kk-garden/shared/types";
import { parseClientOrigins } from "@/lib/auth/auth-origins.ts";
import { getAvatarCleanupService } from "@/services/avatar/avatar-cleanup/index.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";

const avatarCleanupService = getAvatarCleanupService();

void init(async (app: FastifyInstance) => {
  const tombstoneInit = await getAccountDeletionTombstoneService().initialize();
  if (!tombstoneInit.success) {
    throw new Error("Account deletion tombstones could not be initialized");
  }

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
      methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
    })
    .register(authRoutes, { prefix: "/api/auth" })
    .register(profileRoutes, { prefix: "/profile" })
    .register(generateRoutes, { prefix: "/generate" })
    .register(assignRoutes, { prefix: "/assign" })
    .register(verifyRoutes, { prefix: "/verify" });

  app.addHook("onReady", async (): Promise<void> => {
    const result = await avatarCleanupService.start();
    if (!result.success) {
      throw new Error("Avatar cleanup could not start");
    }
  });
  app.addHook("onClose", async (): Promise<void> => {
    const result = await avatarCleanupService.stop();
    if (!result.success) {
      throw new Error("Avatar cleanup could not stop");
    }
  });
});
