import assert from "node:assert/strict";
import { mock } from "node:test";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { AssignRootRequestSchema } from "@kk-garden/shared/schemas";
import type {
  GardenDrawDataDto,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import { gardenDrawDataTransformer } from "@kk-garden/shared/transformers";
import { GardenGenerator } from "@lib/generations/generate/generate-garden.ts";
import { VisualisationPendingDtoMongoSchema } from "@/schemas/models/visualisation-pending-dto.mongo.schema.ts";
import { VisualisationPendingRepository } from "@/services/crud/visualisation-pending/visualisation-pending.repository.ts";
import { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.ts";
import { VisualisationRepository } from "@/services/crud/visualisation/visualisation.repository.ts";
import { VisualisationService } from "@/services/crud/visualisation/visualisation.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";

const assertOwnerPendingIndex = (): void => {
  const ownerPendingIndexExists: boolean =
    VisualisationPendingDtoMongoSchema.indexes().some(
      ([keys]): boolean => keys.ownerId === 1 && keys.pendingId === 1,
    );
  assert.equal(ownerPendingIndexExists, true);
};

const runSmoke = async (): Promise<void> => {
  const mongoService = {} as MongoService;
  const pendingRepository: VisualisationPendingRepository =
    new VisualisationPendingRepository(mongoService);
  const visualisationRepository: VisualisationRepository =
    new VisualisationRepository(mongoService);
  const visualisationService: VisualisationService = new VisualisationService(
    visualisationRepository,
  );
  const pendingService: VisualisationPendingService =
    new VisualisationPendingService(pendingRepository, visualisationService);

  const ownerId: string = "pending-owner-smoke";
  const pendingId: string = "pending-owner-smoke-batch";
  const visualisationId: string = "a".repeat(64);
  const data: GardenDrawDataDto = gardenDrawDataTransformer.toDto(
    GardenGenerator.generate(),
  );
  const createdPendingHolder: {
    value: VisualisationPendingDto | null;
  } = { value: null };
  let finalizedExists: boolean = false;
  let pendingFound: boolean = true;
  let finalCreateCalls: number = 0;
  let purgedOwnerId: string | null = null;
  let deletedBatch: { ownerId: string; pendingId: string } | null = null;

  mock.method(visualisationService, "resolveHashId", () => ({
    success: true,
    data: visualisationId,
  }));
  mock.method(pendingRepository, "existsByPendingIdAndVisualisationId", () =>
    Promise.resolve({ success: true, data: { exists: false } }),
  );
  mock.method(
    pendingRepository,
    "create",
    async (
      payload: VisualisationPendingDto,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      createdPendingHolder.value = payload;
      return { success: true, data: payload };
    },
  );
  mock.method(
    pendingRepository,
    "getByPendingIdAndVisualisationId",
    async (): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      if (!pendingFound) {
        return {
          success: false,
          errors: [
            new AppError({
              status: 404,
              message: "Pending visualisation not found",
            }),
          ],
        };
      }
      const createdPending: VisualisationPendingDto | null =
        createdPendingHolder.value;
      if (!createdPending) {
        throw new Error("Pending candidate was not created for the smoke test");
      }
      return { success: true, data: createdPending };
    },
  );
  mock.method(visualisationService, "existsById", async () => ({
    success: true,
    data: { exists: finalizedExists },
  }));
  mock.method(
    pendingRepository,
    "deleteByOwnerId",
    async (
      requestedOwnerId: string,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      purgedOwnerId = requestedOwnerId;
      return { success: true, data: [] };
    },
  );
  mock.method(
    pendingRepository,
    "deleteByPendingId",
    async (
      requestedOwnerId: string,
      requestedPendingId: string,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      deletedBatch = {
        ownerId: requestedOwnerId,
        pendingId: requestedPendingId,
      };
      return { success: true, data: [] };
    },
  );
  mock.method(
    visualisationService,
    "create",
    async (): Promise<SuccessDataAny<object>> => {
      finalCreateCalls++;
      return { success: true, data: {} };
    },
  );

  const createResult: SuccessDataAny<VisualisationPendingDto> =
    await pendingService.createFromData.direct(ownerId, pendingId, data);
  assert.equal(createResult.success, true);
  const createdPending: VisualisationPendingDto | null =
    createdPendingHolder.value;
  assert.ok(createdPending);
  assert.equal(createdPending.ownerId, ownerId);
  assert.equal(createdPending.pendingId, pendingId);
  assert.equal(
    AssignRootRequestSchema.safeParse({ visualisationId }).success,
    true,
  );
  assert.equal(
    AssignRootRequestSchema.safeParse({
      visualisationId,
      userId: "untrusted-client-id",
    }).success,
    false,
  );

  finalizedExists = true;
  const duplicateResult =
    await pendingService.persistByPendingIdAndVisualisationId.direct(
      ownerId,
      pendingId,
      visualisationId,
    );
  assert.equal(duplicateResult.success, false);
  if (!duplicateResult.success) {
    assert.equal(duplicateResult.errors[0]?.status, 409);
  }
  assert.equal(finalCreateCalls, 0);

  finalizedExists = false;
  const assignmentResult =
    await pendingService.persistByPendingIdAndVisualisationId.direct(
      ownerId,
      pendingId,
      visualisationId,
    );
  assert.equal(assignmentResult.success, true);
  assert.equal(finalCreateCalls, 1);
  const deletedBatchResult: { ownerId: string; pendingId: string } | null =
    deletedBatch;
  assert.deepEqual(deletedBatchResult, { ownerId, pendingId });

  pendingFound = false;
  const missingOwnerCandidateResult =
    await pendingService.persistByPendingIdAndVisualisationId.direct(
      "different-owner",
      pendingId,
      visualisationId,
    );
  assert.equal(missingOwnerCandidateResult.success, false);
  if (!missingOwnerCandidateResult.success) {
    assert.equal(missingOwnerCandidateResult.errors[0]?.status, 404);
  }
  assert.equal(finalCreateCalls, 1);
  const ownerPurgeResult = await pendingService.deleteByOwnerId.direct(ownerId);
  assert.equal(ownerPurgeResult.success, true);
  assert.equal(purgedOwnerId, ownerId);
  assertOwnerPendingIndex();
};

void runSmoke()
  .then((): void => {
    console.log("Pending owner smoke checks passed.");
  })
  .catch((error: unknown): void => {
    console.error(error);
    process.exitCode = 1;
  });
