import { getMongoService } from "@/services/mongo/index.ts";
import { VisualisationService } from "@/services/crud/visualisation/visualisation.service.ts";
import { VisualisationRepository } from "@/services/crud/visualisation/visualisation.repository.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";

const mongoService: MongoService = getMongoService();
const repositorySingleton: VisualisationRepository =
  new VisualisationRepository(mongoService);
const serviceSingleton: VisualisationService = new VisualisationService(
  repositorySingleton,
);

export const getVisualisationService = (): VisualisationService => {
  return serviceSingleton;
};
