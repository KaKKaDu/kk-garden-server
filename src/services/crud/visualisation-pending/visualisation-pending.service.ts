import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import type {
  GardenDrawDataDto,
  Nullable,
  VisualisationDto,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import type { VisualisationPendingRepository } from "@/services/crud/visualisation-pending/visualisation-pending.repository.ts";
import type { CreateVisualisationPendingPayload } from "@/services/crud/visualisation-pending/types.ts";
import type { CreateVisualisationPayload } from "@/services/crud/visualisation/types.ts";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.ts";
import { transactional } from "@/types/mongo.types.ts";

export class VisualisationPendingService {
  constructor(
    private readonly repository: VisualisationPendingRepository,
    private readonly visualisationService: VisualisationService,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.repository.initialize();
  }

  getById = transactional(
    async (
      ownerId: string,
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.repository.getById(ownerId, id, session);
    },
  );

  getByPendingId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.repository.getByPendingId(ownerId, pendingId, session);
    },
  );

  create = transactional(
    async (
      payload: CreateVisualisationPendingPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.repository.create(payload, session);
    },
  );

  createFromData = transactional(
    async (
      ownerId: string,
      pendingId: string,
      data: GardenDrawDataDto,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      try {
        const hashIdResult: SuccessDataAny<string> =
          this.visualisationService.resolveHashId(data);
        if (!hashIdResult.success || !hashIdResult.data) {
          throw new Error("Failed to resolve hash id");
        }
        const hashId: string = hashIdResult.data;

        const existingPendingResult: SuccessDataAny<{ exists: boolean }> =
          await this.repository.existsByPendingIdAndVisualisationId(
            ownerId,
            pendingId,
            hashId,
            session,
          );
        if (!existingPendingResult.success || !existingPendingResult.data) {
          throw new Error(
            "Failed to check for an existing pending visualisation",
          );
        }
        if (existingPendingResult.data.exists) {
          throw new Error(
            `VisualisationPending with pendingId ${pendingId} and visualisationId ${hashId} already exists`,
          );
        }

        const payload: CreateVisualisationPendingPayload = {
          _id: hashId,
          pendingId,
          ownerId,
          data,
          createdAt: new Date(),
        };

        return this.create(payload, session);
      } catch (e: unknown) {
        return handleError<VisualisationPendingDto>(e);
      }
    },
  );

  delete = transactional(
    async (
      ownerId: string,
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.repository.delete(ownerId, id, session);
    },
  );

  deleteByPendingId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.repository.deleteByPendingId(ownerId, pendingId, session);
    },
  );

  deleteByOwnerId = transactional(
    async (
      ownerId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.repository.deleteByOwnerId(ownerId, session);
    },
  );

  persistByPendingIdAndVisualisationId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      try {
        const pendingVisualisationResult: SuccessDataAny<VisualisationPendingDto> =
          await this.repository.getByPendingIdAndVisualisationId(
            ownerId,
            pendingId,
            visualisationId,
            session,
          );

        if (
          !pendingVisualisationResult.success ||
          !pendingVisualisationResult.data
        ) {
          if (!pendingVisualisationResult.success) {
            throw pendingVisualisationResult.errors[0];
          }
          throw new AppError({
            status: 404,
            message: "Pending visualisation not found",
          });
        }

        const pendingVisualisation: VisualisationPendingDto =
          pendingVisualisationResult.data;

        const finalizedExistsResult: SuccessDataAny<{ exists: boolean }> =
          await this.visualisationService.existsById(
            pendingVisualisation._id,
            session,
          );
        if (!finalizedExistsResult.success || !finalizedExistsResult.data) {
          throw new Error("Failed to check for an existing visualisation");
        }
        if (finalizedExistsResult.data.exists) {
          throw new AppError({
            status: 409,
            message: "Visualisation already exists",
          });
        }

        const createPayload: CreateVisualisationPayload = {
          _id: pendingVisualisation._id,
          data: pendingVisualisation.data,
          createdAt: pendingVisualisation.createdAt,
        };

        const createdVisualisationResult: SuccessDataAny<VisualisationDto> =
          await this.visualisationService.create(createPayload, session);

        if (
          !createdVisualisationResult.success ||
          !createdVisualisationResult.data
        ) {
          throw new Error(
            `Failed to create visualisation with id ${pendingVisualisation._id}`,
          );
        }

        const deletePendingResult: SuccessDataAny<VisualisationPendingDto[]> =
          await this.repository.deleteByPendingId(ownerId, pendingId, session);
        if (!deletePendingResult.success) {
          throw new Error(
            `Failed to delete pending visualisations with pendingId ${pendingId}`,
          );
        }

        return createdVisualisationResult;
      } catch (e: unknown) {
        return handleError<VisualisationDto>(e);
      }
    },
  );
}
