import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { AvatarStorageRepository } from "@/services/avatar/avatar-storage/avatar-storage.repository.ts";
import type {
  AvatarContentType,
  AvatarStorageMetadata,
  AvatarStorageObject,
  AvatarStorageSignedUrl,
  AvatarStorageUpload,
} from "@/services/avatar/avatar-storage/types.ts";

export class AvatarStorageService {
  constructor(private readonly repository: AvatarStorageRepository) {}

  issueUpload(
    contentType: AvatarContentType,
    objectKey?: string,
    issuedAt?: number,
  ): Promise<SuccessDataAny<AvatarStorageUpload>> {
    return this.repository.issueUpload(contentType, objectKey, issuedAt);
  }

  signRead(objectKey: string): Promise<SuccessDataAny<AvatarStorageSignedUrl>> {
    return this.repository.signRead(objectKey);
  }

  inspectStaging(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageMetadata>> {
    return this.repository.inspectStaging(objectKey);
  }

  readStaging(
    objectKey: string,
    signal?: AbortSignal,
  ): Promise<SuccessDataAny<Buffer>> {
    return this.repository.readStaging(objectKey, signal);
  }

  putFinal(
    bytes: Buffer,
    objectKey: string,
    signal?: AbortSignal,
  ): Promise<SuccessDataAny<AvatarStorageObject>> {
    return this.repository.putFinal(bytes, objectKey, signal);
  }

  deleteObject(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageObject>> {
    return this.repository.deleteObject(objectKey);
  }
}
