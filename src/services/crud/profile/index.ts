import { ProfileRepository } from "@/services/crud/profile/profile.repository.ts";
import { ProfileService } from "@/services/crud/profile/profile.service.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { AvatarUploadRepository } from "@/services/avatar/avatar-upload/avatar-upload.repository.ts";
import { getAvatarStorageService } from "@/services/avatar/avatar-storage/index.ts";
import { getAvatarCleanupService } from "@/services/avatar/avatar-cleanup/index.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";

const mongoService: MongoService = getMongoService();
const repository: ProfileRepository = new ProfileRepository(mongoService);
const userService: UserService = getUserService();
const serviceSingleton: ProfileService = new ProfileService(
  repository,
  userService,
  new AvatarUploadRepository(mongoService),
  mongoService,
  getAvatarStorageService(),
  getAvatarCleanupService(),
  getAccountDeletionTombstoneService(),
);

export const getProfileService = (): ProfileService => {
  return serviceSingleton;
};
