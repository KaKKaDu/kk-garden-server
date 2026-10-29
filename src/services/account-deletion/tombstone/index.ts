import { AccountDeletionTombstoneRepository } from "@/services/account-deletion/tombstone/account-deletion-tombstone.repository.ts";
import { AccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/account-deletion-tombstone.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";

const repositorySingleton = new AccountDeletionTombstoneRepository(
  getMongoService(),
);
const serviceSingleton = new AccountDeletionTombstoneService(
  repositorySingleton,
);

export const getAccountDeletionTombstoneService =
  (): AccountDeletionTombstoneService => serviceSingleton;
