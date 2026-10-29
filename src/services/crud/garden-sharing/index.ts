import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";
import { GardenSharingService } from "@/services/crud/garden-sharing/garden-sharing.service.ts";
import { getProfileService } from "@/services/crud/profile/index.ts";
import { getProfileLookupService } from "@/services/crud/profile-lookup/index.ts";
import { getOwnershipService } from "@/services/crud/ownership/index.ts";
import { getSignatureService } from "@/services/crud/signature/index.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import { getVisualisationService } from "@/services/crud/visualisation/index.ts";
import {
  getGardenSharingRepository,
  getGardenSharingTransactionService,
} from "@/services/transactions/garden-sharing/index.ts";

const serviceSingleton = new GardenSharingService(
  getGardenSharingRepository(),
  getGardenSharingTransactionService(),
  getProfileLookupService(),
  getProfileService(),
  getUserService(),
  getAccountDeletionTombstoneService(),
  getOwnershipService(),
  getSignatureService(),
  getVisualisationService(),
);

export const getGardenSharingService = (): GardenSharingService => {
  return serviceSingleton;
};
