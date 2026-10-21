import { randomUUID } from "node:crypto";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import {
  ProfileAvatarUploadRequestSchema,
  type ProfileAvatarUploadRequest,
  type ProfileAvatarUploadResponse,
} from "@kk-garden/shared/schemas";
import type { ProfileAvatarUploadSession } from "@kk-garden/shared/types";
import type { AvatarUploadRepository } from "@/services/avatar-upload/avatar-upload.repository.ts";
import type { AvatarStorageService } from "@/services/avatar-storage/avatar-storage.service.ts";
import type { AvatarCleanupService } from "@/services/avatar-cleanup/avatar-cleanup.service.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import { Logger } from "@lib/logs/logger.ts";
import { Variables } from "@lib/variables/variables.ts";

const uploadVariables = Variables.of({
  "upload-expiry-ms": 900_000,
} as const);

export class AvatarUploadService {
  constructor(
    private readonly repository: AvatarUploadRepository,
    private readonly storage: AvatarStorageService,
    private readonly cleanup: AvatarCleanupService,
    private readonly users: UserService,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.repository.initialize();
  }

  async issue(
    ownerId: string,
    input: ProfileAvatarUploadRequest,
  ): Promise<SuccessDataAny<ProfileAvatarUploadResponse>> {
    let result: SuccessDataAny<ProfileAvatarUploadResponse>;
    try {
      const metadata: ProfileAvatarUploadRequest =
        ProfileAvatarUploadRequestSchema.parse(input);
      const user = await this.users.getById.direct(ownerId);
      if (!user.success) {
        return { success: false, errors: user.errors };
      }
      if (!user.data) {
        throw new AppError({
          status: 500,
          message: "Avatar owner lookup returned no data",
        });
      }
      if (user.data.status !== "active") {
        throw new AppError({
          status: 403,
          message: "Only active accounts can upload avatars",
        });
      }
      const now: Date = new Date();
      const upload: ProfileAvatarUploadSession = {
        _id: randomUUID(),
        ownerId,
        stagingObjectKey: `avatars/staging/${randomUUID()}`,
        ...metadata,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(
          now.getTime() + uploadVariables.get("upload-expiry-ms"),
        ),
        state: "pending",
        attempts: 0,
        retryAt: now,
      };
      const saved = await this.repository.create(upload);
      if (!saved.success) {
        return { success: false, errors: saved.errors };
      }
      if (!saved.data) {
        throw new AppError({
          status: 500,
          message: "Avatar upload persistence returned no data",
        });
      }
      const queued = await this.cleanup.enqueue({
        ownerId,
        target: {
          kind: "staging",
          uploadId: upload._id,
          objectKey: upload.stagingObjectKey,
        },
      });
      if (!queued.success) {
        return { success: false, errors: queued.errors };
      }
      if (!queued.data?.queued) {
        throw new AppError({
          status: 503,
          message: "Avatar upload cleanup was not scheduled",
        });
      }
      if (Date.now() >= new Date(upload.expiresAt).getTime()) {
        throw new AppError({
          status: 503,
          message: "Avatar upload expired before issuance; try again",
        });
      }
      const signed = await this.storage.issueUpload(
        metadata.contentType,
        upload.stagingObjectKey,
        now.getTime(),
      );
      if (!signed.success) {
        return { success: false, errors: signed.errors };
      }
      if (!signed.data) {
        throw new AppError({
          status: 502,
          message: "Avatar upload signing returned no data",
        });
      }
      result = {
        success: true,
        data: {
          uploadId: upload._id,
          uploadUrl: signed.data.url,
          expiresAt: signed.data.expiresAt,
        },
      };
    } catch (error: unknown) {
      result = handleError<ProfileAvatarUploadResponse>(error);
    }
    Logger.report("AvatarUploadService.issue", result);
    return result;
  }
}
