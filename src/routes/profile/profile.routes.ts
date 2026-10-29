import type { FastifyInstance } from "fastify";
import { registerAuthGuard } from "@lib/routes/auth-guard/auth-guard.ts";
import { handleRoutes } from "@lib/routes/handle-routes/handle-routes.ts";
import { profileRootGetRoute } from "@/routes/profile/profile-root.get.route.ts";
import { profileRootPatchRoute } from "@/routes/profile/profile-root.patch.route.ts";
import { profileAvatarUploadRoute } from "@/routes/profile/avatar/upload/profile-avatar-upload.route.ts";
import { profileAvatarFinalizeRoute } from "@/routes/profile/avatar/finalize/profile-avatar-finalize.route.ts";
import { profileAvatarDeleteRoute } from "@/routes/profile/avatar/profile-avatar-delete.route.ts";
import { profileLookupRoute } from "@/routes/profile/lookup/profile-lookup.route.ts";

export const profileRoutes = async (
  fastify: FastifyInstance,
): Promise<void> => {
  registerAuthGuard(fastify);
  await handleRoutes(
    [
      profileRootGetRoute,
      profileRootPatchRoute,
      profileAvatarUploadRoute,
      profileAvatarFinalizeRoute,
      profileAvatarDeleteRoute,
      profileLookupRoute,
    ],
    fastify,
    "Profile",
  );
};
