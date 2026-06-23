import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { GardenDrawDataDto } from "@kk-garden/shared/types";
import type { Mongoose, Model } from "mongoose";
import {
  GardenDrawDataDtoMongoSchema,
  parseGardenDrawDataDto,
} from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";

const GARDEN_DRAW_DATA_MODEL_NAME: string = "GardenDrawDataDto";
const GARDEN_DRAW_DATA_COLLECTION_NAME: string = "garden-draw-data";

type CreateGardenDrawDataPayload = GardenDrawDataDto;
type UpdateGardenDrawDataPayload = Partial<GardenDrawDataDto>;

type DocumentLike = {
  toObject: (options?: { flattenMaps?: boolean }) => unknown;
};

export class GardenDrawDataRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<GardenDrawDataDto> {
    const existingModel: Model<GardenDrawDataDto> | undefined = db.models[
      GARDEN_DRAW_DATA_MODEL_NAME
    ] as Model<GardenDrawDataDto> | undefined;

    if (existingModel) {
      return existingModel;
    }

    return db.model<GardenDrawDataDto>(
      GARDEN_DRAW_DATA_MODEL_NAME,
      GardenDrawDataDtoMongoSchema,
      GARDEN_DRAW_DATA_COLLECTION_NAME,
    );
  }

  private toDto(document: DocumentLike): GardenDrawDataDto {
    return document.toObject({ flattenMaps: true }) as GardenDrawDataDto;
  }

  async getAll(): Promise<SuccessDataAny<GardenDrawDataDto[]>> {
    return this.mongoService.execute<GardenDrawDataDto[]>(
      async (db: Mongoose): Promise<GardenDrawDataDto[]> => {
        const model: Model<GardenDrawDataDto> = this.getModel(db);
        const documents: DocumentLike[] = await model.find().exec();
        return documents.map((document: DocumentLike) => this.toDto(document));
      },
      "GardenDrawDataRepository.getAll",
    );
  }

  async getById(id: string): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.mongoService.execute<GardenDrawDataDto>(
      async (db: Mongoose): Promise<GardenDrawDataDto> => {
        const model: Model<GardenDrawDataDto> = this.getModel(db);
        const document: DocumentLike | null = await model.findById(id).exec();

        if (!document) {
          throw new Error(`GardenDrawDataDto with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "GardenDrawDataRepository.getById",
    );
  }

  async create(
    payload: CreateGardenDrawDataPayload,
  ): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.mongoService.execute<GardenDrawDataDto>(
      async (db: Mongoose): Promise<GardenDrawDataDto> => {
        const dto: GardenDrawDataDto = parseGardenDrawDataDto(payload);
        const model: Model<GardenDrawDataDto> = this.getModel(db);
        const document: DocumentLike = await model.create(dto);
        return this.toDto(document);
      },
      "GardenDrawDataRepository.create",
    );
  }

  async update(
    id: string,
    payload: UpdateGardenDrawDataPayload,
  ): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.mongoService.execute<GardenDrawDataDto>(
      async (db: Mongoose): Promise<GardenDrawDataDto> => {
        const dto: GardenDrawDataDto = parseGardenDrawDataDto(payload);
        const model: Model<GardenDrawDataDto> = this.getModel(db);
        const document: DocumentLike | null = await model
          .findOneAndReplace({ _id: id }, dto, {
            new: true,
            runValidators: true,
          })
          .exec();

        if (!document) {
          throw new Error(`GardenDrawDataDto with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "GardenDrawDataRepository.update",
    );
  }

  async delete(id: string): Promise<SuccessDataAny<GardenDrawDataDto>> {
    return this.mongoService.execute<GardenDrawDataDto>(
      async (db: Mongoose): Promise<GardenDrawDataDto> => {
        const model: Model<GardenDrawDataDto> = this.getModel(db);
        const document: DocumentLike | null = await model
          .findByIdAndDelete(id)
          .exec();

        if (!document) {
          throw new Error(`GardenDrawDataDto with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "GardenDrawDataRepository.delete",
    );
  }
}
