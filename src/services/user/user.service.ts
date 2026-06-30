import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type { User } from "@kk-garden/shared/types";
import crypto from "node:crypto";
import type { UserRepository } from "@/services/user/user.repository.js";
import type {
  CreateUserPayload,
  UpdateUserPayload,
} from "@/services/user/types.js";

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async getAll(): Promise<SuccessDataAny<User[]>> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<SuccessDataAny<User>> {
    return this.repository.getById(id);
  }

  async create(payload: CreateUserPayload): Promise<SuccessDataAny<User>> {
    const userPayload: User = {
      _id: crypto.randomUUID(),
      email: payload.email,
      authId: payload.authId ?? `mock-auth-${crypto.randomUUID()}`,
      role: payload.role,
      status: payload.status,
    };

    return this.repository.create(userPayload);
  }

  async update(
    id: string,
    payload: UpdateUserPayload,
  ): Promise<SuccessDataAny<User>> {
    return this.repository.update(id, payload);
  }

  async delete(id: string): Promise<SuccessDataAny<User>> {
    return this.repository.delete(id);
  }
}
