import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, User } from "@kk-garden/shared/types";
import type { Mongoose, Model } from "mongoose";
import { UserMongoSchema, parseUser } from "@/schemas/models/index.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { DocumentLike, UpdateUserPayload } from "@/services/user/types.js";

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

  async getAll(): Promise<SuccessDataAny<User[]>> {
    return this.mongoService.execute<User[]>(
      async (db: Mongoose): Promise<User[]> => {
        const model: Model<User> = this.getModel(db);
        const documents: DocumentLike[] = await model.find().exec();
        return documents.map((document: DocumentLike) => this.toDto(document));
      },
      "UserRepository.getAll",
    );
  }

  async getById(id: string): Promise<SuccessDataAny<User>> {
    return this.mongoService.execute<User>(
      async (db: Mongoose): Promise<User> => {
        const model: Model<User> = this.getModel(db);
        const document: DocumentLike | null = await model.findById(id).exec();

        if (!document) {
          throw new Error(`User with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "UserRepository.getById",
    );
  }

  async create(payload: User): Promise<SuccessDataAny<User>> {
    return this.mongoService.execute<User>(
      async (db: Mongoose): Promise<User> => {
        const dto: User = parseUser(payload);
        const model: Model<User> = this.getModel(db);
        const document: DocumentLike = await model.create(dto);
        return this.toDto(document);
      },
      "UserRepository.create",
    );
  }

  async update(
    id: string,
    payload: UpdateUserPayload,
  ): Promise<SuccessDataAny<User>> {
    return this.mongoService.execute<User>(
      async (db: Mongoose): Promise<User> => {
        const model: Model<User> = this.getModel(db);
        const document: DocumentLike | null = await model
          .findByIdAndUpdate(id, payload, {
            new: true,
            runValidators: true,
          })
          .exec();

        if (!document) {
          throw new Error(`User with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "UserRepository.update",
    );
  }

  async delete(id: string): Promise<SuccessDataAny<User>> {
    return this.mongoService.execute<User>(
      async (db: Mongoose): Promise<User> => {
        const model: Model<User> = this.getModel(db);
        const document: DocumentLike | null = await model
          .findByIdAndDelete(id)
          .exec();

        if (!document) {
          throw new Error(`User with id ${id} was not found`);
        }

        return this.toDto(document);
      },
      "UserRepository.delete",
    );
  }
}
