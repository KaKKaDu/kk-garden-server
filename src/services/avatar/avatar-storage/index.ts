import { AvatarStorageRepository } from "@/services/avatar/avatar-storage/avatar-storage.repository.ts";
import { AvatarStorageService } from "@/services/avatar/avatar-storage/avatar-storage.service.ts";
import { getEnvService } from "@/services/env/index.ts";

const repositorySingleton: AvatarStorageRepository =
  new AvatarStorageRepository(getEnvService());
const serviceSingleton: AvatarStorageService = new AvatarStorageService(
  repositorySingleton,
);

export const getAvatarStorageService = (): AvatarStorageService =>
  serviceSingleton;
