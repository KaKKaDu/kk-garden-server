import { AvatarStorageRepository } from "@/services/avatar-storage/avatar-storage.repository.ts";
import { AvatarStorageService } from "@/services/avatar-storage/avatar-storage.service.ts";
import { getEnvService } from "@/services/env/index.ts";

export const getAvatarStorageService = (): AvatarStorageService => {
  return new AvatarStorageService(new AvatarStorageRepository(getEnvService()));
};
