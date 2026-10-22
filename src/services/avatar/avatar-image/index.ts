import { AvatarImageService } from "@/services/avatar/avatar-image/avatar-image.service.ts";

const serviceSingleton: AvatarImageService = new AvatarImageService();

export const getAvatarImageService = (): AvatarImageService => serviceSingleton;
