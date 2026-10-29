import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { GardenSharingRepository } from "@/services/crud/garden-sharing/garden-sharing.repository.ts";
import { GardenSharingTransactionService } from "@/services/transactions/garden-sharing/garden-sharing-transaction.service.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import { getMongoService } from "@/services/mongo/index.ts";

const mongoService: MongoService = getMongoService();
const repositorySingleton: GardenSharingRepository =
  new GardenSharingRepository(mongoService);
const transactionServiceSingleton: GardenSharingTransactionService =
  new GardenSharingTransactionService(
    repositorySingleton,
    mongoService,
    getUserService(),
    getAccountDeletionTombstoneService(),
  );

export const getGardenSharingRepository = (): GardenSharingRepository =>
  repositorySingleton;

export const getGardenSharingTransactionService =
  (): GardenSharingTransactionService => transactionServiceSingleton;
