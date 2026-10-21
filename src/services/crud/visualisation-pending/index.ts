import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getMongoService } from "@/services/mongo/index.ts";
import { VisualisationPendingRepository } from "@/services/crud/visualisation-pending/visualisation-pending.repository.ts";
import { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.ts";
import { getVisualisationService } from "@/services/crud/visualisation/index.ts";

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
