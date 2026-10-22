import { getVisualisationService } from "@/services/crud/visualisation/index.ts";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.ts";
import { getVisualisationPendingService } from "@/services/crud/visualisation-pending/index.ts";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.ts";
import { getUserService } from "@/services/crud/user/index.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import type { SignatureService } from "@/services/crud/signature/signature.service.ts";
import { getSignatureService } from "@/services/crud/signature/index.ts";
import type { OwnershipService } from "@/services/crud/ownership/ownership.service.ts";
import { getOwnershipService } from "@/services/crud/ownership/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import { OwnershipCreationService } from "@/services/transactions/ownership-creation/ownership-creation.service.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";

const visualisationService: VisualisationService = getVisualisationService();
const visualisationPendingService: VisualisationPendingService =
  getVisualisationPendingService();

const userService: UserService = getUserService();

const signatureService: SignatureService = getSignatureService();

const ownershipService: OwnershipService = getOwnershipService();

const mongoService: MongoService = getMongoService();

const ownershipCreationServiceSingleton: OwnershipCreationService =
  new OwnershipCreationService(
    ownershipService,
    userService,
    signatureService,
    visualisationService,
    visualisationPendingService,
    mongoService,
    getAccountDeletionTombstoneService(),
  );

export const getOwnershipCreationService = (): OwnershipCreationService => {
  return ownershipCreationServiceSingleton;
};
