import { ProfileRepository } from "@/services/crud/profile/profile.repository.js";
import { ProfileService } from "@/services/crud/profile/profile.service.js";
import { getUserService } from "@/services/crud/user/index.js";
import type { UserService } from "@/services/crud/user/user.service.js";
import { getMongoService } from "@/services/mongo/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";

const mongoService: MongoService = getMongoService();
const repository: ProfileRepository = new ProfileRepository(mongoService);
const userService: UserService = getUserService();
const serviceSingleton: ProfileService = new ProfileService(
  repository,
  userService,
);

export const getProfileService = (): ProfileService => {
  return serviceSingleton;
};
