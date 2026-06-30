import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  GardenDrawData,
  GardenDrawDataDto,
  Nullable,
  VisualisationDto,
} from "@kk-garden/shared/types";
import type { VisualisationRepository } from "@/services/visualisation/visualisation.repository.js";
import type { CreateVisualisationPayload } from "@/services/visualisation/types.js";
import { gardenDrawDataTransformer } from "@kk-garden/shared/transformers";
import { generateGardenDrawDataReport } from "@lib/generations/reports/garden-draw-data-report.js";
import crypto from "node:crypto";

export class VisualisationService {
  constructor(private readonly repository: VisualisationRepository) {}

  async getAll(): Promise<SuccessDataAny<VisualisationDto[]>> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<SuccessDataAny<VisualisationDto>> {
    return this.repository.getById(id);
  }

  async create(
    payload: CreateVisualisationPayload,
  ): Promise<SuccessDataAny<VisualisationDto>> {
    return this.repository.create(payload);
  }

  async delete(id: string): Promise<SuccessDataAny<VisualisationDto>> {
    return this.repository.delete(id);
  }

  async addFromData(
    data: GardenDrawDataDto,
  ): Promise<SuccessDataAny<VisualisationDto>> {
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

      const sameVisualisationExists: SuccessDataAny<VisualisationDto> =
        await this.getById(hashId);

      if (sameVisualisationExists.success) {
        throw new Error("Visualisation already exists");
      }

      const payload: CreateVisualisationPayload = {
        _id: hashId,
        data,
        createdAt: new Date(),
      };

      return this.create(payload);
    } catch (e: unknown) {
      return handleError(e);
    }
  }
}
