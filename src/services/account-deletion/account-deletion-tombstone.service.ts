import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import {
  AccountDeletionTombstoneSchema,
  type AccountDeletionTombstone,
} from "@/schemas/models/account-deletion-tombstone.mongo.schema.ts";
import type { AccountDeletionTombstoneRepository } from "@/services/account-deletion/account-deletion-tombstone.repository.ts";

const requireData = <T extends object>(
  result: SuccessDataAny<T>,
  fallback: string,
): T => {
  if (!result.success || !result.data) {
    const error = result.success ? undefined : result.errors[0];
    throw new AppError({
      status: error?.status ?? 503,
      message: error?.message ?? fallback,
    });
  }
  return result.data;
};

export class AccountDeletionTombstoneService {
  constructor(
    private readonly repository: AccountDeletionTombstoneRepository,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.repository.initialize();
  }

  async assertNotDeleted(userId: string): Promise<void> {
    const lookup = requireData(
      await this.repository.isDeleted.direct(userId),
      "Deleted-account status could not be checked",
    );
    if (lookup.deleted) {
      throw new AppError({
        status: 403,
        message: "Deleted accounts cannot access application routes",
      });
    }
  }

  async assertMutationAllowed(
    userId: string,
    session: Nullable<ClientSession>,
  ): Promise<void> {
    const fence = requireData(
      await this.repository.fenceMutation(userId, session),
      "Account mutation could not be fenced",
    );
    if (!fence.allowed) {
      throw new AppError({
        status: 403,
        message: "Deleted accounts cannot modify account data",
      });
    }
  }

  async create(
    userId: string,
    deletedAt: Date,
    session: Nullable<ClientSession>,
  ): Promise<void> {
    const tombstone: AccountDeletionTombstone =
      AccountDeletionTombstoneSchema.parse({ userId, deletedAt });
    requireData(
      await this.repository.create(tombstone, session),
      "Account deletion tombstone could not be saved",
    );
  }
}
