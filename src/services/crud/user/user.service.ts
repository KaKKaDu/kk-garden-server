import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, User } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import type { UserRepository } from "@/services/crud/user/user.repository.js";
import { transactional } from "@/types/mongo.types.js";

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  getAll = transactional(
    async (
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User[]>> => {
      return this.repository.getAll(session);
    },
  );

  getById = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.repository.getById(id, session);
    },
  );
}
