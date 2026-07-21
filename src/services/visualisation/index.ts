import { getMongoService } from "@/services/mongo/index.js";
import { VisualisationService } from "@/services/visualisation/visualisation.service.js";
import { VisualisationRepository } from "@/services/visualisation/visualisation.repository.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";

const mongoService: MongoService = getMongoService();
const repositorySingleton: VisualisationRepository =
  new VisualisationRepository(mongoService);
const serviceSingleton: VisualisationService = new VisualisationService(
  repositorySingleton,
);

export const getVisualisationService = (): VisualisationService => {
  return serviceSingleton;
};
