import type { z } from "zod";
import type { avatarStorageEnvSchema } from "@/../env-vars/env.schema.ts";
import type { ProfileAvatarUploadRequest } from "@kk-garden/shared/schemas";

export type AvatarStorageConfig = z.infer<typeof avatarStorageEnvSchema>;
export type AvatarContentType = ProfileAvatarUploadRequest["contentType"];

export type AvatarStorageSignedUrl = {
  url: string;
  expiresAt: string;
};

export type AvatarStorageUpload = AvatarStorageSignedUrl & {
  objectKey: string;
};

export type AvatarStorageMetadata = {
  byteSize: number;
  contentType?: string;
  etag?: string;
};

export type AvatarStorageObject = {
  objectKey: string;
};
