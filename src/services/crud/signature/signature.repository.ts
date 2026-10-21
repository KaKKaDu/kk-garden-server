import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, Signature } from "@kk-garden/shared/types";
import type { ClientSession, Model, Mongoose } from "mongoose";
import {
  SignatureMongoSchema,
  parseSignature,
} from "@/schemas/models/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { CreateSignaturePayload } from "@/services/crud/signature/types.ts";
import { transactional, type DocumentLike } from "@/types/mongo.types.ts";

import { Variables } from "@lib/variables/variables.ts";

const signatureVariables = Variables.of({
  "model-name": "Signature",
  "collection-name": "signatures",
} as const);

export class SignatureRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<Signature> {
    const existingModel: Nullable<Model<Signature>> = db.models[
      signatureVariables.get("model-name")
    ] as Nullable<Model<Signature>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<Signature>(
      signatureVariables.get("model-name"),
      SignatureMongoSchema,
      signatureVariables.get("collection-name"),
    );
  }

  private toDto(document: DocumentLike): Signature {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<Signature, "_id"> & { _id?: unknown };

    return parseSignature({
      ...raw,
      _id: String(raw._id),
    });
  }

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.mongoService.execute<Signature>(
        async (db: Mongoose): Promise<Signature> => {
          const model: Model<Signature> = this.getModel(db);
          const query = model.findById(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`Signature with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "SignatureRepository.getById",
      );
    },
  );

  getByVisualisationId = transactional(
    async (
      visualisationId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.mongoService.execute<Signature>(
        async (db: Mongoose): Promise<Signature> => {
          const model: Model<Signature> = this.getModel(db);
          const query = model.findOne({ visualisationId });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(
              `Signature with visualisationId ${visualisationId} was not found`,
            );
          }

          return this.toDto(document);
        },
        "SignatureRepository.getByVisualisationId",
      );
    },
  );

  create = transactional(
    async (
      payload: CreateSignaturePayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.mongoService.execute<Signature>(
        async (db: Mongoose): Promise<Signature> => {
          const dto: Signature = parseSignature(payload);
          const model: Model<Signature> = this.getModel(db);
          const entity = new model(dto);
          const document: DocumentLike = session
            ? await entity.save({ session })
            : await entity.save();
          return this.toDto(document);
        },
        "SignatureRepository.create",
      );
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<Signature>> => {
      return this.mongoService.execute<Signature>(
        async (db: Mongoose): Promise<Signature> => {
          const model: Model<Signature> = this.getModel(db);
          const query = model.findByIdAndDelete(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`Signature with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "SignatureRepository.delete",
      );
    },
  );
}
