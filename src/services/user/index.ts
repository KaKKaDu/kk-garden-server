import { getMongoService } from "@/services/mongo/index.js";
import { UserRepository } from "@/services/user/user.repository.js";
import { UserService } from "@/services/user/user.service.js";

export const getUserService = (): UserService => {
  const mongoService = getMongoService();
  const repository: UserRepository = new UserRepository(mongoService);
  return new UserService(repository);
};
