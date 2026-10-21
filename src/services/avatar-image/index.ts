import { AvatarImageService } from "@/services/avatar-image/avatar-image.service.ts";

export const getAvatarImageService = (): AvatarImageService => {
  return new AvatarImageService();
};
