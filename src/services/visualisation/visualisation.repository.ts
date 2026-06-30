import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, VisualisationDto } from "@kk-garden/shared/types";
import type { Mongoose, Model } from "mongoose";
import {
  VisualisationDtoMongoSchema,
  parseVisualisationDto,
} from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type {
  CreateVisualisationPayload,
  DocumentLike,
} from "@/services/visualisation/types.js";

const VISUALISATION_MODEL_NAME: string = "VisualisationDto";
const VISUALISATION_COLLECTION_NAME: string = "visualisations";

export class VisualisationRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<VisualisationDto> {
    const existingModel: Nullable<Model<VisualisationDto>> = db.models[
      VISUALISATION_MODEL_NAME
    ] as Nullable<Model<VisualisationDto>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<VisualisationDto>(
      VISUALISATION_MODEL_NAME,
      VisualisationDtoMongoSchema,
      VISUALISATION_COLLECTION_NAME,
    );
  }

  private toDto(document: DocumentLike): VisualisationDto {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<VisualisationDto, "_id"> & { _id?: unknown };

    return parseVisualisationDto({
      ...raw,
      _id: String(raw._id),
    });
  }

  async getAll(): Promise<SuccessDataAny<VisualisationDto[]>> {
    return this.mongoService.execute<VisualisationDto[]>(
      async (db: Mongoose): Promise<VisualisationDto[]> => {
        const model: Model<VisualisationDto> = this.getModel(db);
        const documents: DocumentLike[] = await model.find().exec();
        return documents.map((document: DocumentLike) => this.toDto(document));
      },
      "VisualisationRepository.getAll",
    );
  }

  async getById(id: string): Promise<SuccessDataAny<VisualisationDto>> {
    return this.mongoService.execute<VisualisationDto>(
      async (db: Mongoose): Promise<VisualisationDto> => {
        const model: Model<VisualisationDto> = this.getModel(db);
        const document: DocumentLike | null = await model.findById(id).exec();

        if (!document) {
          throw new Error(`VisualisationDto with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "VisualisationRepository.getById",
    );
  }

  async create(
    payload: CreateVisualisationPayload,
  ): Promise<SuccessDataAny<VisualisationDto>> {
    return this.mongoService.execute<VisualisationDto>(
      async (db: Mongoose): Promise<VisualisationDto> => {
        const dto: VisualisationDto = parseVisualisationDto(payload);
        const model: Model<VisualisationDto> = this.getModel(db);
        const document: DocumentLike = await model.create(dto);
        return this.toDto(document);
      },
      "VisualisationRepository.create",
    );
  }

  async delete(id: string): Promise<SuccessDataAny<VisualisationDto>> {
    return this.mongoService.execute<VisualisationDto>(
      async (db: Mongoose): Promise<VisualisationDto> => {
        const model: Model<VisualisationDto> = this.getModel(db);
        const document: DocumentLike | null = await model
          .findByIdAndDelete(id)
          .exec();

        if (!document) {
          throw new Error(`VisualisationDto with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "VisualisationRepository.delete",
    );
  }
}
