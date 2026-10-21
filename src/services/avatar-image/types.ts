import type { ProfileAvatarUploadRequest } from "@kk-garden/shared/schemas";

export type AvatarImageContentType = ProfileAvatarUploadRequest["contentType"];

export type NormalizedAvatarImage = {
  bytes: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
};
