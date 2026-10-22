import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.ts";
import { getVisualisationPendingService } from "@/services/crud/visualisation-pending/index.ts";
import { PendingVisualisationCreationService } from "@/services/transactions/pending-visualisation-creation/pending-visualisation-creation.service.ts";
import { getAccountDeletionTombstoneService } from "@/services/account-deletion/index.ts";

const visualisationPendingService: VisualisationPendingService =
  getVisualisationPendingService();

const mongoService: MongoService = getMongoService();

const pendingVisualisationCreationServiceSingleton: PendingVisualisationCreationService =
  new PendingVisualisationCreationService(
    visualisationPendingService,
    mongoService,
    getAccountDeletionTombstoneService(),
  );

export const getPendingVisualisationCreationService =
  (): PendingVisualisationCreationService => {
    return pendingVisualisationCreationServiceSingleton;
  };
