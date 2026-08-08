import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, VisualisationDto } from "@kk-garden/shared/types";
import type { ClientSession, Mongoose, Model } from "mongoose";
import {
  VisualisationDtoMongoSchema,
  parseVisualisationDto,
} from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { CreateVisualisationPayload } from "@/services/crud/visualisation/types.js";
import { transactional, type DocumentLike } from "@/types/mongo.types.js";

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

  getById = transactional(
    async (
      id: string,
      log: boolean = true,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      return this.mongoService.execute<VisualisationDto>(
        async (db: Mongoose): Promise<VisualisationDto> => {
          const model: Model<VisualisationDto> = this.getModel(db);
          const query = model.findById(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`VisualisationDto with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "VisualisationRepository.getById",
        log,
      );
    },
  );

  create = transactional(
    async (
      payload: CreateVisualisationPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      return this.mongoService.execute<VisualisationDto>(
        async (db: Mongoose): Promise<VisualisationDto> => {
          const dto: VisualisationDto = parseVisualisationDto(payload);
          const model: Model<VisualisationDto> = this.getModel(db);
          const entity = new model(dto);
          const document: DocumentLike = session
            ? await entity.save({ session })
            : await entity.save();
          return this.toDto(document);
        },
        "VisualisationRepository.create",
      );
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationDto>> => {
      return this.mongoService.execute<VisualisationDto>(
        async (db: Mongoose): Promise<VisualisationDto> => {
          const model: Model<VisualisationDto> = this.getModel(db);
          const query = model.findByIdAndDelete(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`VisualisationDto with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "VisualisationRepository.delete",
      );
    },
  );
}
