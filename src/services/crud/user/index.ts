import { getMongoService } from "@/services/mongo/index.js";
import { UserRepository } from "@/services/crud/user/user.repository.js";
import { UserService } from "@/services/crud/user/user.service.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";

const mongoService: MongoService = getMongoService();
const repositorySingleton: UserRepository = new UserRepository(mongoService);
const serviceSingleton: UserService = new UserService(repositorySingleton);

export const getUserService = (): UserService => {
  return serviceSingleton;
};
