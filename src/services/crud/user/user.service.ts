import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable, User } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import crypto from "node:crypto";
import type { UserRepository } from "@/services/crud/user/user.repository.js";
import type {
  CreateUserPayload,
  UpdateUserPayload,
} from "@/services/crud/user/types.js";
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

  create = transactional(
    async (
      payload: CreateUserPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      const userPayload: User = {
        _id: crypto.randomUUID(),
        email: payload.email,
        authId: payload.authId ?? `mock-auth-${crypto.randomUUID()}`,
        role: payload.role,
        status: payload.status,
      };

      return this.repository.create(userPayload, session);
    },
  );

  update = transactional(
    async (
      id: string,
      payload: UpdateUserPayload,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.repository.update(id, payload, session);
    },
  );

  delete = transactional(
    async (
      id: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<User>> => {
      return this.repository.delete(id, session);
    },
  );
}
