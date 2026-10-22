import { getMongoService } from "@/services/mongo/index.ts";
import { AccountDeletionTombstoneRepository } from "@/services/account-deletion/account-deletion-tombstone.repository.ts";
import { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";

const repositorySingleton = new AccountDeletionTombstoneRepository(
  getMongoService(),
);
const serviceSingleton = new AccountDeletionTombstoneService(
  repositorySingleton,
);

export const getAccountDeletionTombstoneService =
  (): AccountDeletionTombstoneService => serviceSingleton;
