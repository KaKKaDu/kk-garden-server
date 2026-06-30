import { getMongoService } from "@/services/mongo/index.js";
import { VisualisationService } from "@/services/visualisation/visualisation.service.js";
import { VisualisationRepository } from "@/services/visualisation/visualisation.repository.js";

export const getVisualisationService = (): VisualisationService => {
  const mongoService = getMongoService();
  const repository: VisualisationRepository = new VisualisationRepository(
    mongoService,
  );
  return new VisualisationService(repository);
};
