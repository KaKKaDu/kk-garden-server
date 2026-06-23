import { getMongoService } from "@/services/mongo/index.js";
import { GardenDrawDataRepository } from "@/services/garden-draw-data/garden-draw-data.repository.js";
import { GardenDrawDataService } from "@/services/garden-draw-data/garden-draw-data.service.js";

export const getGardenDrawDataService = (): GardenDrawDataService => {
  const mongoService = getMongoService();
  const repository: GardenDrawDataRepository = new GardenDrawDataRepository(
    mongoService,
  );
  return new GardenDrawDataService(repository);
};
