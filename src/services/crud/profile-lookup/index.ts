import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";
import { getAvatarStorageService } from "@/services/avatar/avatar-storage/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import { ProfileLookupRepository } from "@/services/crud/profile-lookup/profile-lookup.repository.ts";
import { ProfileLookupService } from "@/services/crud/profile-lookup/profile-lookup.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";

const mongoService: MongoService = getMongoService();
const lookupRepository: ProfileLookupRepository = new ProfileLookupRepository(
  mongoService,
);
const serviceSingleton: ProfileLookupService = new ProfileLookupService(
  lookupRepository,
  getUserService(),
  mongoService,
  getAvatarStorageService(),
  getAccountDeletionTombstoneService(),
);

export const getProfileLookupService = (): ProfileLookupService => {
  return serviceSingleton;
};
