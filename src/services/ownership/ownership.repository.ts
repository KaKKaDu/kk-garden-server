import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, Ownership } from "@kk-garden/shared/types";
import type { ClientSession, Model, Mongoose } from "mongoose";
import {
  OwnershipMongoSchema,
  parseOwnership,
} from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { CreateOwnershipPayload } from "@/services/ownership/types.js";
import { transactional, type DocumentLike } from "@/types/mongo.types.js";

const OWNERSHIP_MODEL_NAME: string = "Ownership";
const OWNERSHIP_COLLECTION_NAME: string = "ownerships";

export class OwnershipRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<Ownership> {
    const existingModel: Nullable<Model<Ownership>> = db.models[
      OWNERSHIP_MODEL_NAME
    ] as Nullable<Model<Ownership>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<Ownership>(
      OWNERSHIP_MODEL_NAME,
      OwnershipMongoSchema,
      OWNERSHIP_COLLECTION_NAME,
    );
  }

  private toDto(document: DocumentLike): Ownership {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<Ownership, "_id"> & { _id?: unknown };

    return parseOwnership({
      ...raw,
      _id: String(raw._id),
    });
  }

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.mongoService.execute<Ownership>(
        async (db: Mongoose): Promise<Ownership> => {
          const model: Model<Ownership> = this.getModel(db);
          const query = model.findById(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`Ownership with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "OwnershipRepository.getById",
      );
    },
  );

  getByUserId = transactional(
    async (
      userId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.mongoService.execute<Ownership>(
        async (db: Mongoose): Promise<Ownership> => {
          const model: Model<Ownership> = this.getModel(db);
          const query = model.findOne({ userId });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`Ownership with userId ${userId} was not found`);
          }

          return this.toDto(document);
        },
        "OwnershipRepository.getByUserId",
      );
    },
  );

  getBySignatureId = transactional(
    async (
      signatureId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.mongoService.execute<Ownership>(
        async (db: Mongoose): Promise<Ownership> => {
          const model: Model<Ownership> = this.getModel(db);
          const query = model.findOne({ signatureId });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(
              `Ownership with signatureId ${signatureId} was not found`,
            );
          }

          return this.toDto(document);
        },
        "OwnershipRepository.getBySignatureId",
      );
    },
  );

  create = transactional(
    async (
      payload: CreateOwnershipPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.mongoService.execute<Ownership>(
        async (db: Mongoose): Promise<Ownership> => {
          const dto: Ownership = parseOwnership(payload);
          const model: Model<Ownership> = this.getModel(db);
          const entity = new model(dto);
          const document: DocumentLike = session
            ? await entity.save({ session })
            : await entity.save();
          return this.toDto(document);
        },
        "OwnershipRepository.create",
      );
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Ownership>> => {
      return this.mongoService.execute<Ownership>(
        async (db: Mongoose): Promise<Ownership> => {
          const model: Model<Ownership> = this.getModel(db);
          const query = model.findByIdAndDelete(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`Ownership with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "OwnershipRepository.delete",
      );
    },
  );
}
