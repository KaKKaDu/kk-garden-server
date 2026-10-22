import { getMongoService } from "@/services/mongo/index.ts";
import { AccountDeletionService } from "@/services/account-deletion/account-deletion.service.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/index.ts";
import { getAvatarCleanupService } from "@/services/avatar/avatar-cleanup/index.ts";

const deletionServiceSingleton = new AccountDeletionService(
  getMongoService(),
  getAccountDeletionTombstoneService(),
  getAvatarCleanupService(),
);

export const getAccountDeletionService = (): AccountDeletionService =>
  deletionServiceSingleton;

export { getAccountDeletionTombstoneService };
