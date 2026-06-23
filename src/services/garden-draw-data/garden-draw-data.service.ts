import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { GardenDrawDataDto } from "@kk-garden/shared/types";
import { GardenDrawDataRepository } from "@/services/garden-draw-data/garden-draw-data.repository.js";

type CreateGardenDrawDataPayload = GardenDrawDataDto;
type UpdateGardenDrawDataPayload = Partial<GardenDrawDataDto>;

export class GardenDrawDataService {
  constructor(private readonly repository: GardenDrawDataRepository) {}

  async getAll(): Promise<SuccessDataAny<GardenDrawDataDto[]>> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.repository.getById(id);
  }

  async create(
    payload: CreateGardenDrawDataPayload,
  ): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.repository.create(payload);
  }

  async update(
    id: string,
    payload: UpdateGardenDrawDataPayload,
  ): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.repository.update(id, payload);
  }

  async delete(id: string): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.repository.delete(id);
  }
}
