import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, User } from "@kk-garden/shared/types";
import type { ClientSession, Mongoose, Model } from "mongoose";
import { UserMongoSchema, parseUser } from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { DocumentLike, UpdateUserPayload } from "@/services/user/types.js";
import { transactional } from "@/types/mongo.types.js";

const USER_MODEL_NAME: string = "User";
const USER_COLLECTION_NAME: string = "users";

export class UserRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getModel(db: Mongoose): Model<User> {
    const existingModel: Nullable<Model<User>> = db.models[
      USER_MODEL_NAME
    ] as Nullable<Model<User>>;

    if (existingModel) {
      return existingModel;
    }

    return db.model<User>(
      USER_MODEL_NAME,
      UserMongoSchema,
      USER_COLLECTION_NAME,
    );
  }

  private toDto(document: DocumentLike): User {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<User, "_id"> & { _id?: unknown };

    return parseUser({
      ...raw,
      _id: String(raw._id),
    });
  }

  getAll = transactional(
    async (
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User[]>> => {
      return this.mongoService.execute<User[]>(
        async (db: Mongoose): Promise<User[]> => {
          const model: Model<User> = this.getModel(db);
          const query = model.find();
          if (session) {
            query.session(session);
          }
          const documents: DocumentLike[] = await query.exec();
          return documents.map((document: DocumentLike) =>
            this.toDto(document),
          );
        },
        "UserRepository.getAll",
      );
    },
  );

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.mongoService.execute<User>(
        async (db: Mongoose): Promise<User> => {
          const model: Model<User> = this.getModel(db);
          const query = model.findById(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`User with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "UserRepository.getById",
      );
    },
  );

  create = transactional(
    async (
      payload: User,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.mongoService.execute<User>(
        async (db: Mongoose): Promise<User> => {
          const dto: User = parseUser(payload);
          const model: Model<User> = this.getModel(db);
          const entity = new model(dto);
          const document: DocumentLike = session
            ? await entity.save({ session })
            : await entity.save();
          return this.toDto(document);
        },
        "UserRepository.create",
      );
    },
  );

  update = transactional(
    async (
      id: string,
      payload: UpdateUserPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.mongoService.execute<User>(
        async (db: Mongoose): Promise<User> => {
          const model: Model<User> = this.getModel(db);
          const query = model.findByIdAndUpdate(id, payload, {
            new: true,
            runValidators: true,
          });
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`User with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "UserRepository.update",
      );
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.mongoService.execute<User>(
        async (db: Mongoose): Promise<User> => {
          const model: Model<User> = this.getModel(db);
          const query = model.findByIdAndDelete(id);
          if (session) {
            query.session(session);
          }
          const document: DocumentLike | null = await query.exec();

          if (!document) {
            throw new Error(`User with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "UserRepository.delete",
      );
    },
  );
}
