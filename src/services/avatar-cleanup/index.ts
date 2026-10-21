import { AvatarCleanupService } from "@/services/avatar-cleanup/avatar-cleanup.service.ts";
import { getAvatarStorageService } from "@/services/avatar-storage/index.ts";
import { AvatarCleanupRepository } from "@/services/avatar-cleanup/avatar-cleanup.repository.ts";
import { getMongoService } from "@/services/mongo/index.ts";

export const getAvatarCleanupService = (): AvatarCleanupService =>
  new AvatarCleanupService(
    new AvatarCleanupRepository(getMongoService()),
    getAvatarStorageService(),
  );
