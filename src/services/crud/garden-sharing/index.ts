import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";
import { GardenSharingService } from "@/services/crud/garden-sharing/garden-sharing.service.ts";
import { getProfileLookupService } from "@/services/crud/profile-lookup/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import {
  getGardenSharingRepository,
  getGardenSharingTransactionService,
} from "@/services/transactions/garden-sharing/index.ts";

const serviceSingleton = new GardenSharingService(
  getGardenSharingRepository(),
  getGardenSharingTransactionService(),
  getProfileLookupService(),
  getUserService(),
  getAccountDeletionTombstoneService(),
);

export const getGardenSharingService = (): GardenSharingService => {
  return serviceSingleton;
};
