import type { MongoService } from "@/services/mongo/mongo.service.js";
import { getMongoService } from "@/services/mongo/index.js";
import { VisualisationPendingRepository } from "@/services/crud/visualisation-pending/visualisation-pending.repository.js";
import { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.js";
import { getVisualisationService } from "@/services/crud/visualisation/index.js";

const mongoService: MongoService = getMongoService();

const repositorySingleton: VisualisationPendingRepository =
  new VisualisationPendingRepository(mongoService);

const serviceSingleton: VisualisationPendingService =
  new VisualisationPendingService(
    repositorySingleton,
    getVisualisationService(),
  );

export const getVisualisationPendingService =
  (): VisualisationPendingService => {
    return serviceSingleton;
  };
