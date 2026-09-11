import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  GardenDrawData,
  GardenDrawDataDto,
  Nullable,
  VisualisationDto,
} from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import type { VisualisationRepository } from "@/services/crud/visualisation/visualisation.repository.js";
import type { CreateVisualisationPayload } from "@/services/crud/visualisation/types.js";
import { gardenDrawDataTransformer } from "@kk-garden/shared/transformers";
import { generateGardenDrawDataReport } from "@lib/generations/reports/garden-draw-data-report.js";
import { transactional } from "@/types/mongo.types.js";
import crypto from "node:crypto";

export class VisualisationService {
  constructor(private readonly repository: VisualisationRepository) {}

  resolveHashId(data: GardenDrawDataDto): SuccessDataAny<string> {
    try {
      const drawData: Nullable<GardenDrawData> =
        gardenDrawDataTransformer.fromDto(data);
      if (!drawData) {
        throw new Error("Invalid data");
      }

      const hashId: string = crypto.hash(
        "sha256",
        generateGardenDrawDataReport(drawData),
      );
      return { success: true, data: hashId };
    } catch (e: unknown) {
      return handleError<string>(e);
    }
  }

  getById = transactional(
    async (
      id: string,
      log: boolean = true,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      return this.repository.getById(id, log, session);
    },
  );

  create = transactional(
    async (
      payload: CreateVisualisationPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      return this.repository.create(payload, session);
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      return this.repository.delete(id, session);
    },
  );

  createFromData = transactional(
    async (
      data: GardenDrawDataDto,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      try {
        const hashIdResult: SuccessDataAny<string> = this.resolveHashId(data);
        if (!hashIdResult.success || !hashIdResult.data) {
          throw new Error("Failed to resolve hash id");
        }
        const hashId: string = hashIdResult.data;

        const sameVisualisationExists: SuccessDataAny<VisualisationDto> =
          await this.getById(hashId, false, session);

        if (sameVisualisationExists.success) {
          throw new Error("Visualisation already exists");
        }

        const payload: CreateVisualisationPayload = {
          _id: hashId,
          data,
          createdAt: new Date(),
        };

        return this.create(payload, session);
      } catch (e: unknown) {
        return handleError(e);
      }
    },
  );

  verify(hashId: string, data: GardenDrawDataDto): SuccessDataAny {
    try {
      const hashIdResult: SuccessDataAny<string> = this.resolveHashId(data);
      if (!hashIdResult.success || !hashIdResult.data) {
        throw new Error("Failed to resolve hash id");
      }

      if (hashIdResult.data !== hashId) {
        throw new Error("Hash id verification failed");
      }

      return { success: true };
    } catch (e: unknown) {
      return handleError(e);
    }
  }
}
