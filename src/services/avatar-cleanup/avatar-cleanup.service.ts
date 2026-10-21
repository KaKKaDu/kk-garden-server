import type { Job } from "agenda";
import {
  AvatarCleanupTargetSchema,
  UserIdSchema,
} from "@kk-garden/shared/schemas";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { AvatarCleanupRepository } from "@/services/avatar-cleanup/avatar-cleanup.repository.ts";
import type { AvatarStorageService } from "@/services/avatar-storage/avatar-storage.service.ts";
import type {
  AvatarCleanupContext,
  AvatarCleanupData,
} from "@/services/avatar-cleanup/types.ts";
import { Variables } from "@lib/variables/variables.ts";

const cleanupVariables = Variables.of({
  "reference-recheck-ms": 300_000,
  "late-write-grace-ms": 120_000,
} as const);

export class AvatarCleanupService {
  constructor(
    private readonly repository: AvatarCleanupRepository,
    private readonly storageService: AvatarStorageService,
  ) {}

  start(): Promise<SuccessDataAny<{ started: true }>> {
    return this.repository.start(
      (job: Job<AvatarCleanupData>): Promise<void> => this.deleteAvatar(job),
    );
  }

  stop(): Promise<SuccessDataAny<{ stopped: true }>> {
    return this.repository.stop();
  }

  enqueue(data: AvatarCleanupData): Promise<SuccessDataAny<{ queued: true }>> {
    return this.repository.enqueue(data);
  }

  private async deleteAvatar(job: Job<AvatarCleanupData>): Promise<void> {
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
    const { referenced, upload } = result.data;
    if (data.target.kind !== "displaced-avatar" && !upload) {
      throw new Error("upload-session-unavailable");
    }
    const activeUpload: boolean =
      upload?.state === "processing" ||
      (data.target.kind === "staging" &&
        upload?.state === "pending" &&
        new Date(upload.expiresAt).getTime() > Date.now());
    const safeAfter: number = upload
      ? new Date(upload.updatedAt).getTime() +
        cleanupVariables.get("late-write-grace-ms")
      : 0;
    if (referenced || activeUpload || Date.now() < safeAfter) {
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
  }
}
