import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { AvatarStorageRepository } from "@/services/avatar-storage/avatar-storage.repository.ts";
import type {
  AvatarContentType,
  AvatarStorageMetadata,
  AvatarStorageObject,
  AvatarStorageSignedUrl,
  AvatarStorageUpload,
} from "@/services/avatar-storage/types.ts";

export class AvatarStorageService {
  constructor(private readonly repository: AvatarStorageRepository) {}

  issueUpload(
    contentType: AvatarContentType,
  ): Promise<SuccessDataAny<AvatarStorageUpload>> {
    return this.repository.issueUpload(contentType);
  }

  signRead(objectKey: string): Promise<SuccessDataAny<AvatarStorageSignedUrl>> {
    return this.repository.signRead(objectKey);
  }

  inspectStaging(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageMetadata>> {
    return this.repository.inspectStaging(objectKey);
  }

  readStaging(objectKey: string): Promise<SuccessDataAny<Buffer>> {
    return this.repository.readStaging(objectKey);
  }

  putFinal(bytes: Buffer): Promise<SuccessDataAny<AvatarStorageObject>> {
    return this.repository.putFinal(bytes);
  }

  deleteObject(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageObject>> {
    return this.repository.deleteObject(objectKey);
  }
}
