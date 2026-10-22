import { AvatarUploadRepository } from "@/services/avatar/avatar-upload/avatar-upload.repository.ts";
import { AvatarUploadService } from "@/services/avatar/avatar-upload/avatar-upload.service.ts";
import { getAvatarImageService } from "@/services/avatar/avatar-image/index.ts";
import { getAvatarStorageService } from "@/services/avatar/avatar-storage/index.ts";
import { getAvatarCleanupService } from "@/services/avatar/avatar-cleanup/index.ts";
import { getProfileService } from "@/services/crud/profile/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import { getMongoService } from "@/services/mongo/index.ts";

const repositorySingleton: AvatarUploadRepository = new AvatarUploadRepository(
  getMongoService(),
);
const serviceSingleton: AvatarUploadService = new AvatarUploadService(
  repositorySingleton,
  getAvatarStorageService(),
  getAvatarCleanupService(),
  getUserService(),
  getProfileService(),
  getAvatarImageService(),
);

export const getAvatarUploadService = (): AvatarUploadService =>
  serviceSingleton;

export const getAvatarUploadRepository = (): AvatarUploadRepository =>
  repositorySingleton;
