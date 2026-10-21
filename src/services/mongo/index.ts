import { MongoService } from "@/services/mongo/mongo.service.ts";
import { MongoRepository } from "@/services/mongo/mongo.repository.ts";

const globalWithMongo = globalThis as unknown as {
  mongoService: MongoService | undefined;
};

export const getMongoService = (): MongoService => {
  if (!globalWithMongo.mongoService) {
    const repository: MongoRepository = new MongoRepository();
    globalWithMongo.mongoService = new MongoService(repository);
  }
  return globalWithMongo.mongoService;
};
