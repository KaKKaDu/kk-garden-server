import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, User } from "@kk-garden/shared/types";
import type { ClientSession, Mongoose } from "mongoose";
import { ObjectId, type Collection } from "mongodb";
import { parseUser } from "@/schemas/models/index.js";
import {
  deriveUserStatus,
  type UserStatusSignals,
} from "@/lib/auth/derive-user-status.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import { transactional } from "@/types/mongo.types.js";

const USER_COLLECTION_NAME: string = "user";

type BetterAuthUserDocument = {
  _id: ObjectId | string;
  email: string;
  role: string;
  banned?: boolean;
  banExpires?: Date | null;
  deletedAt?: Date | null;
  deactivated?: boolean;
};

export class UserRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getCollection(db: Mongoose): Collection<BetterAuthUserDocument> {
    return db.connection
      .getClient()
      .db()
      .collection<BetterAuthUserDocument>(USER_COLLECTION_NAME);
  }

  private toDto(document: BetterAuthUserDocument): User {
    const id: string = String(document._id);
    const statusSignals: UserStatusSignals = {
      deletedAt: document.deletedAt ?? null,
      banned: document.banned ?? false,
      deactivated: document.deactivated ?? false,
    };
    return parseUser({
      _id: id,
      authId: id,
      email: document.email,
      role: document.role,
      status: deriveUserStatus(statusSignals),
    });
  }

  getAll = transactional(
    async (
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User[]>> => {
      return this.mongoService.execute<User[]>(
        async (db: Mongoose): Promise<User[]> => {
          const documents: BetterAuthUserDocument[] = await this.getCollection(
            db,
          )
            .find({}, { session: session ?? undefined })
            .toArray();
          return documents.map((document: BetterAuthUserDocument) =>
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
          const document: BetterAuthUserDocument | null =
            await this.getCollection(db).findOne(
              { _id: ObjectId.isValid(id) ? new ObjectId(id) : id },
              { session: session ?? undefined },
            );

          if (!document) {
            throw new Error(`User with id ${id} was not found`);
          }

          return this.toDto(document);
        },
        "UserRepository.getById",
      );
    },
  );
}
