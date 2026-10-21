import type { AvatarCleanupService } from "@/services/avatar-cleanup/avatar-cleanup.service.ts";
import { AvatarUploadRepository } from "@/services/avatar-upload/avatar-upload.repository.ts";
import { AvatarUploadService } from "@/services/avatar-upload/avatar-upload.service.ts";
import { getAvatarStorageService } from "@/services/avatar-storage/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import { getMongoService } from "@/services/mongo/index.ts";

export const getAvatarUploadService = (
  cleanup: AvatarCleanupService,
): AvatarUploadService =>
  new AvatarUploadService(
    new AvatarUploadRepository(getMongoService()),
    getAvatarStorageService(),
    cleanup,
    getUserService(),
  );
