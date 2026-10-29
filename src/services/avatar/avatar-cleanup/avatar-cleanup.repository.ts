import { Agenda, exponential, type Job } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";
import type { Mongoose } from "mongoose";
import {
  AvatarCleanupTargetSchema,
  ProfileAvatarUploadSessionSchema,
  UserIdSchema,
} from "@kk-garden/shared/schemas";
import type {
  Nullable,
  Profile,
  ProfileAvatarUploadSession,
} from "@kk-garden/shared/types";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getConfiguredMongoDatabase } from "@/services/mongo/mongo.repository.ts";
import type {
  AvatarCleanupContext,
  AvatarCleanupData,
  AvatarCleanupJobData,
} from "@/services/avatar/avatar-cleanup/types.ts";
import { Logger } from "@lib/logs/logger.ts";
import { Variables } from "@lib/variables/variables.ts";

const cleanupVariables = Variables.of({
  "job-name": "avatar.delete",
  "collection-name": "avatar_cleanup_jobs",
  "poll-interval-ms": 10_000,
  "lock-lifetime-ms": 120_000,
} as const);

export class AvatarCleanupRepository {
  private agenda?: Agenda;

  constructor(private readonly mongoService: MongoService) {}

  start(
    handler: (job: Job<AvatarCleanupJobData>) => Promise<void>,
  ): Promise<SuccessDataAny<{ started: true }>> {
    return this.mongoService.execute(async (connection: Mongoose) => {
      if (this.agenda) {
        throw new Error("Avatar cleanup is already started");
      }
      const db = getConfiguredMongoDatabase(connection);
      const legacyJob = await db
        .collection(cleanupVariables.get("collection-name"))
        .findOne({ state: { $exists: true } }, { projection: { _id: 1 } });
      if (legacyJob) {
        throw new Error(
          "Legacy avatar cleanup jobs require migration before starting Agenda",
        );
      }
      await db
        .collection(cleanupVariables.get("collection-name"))
        .createIndex({ name: 1, "data.target.objectKey": 1 }, { unique: true });
      await db.collection(cleanupVariables.get("collection-name")).createIndex(
        { "data.queuedAt": 1 },
        {
          name: "avatar_cleanup_jobs_queued_at_ttl_72h",
          expireAfterSeconds: 259200,
        },
      );
      const agenda: Agenda = new Agenda({
        backend: new MongoBackend({
          mongo: db,
          collection: cleanupVariables.get("collection-name"),
        }),
        processEvery: cleanupVariables.get("poll-interval-ms"),
        maxConcurrency: 1,
        lockLimit: 1,
      });
      agenda.define<AvatarCleanupJobData>(
        cleanupVariables.get("job-name"),
        handler,
        {
          concurrency: 1,
          lockLifetime: cleanupVariables.get("lock-lifetime-ms"),
          backoff: exponential({
            delay: 15_000,
            maxDelay: 3_600_000,
            maxRetries: 7,
          }),
        },
      );
      agenda.on("error", (): void =>
        Logger.error("Avatar cleanup scheduler error"),
      );
      agenda.on("fail", (): void =>
        Logger.error("Avatar cleanup job failed; inspect Agenda job state"),
      );
      agenda.on("retry exhausted", (): void =>
        Logger.error("Avatar cleanup retries exhausted; intervention required"),
      );
      await agenda.start();
      this.agenda = agenda;
      return { started: true };
    }, "AvatarCleanupRepository.start");
  }

  async stop(): Promise<SuccessDataAny<{ stopped: true }>> {
    let result: SuccessDataAny<{ stopped: true }>;
    try {
      await this.agenda?.drain({ closeConnection: false });
      this.agenda = undefined;
      result = { success: true, data: { stopped: true } };
    } catch (error: unknown) {
      result = handleError<{ stopped: true }>(error);
    }
    Logger.report("AvatarCleanupRepository.stop", result);
    return result;
  }

  enqueue(data: AvatarCleanupData): Promise<SuccessDataAny<{ queued: true }>> {
    return this.mongoService.execute(async (): Promise<{ queued: true }> => {
      if (!this.agenda) {
        throw new Error("Avatar cleanup has not started");
      }
      const payload: AvatarCleanupJobData = {
        ownerId: UserIdSchema.min(1).parse(data.ownerId),
        target: AvatarCleanupTargetSchema.parse(data.target),
        queuedAt: new Date(),
      };
      await this.agenda
        .create<AvatarCleanupJobData>(cleanupVariables.get("job-name"), payload)
        .unique(
          { "data.target.objectKey": payload.target.objectKey },
          { insertOnly: true },
        )
        .schedule(new Date())
        .save();
      return { queued: true };
    }, "AvatarCleanupRepository.enqueue");
  }

  getContext(
    data: AvatarCleanupData,
  ): Promise<SuccessDataAny<AvatarCleanupContext>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<AvatarCleanupContext> => {
        const db = getConfiguredMongoDatabase(connection);
        const profiles = db.collection<Profile>("profiles");
        const uploads = db.collection<ProfileAvatarUploadSession>(
          "profile_avatar_upload_sessions",
        );
        const upload: Nullable<ProfileAvatarUploadSession> =
          await uploads.findOne(
            data.target.kind === "displaced-avatar"
              ? {
                  state: "processing",
                  candidateObjectKey: data.target.objectKey,
                }
              : { _id: data.target.uploadId, ownerId: data.ownerId },
          );
        // Read upload state before the profile so a concurrent promotion cannot escape both checks.
        const isProfileAvatarTarget: boolean = data.target.kind !== "staging";
        const referenced: boolean = isProfileAvatarTarget
          ? (await profiles.findOne(
              { avatarObjectKey: data.target.objectKey },
              { projection: { _id: 1 } },
            )) !== null
          : false;
        return {
          referenced,
          upload: upload
            ? ProfileAvatarUploadSessionSchema.parse(upload)
            : null,
        };
      },
      "AvatarCleanupRepository.getContext",
    );
  }

  removeAccountUploadIfComplete(
    uploadId: string,
    ownerId: string,
    currentJobId: string,
  ): Promise<SuccessDataAny<{ removed: boolean }>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<{ removed: boolean }> => {
        if (!this.agenda) {
          throw new Error("Avatar cleanup has not started");
        }
        const db = getConfiguredMongoDatabase(connection);
        const uploads = db.collection<ProfileAvatarUploadSession>(
          "profile_avatar_upload_sessions",
        );
        const upload = await uploads.findOne({ _id: uploadId, ownerId });
        if (!upload) {
          return { removed: true };
        }

        const objectKeys = [
          upload.stagingObjectKey,
          ...(upload.state === "processing"
            ? [upload.candidateObjectKey]
            : upload.state === "completed"
              ? [upload.result.objectKey]
              : []),
        ];
        for (const objectKey of new Set(objectKeys)) {
          const jobs = await this.agenda.queryJobs({
            name: cleanupVariables.get("job-name"),
            data: { target: { objectKey } },
          });
          const cleanupJob = jobs.jobs[0];
          if (!cleanupJob) {
            return { removed: false };
          }
          if (
            String(cleanupJob._id) !== currentJobId &&
            cleanupJob.state !== "completed"
          ) {
            return { removed: false };
          }
        }

        await uploads.deleteOne({ _id: uploadId, ownerId });
        return { removed: true };
      },
      "AvatarCleanupRepository.removeAccountUploadIfComplete",
    );
  }
}
