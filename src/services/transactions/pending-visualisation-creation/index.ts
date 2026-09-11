import type { MongoService } from "@/services/mongo/mongo.service.js";
import { getMongoService } from "@/services/mongo/index.js";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.js";
import { getVisualisationPendingService } from "@/services/crud/visualisation-pending/index.js";
import { PendingVisualisationCreationService } from "@/services/transactions/pending-visualisation-creation/pending-visualisation-creation.service.js";

const visualisationPendingService: VisualisationPendingService =
  getVisualisationPendingService();

const mongoService: MongoService = getMongoService();

const pendingVisualisationCreationServiceSingleton: PendingVisualisationCreationService =
  new PendingVisualisationCreationService(
    visualisationPendingService,
    mongoService,
  );

export const getPendingVisualisationCreationService =
  (): PendingVisualisationCreationService => {
    return pendingVisualisationCreationServiceSingleton;
  };
