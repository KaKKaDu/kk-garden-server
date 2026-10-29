import { getMongoService } from "@/services/mongo/index.ts";
import { AccountDeletionRepository } from "@/services/account-deletion/account-deletion.repository.ts";
import { AccountDeletionService } from "@/services/account-deletion/account-deletion.service.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/index.ts";
import { getAvatarCleanupService } from "@/services/avatar/avatar-cleanup/index.ts";
import { getProfileLookupService } from "@/services/crud/profile-lookup/index.ts";
import { getGardenSharingRepository } from "@/services/transactions/garden-sharing/index.ts";

const mongoService = getMongoService();
const repository = new AccountDeletionRepository(mongoService);

const deletionServiceSingleton = new AccountDeletionService(
  mongoService,
  repository,
  getAccountDeletionTombstoneService(),
  getAvatarCleanupService(),
  getProfileLookupService(),
  getGardenSharingRepository(),
);

export const getAccountDeletionService = (): AccountDeletionService =>
  deletionServiceSingleton;

export { getAccountDeletionTombstoneService };
