import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  Nullable,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import type { ClientSession, Model, Mongoose } from "mongoose";
import {
  parseVisualisationPendingDto,
  VisualisationPendingDtoMongoSchema,
} from "@/schemas/models/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { CreateVisualisationPendingPayload } from "@/services/crud/visualisation-pending/types.ts";
import { transactional, type DocumentLike } from "@/types/mongo.types.ts";

import { Variables } from "@lib/variables/variables.ts";

const visualisationPendingVariables = Variables.of({
  "model-name": "VisualisationPendingDto",
  "collection-name": "visualisations_pending",
} as const);

export class VisualisationPendingRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<VisualisationPendingDto> {
    const existingModel: Nullable<Model<VisualisationPendingDto>> = db.models[
      visualisationPendingVariables.get("model-name")
    ] as Nullable<Model<VisualisationPendingDto>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<VisualisationPendingDto>(
      visualisationPendingVariables.get("model-name"),
      VisualisationPendingDtoMongoSchema,
      visualisationPendingVariables.get("collection-name"),
    );
  }

  private toDto(document: DocumentLike): VisualisationPendingDto {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<VisualisationPendingDto, "_id"> & { _id?: unknown };

    return parseVisualisationPendingDto({
      ...raw,
      _id: String(raw._id),
    });
  }

  getById = transactional(
    async (
      ownerId: string,
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.mongoService.execute<VisualisationPendingDto>(
        async (db: Mongoose): Promise<VisualisationPendingDto> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const query = model.findOne({ _id: id, ownerId });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new AppError({
              status: 404,
              message: "Pending visualisation not found",
            });
          }

          return this.toDto(document);
        },
        "VisualisationPendingRepository.getById",
      );
    },
  );

  getByPendingId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.mongoService.execute<VisualisationPendingDto[]>(
        async (db: Mongoose): Promise<VisualisationPendingDto[]> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const query = model.find({ ownerId, pendingId });
          if (session) {
            query.session(session);
          }
          const documents: DocumentLike[] = await query.exec();

          return documents.map((document: DocumentLike) =>
            this.toDto(document),
          );
        },
        "VisualisationPendingRepository.getByPendingId",
      );
    },
  );

  getByPendingIdAndVisualisationId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.mongoService.execute<VisualisationPendingDto>(
        async (db: Mongoose): Promise<VisualisationPendingDto> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const query = model.findOne({
            ownerId,
            pendingId,
            _id: visualisationId,
          });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new AppError({
              status: 404,
              message: "Pending visualisation not found",
            });
          }

          return this.toDto(document);
        },
        "VisualisationPendingRepository.getByPendingIdAndVisualisationId",
      );
    },
  );

  existsByPendingIdAndVisualisationId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<{ exists: boolean }>> => {
      return this.mongoService.execute<{ exists: boolean }>(
        async (db: Mongoose): Promise<{ exists: boolean }> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const query = model
            .findOne({ ownerId, pendingId, _id: visualisationId })
            .select({ _id: 1 });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          return { exists: document !== null };
        },
        "VisualisationPendingRepository.existsByPendingIdAndVisualisationId",
      );
    },
  );

  create = transactional(
    async (
      payload: CreateVisualisationPendingPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.mongoService.execute<VisualisationPendingDto>(
        async (db: Mongoose): Promise<VisualisationPendingDto> => {
          const dto: VisualisationPendingDto =
            parseVisualisationPendingDto(payload);
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const entity = new model(dto);
          const document: DocumentLike = session
            ? await entity.save({ session })
            : await entity.save();

          return this.toDto(document);
        },
        "VisualisationPendingRepository.create",
      );
    },
  );

  delete = transactional(
    async (
      ownerId: string,
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto>> => {
      return this.mongoService.execute<VisualisationPendingDto>(
        async (db: Mongoose): Promise<VisualisationPendingDto> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const query = model.findOneAndDelete({ _id: id, ownerId });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new AppError({
              status: 404,
              message: "Pending visualisation not found",
            });
          }

          return this.toDto(document);
        },
        "VisualisationPendingRepository.delete",
      );
    },
  );

  deleteByPendingId = transactional(
    async (
      ownerId: string,
      pendingId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.mongoService.execute<VisualisationPendingDto[]>(
        async (db: Mongoose): Promise<VisualisationPendingDto[]> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const filter = { ownerId, pendingId };
          const findQuery = model.find(filter);
          if (session) {
            findQuery.session(session);
          }
          const documents: DocumentLike[] = await findQuery.exec();
          const mapped: VisualisationPendingDto[] = documents.map(
            (document: DocumentLike): VisualisationPendingDto =>
              this.toDto(document),
          );

          if (mapped.length === 0) {
            return mapped;
          }

          const deleteQuery = model.deleteMany(filter);
          if (session) {
            deleteQuery.session(session);
          }
          await deleteQuery.exec();

          return mapped;
        },
        "VisualisationPendingRepository.deleteByPendingId",
      );
    },
  );

  deleteByOwnerId = transactional(
    async (
      ownerId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
      return this.mongoService.execute<VisualisationPendingDto[]>(
        async (db: Mongoose): Promise<VisualisationPendingDto[]> => {
          const model: Model<VisualisationPendingDto> = this.getModel(db);
          const findQuery = model.find({ ownerId });
          if (session) {
            findQuery.session(session);
          }
          const documents: DocumentLike[] = await findQuery.exec();
          const mapped: VisualisationPendingDto[] = documents.map(
            (document: DocumentLike): VisualisationPendingDto =>
              this.toDto(document),
          );

          if (mapped.length === 0) {
            return mapped;
          }

          const deleteQuery = model.deleteMany({ ownerId });
          if (session) {
            deleteQuery.session(session);
          }
          await deleteQuery.exec();

          return mapped;
        },
        "VisualisationPendingRepository.deleteByOwnerId",
      );
    },
  );
}
