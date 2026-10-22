import { AvatarCleanupService } from "@/services/avatar/avatar-cleanup/avatar-cleanup.service.ts";
import { getAvatarStorageService } from "@/services/avatar/avatar-storage/index.ts";
import { AvatarCleanupRepository } from "@/services/avatar/avatar-cleanup/avatar-cleanup.repository.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import { AvatarUploadRepository } from "@/services/avatar/avatar-upload/avatar-upload.repository.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/index.ts";

const mongoService = getMongoService();
const repositorySingleton: AvatarCleanupRepository =
  new AvatarCleanupRepository(mongoService);
const uploadRepositorySingleton: AvatarUploadRepository =
  new AvatarUploadRepository(mongoService);
const serviceSingleton: AvatarCleanupService = new AvatarCleanupService(
  repositorySingleton,
  getAvatarStorageService(),
  uploadRepositorySingleton,
  getAccountDeletionTombstoneService(),
);

export const getAvatarCleanupService = (): AvatarCleanupService =>
  serviceSingleton;
