import { getMongoService } from "@/services/mongo/index.ts";
import { UserRepository } from "@/services/crud/user/user.repository.ts";
import { UserService } from "@/services/crud/user/user.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";

const mongoService: MongoService = getMongoService();
const repositorySingleton: UserRepository = new UserRepository(mongoService);
const serviceSingleton: UserService = new UserService(repositorySingleton);

export const getUserService = (): UserService => {
  return serviceSingleton;
};
