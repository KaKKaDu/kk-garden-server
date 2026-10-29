import type { Job } from "agenda";
import {
  AvatarCleanupTargetSchema,
  UserIdSchema,
} from "@kk-garden/shared/schemas";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import type { AvatarCleanupRepository } from "@/services/avatar/avatar-cleanup/avatar-cleanup.repository.ts";
import type { AvatarStorageService } from "@/services/avatar/avatar-storage/avatar-storage.service.ts";
import type { AvatarUploadRepository } from "@/services/avatar/avatar-upload/avatar-upload.repository.ts";
import type {
  AvatarCleanupContext,
  AvatarCleanupData,
  AvatarCleanupJobData,
} from "@/services/avatar/avatar-cleanup/types.ts";
import type { AvatarUploadClaim } from "@/services/avatar/avatar-upload/types.ts";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/account-deletion-tombstone.service.ts";
import { Variables } from "@lib/variables/variables.ts";

const cleanupVariables = Variables.of({
  "reference-recheck-ms": 300_000,
  "late-write-grace-ms": 120_000,
} as const);

export class AvatarCleanupService {
  constructor(
    private readonly repository: AvatarCleanupRepository,
    private readonly storageService: AvatarStorageService,
    private readonly uploads: AvatarUploadRepository,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  start(): Promise<SuccessDataAny<{ started: true }>> {
    return this.repository.start(
      (job: Job<AvatarCleanupJobData>): Promise<void> => this.deleteAvatar(job),
    );
  }

  stop(): Promise<SuccessDataAny<{ stopped: true }>> {
    return this.repository.stop();
  }

  enqueue(data: AvatarCleanupData): Promise<SuccessDataAny<{ queued: true }>> {
    return this.repository.enqueue(data);
  }

  private async deleteAvatar(job: Job<AvatarCleanupJobData>): Promise<void> {
    const owner = UserIdSchema.min(1).safeParse(job.attrs.data.ownerId);
    const target = AvatarCleanupTargetSchema.safeParse(job.attrs.data.target);
    if (!owner.success || !target.success) {
      throw new Error("invalid-avatar-cleanup-data");
    }
    const data: AvatarCleanupData = {
      ownerId: owner.data,
      target: target.data,
    };
    const result: SuccessDataAny<AvatarCleanupContext> =
      await this.repository.getContext(data);
    if (!result.success || !result.data) {
      throw new Error("database-unavailable");
    }
    let { referenced, upload } = result.data;
    if (upload?.state === "processing") {
      const claimExpired: boolean =
        new Date(upload.claim.leaseExpiresAt).getTime() <= Date.now();
      if (claimExpired) {
        const recovered = await this.uploads.recoverStaleProcessing(
          upload._id,
          upload.ownerId,
          upload.claim.token,
          new Date(),
        );
        if (!recovered.success) {
          throw new Error("avatar-processing-recovery-unavailable");
        }
        if (recovered.data?.updated) {
          const refreshed = await this.repository.getContext(data);
          if (!refreshed.success || !refreshed.data) {
            throw new Error("database-unavailable");
          }
          referenced = refreshed.data.referenced;
          upload = refreshed.data.upload;
        }
      }
    }
    if (data.target.kind !== "displaced-avatar" && !upload) {
      throw new Error("upload-session-unavailable");
    }
    const processingUpload: Nullable<AvatarUploadClaim> =
      upload?.state === "processing" ? upload : null;
    const isStagingTarget: boolean = data.target.kind === "staging";
    const isCandidateTarget: boolean = data.target.kind === "candidate";
    const hasProcessingUpload: boolean = Boolean(processingUpload);
    const activeProcessingStaging: boolean =
      isStagingTarget && hasProcessingUpload;
    const candidateKeyMatches: boolean =
      processingUpload?.candidateObjectKey === data.target.objectKey;
    const activeProcessingCandidate: boolean =
      isCandidateTarget && candidateKeyMatches;
    const activeProcessingTarget: boolean =
      activeProcessingStaging || activeProcessingCandidate;
    const stagingNotExpired: boolean =
      upload?.state === "pending" &&
      new Date(upload.expiresAt).getTime() > Date.now();
    const activePendingStaging: boolean = isStagingTarget && stagingNotExpired;
    const activeUpload: boolean =
      activeProcessingTarget || activePendingStaging;
    let safeAfter: number = upload
      ? new Date(upload.updatedAt).getTime() +
        cleanupVariables.get("late-write-grace-ms")
      : 0;
    if (upload && data.target.kind === "staging") {
      safeAfter = Math.max(
        safeAfter,
        new Date(upload.expiresAt).getTime() +
          cleanupVariables.get("late-write-grace-ms"),
      );
    }
    const cleanupProtected: boolean = referenced || activeUpload;
    const gracePeriodActive: boolean = Date.now() < safeAfter;
    if (cleanupProtected || gracePeriodActive) {
      job.schedule(
        new Date(
          Math.max(
            Date.now() + cleanupVariables.get("reference-recheck-ms"),
            safeAfter,
          ),
        ),
      );
      await job.save();
      return;
    }
    await job.touch();
    const deleted = await this.storageService.deleteObject(
      data.target.objectKey,
    );
    if (!deleted.success) {
      throw new Error("storage-unavailable");
    }
    if (data.target.kind !== "displaced-avatar") {
      const accountIsDeleted: boolean = await this.tombstones.isDeleted(
        data.ownerId,
      );
      if (accountIsDeleted) {
        const uploadRemoval =
          await this.repository.removeAccountUploadIfComplete(
            data.target.uploadId,
            data.ownerId,
            String(job.attrs._id),
          );
        if (!uploadRemoval.success) {
          throw new Error("avatar-upload-cleanup-state-unavailable");
        }
      }
    }
  }
}
