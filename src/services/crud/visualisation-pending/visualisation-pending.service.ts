import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  GardenDrawDataDto,
  Nullable,
  VisualisationDto,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import type { VisualisationPendingRepository } from "@/services/crud/visualisation-pending/visualisation-pending.repository.js";
import type { CreateVisualisationPendingPayload } from "@/services/crud/visualisation-pending/types.js";
import type { CreateVisualisationPayload } from "@/services/crud/visualisation/types.js";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.js";
import { transactional } from "@/types/mongo.types.js";

export class VisualisationPendingService {
  constructor(
    private readonly repository: VisualisationPendingRepository,
    private readonly visualisationService: VisualisationService,
  ) {}

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.repository.getById(id, session);
    },
  );

  getByPendingId = transactional(
    async (
      pendingId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.repository.getByPendingId(pendingId, session);
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

        const sameVisualisationPendingExists: SuccessDataAny<VisualisationPendingDto> =
          await this.repository.getByPendingIdAndVisualisationId(
            pendingId,
            hashId,
            session,
          );
        if (sameVisualisationPendingExists.success) {
          throw new Error(
            `VisualisationPending with pendingId ${pendingId} and visualisationId ${hashId} already exists`,
          );
        }

        const payload: CreateVisualisationPendingPayload = {
          _id: hashId,
          pendingId,
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
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.repository.delete(id, session);
    },
  );

  deleteByPendingId = transactional(
    async (
      pendingId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.repository.deleteByPendingId(pendingId, session);
    },
  );

  persistByPendingIdAndVisualisationId = transactional(
    async (
      pendingId: string,
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      try {
        const pendingVisualisationResult: SuccessDataAny<VisualisationPendingDto> =
          await this.repository.getByPendingIdAndVisualisationId(
            pendingId,
            visualisationId,
            session,
          );

        if (
          !pendingVisualisationResult.success ||
          !pendingVisualisationResult.data
        ) {
          throw new Error(
            `VisualisationPending with pendingId ${pendingId} and visualisationId ${visualisationId} was not found`,
          );
        }

        const pendingVisualisation: VisualisationPendingDto =
          pendingVisualisationResult.data;

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
          await this.repository.deleteByPendingId(pendingId, session);
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
