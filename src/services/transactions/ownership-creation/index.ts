import { getVisualisationService } from "@/services/crud/visualisation/index.js";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.js";
import { getVisualisationPendingService } from "@/services/crud/visualisation-pending/index.js";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.js";
import { getUserService } from "@/services/crud/user/index.js";
import type { UserService } from "@/services/crud/user/user.service.js";
import type { SignatureService } from "@/services/crud/signature/signature.service.js";
import { getSignatureService } from "@/services/crud/signature/index.js";
import type { OwnershipService } from "@/services/crud/ownership/ownership.service.js";
import { getOwnershipService } from "@/services/crud/ownership/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import { getMongoService } from "@/services/mongo/index.js";
import { OwnershipCreationService } from "@/services/transactions/ownership-creation/ownership-creation.service.js";

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
  );

export const getOwnershipCreationService = (): OwnershipCreationService => {
  return ownershipCreationServiceSingleton;
};
