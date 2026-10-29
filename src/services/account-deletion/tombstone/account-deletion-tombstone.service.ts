import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import type { ClientSession } from "mongoose";
import {
  AccountDeletionTombstoneSchema,
  type AccountDeletionTombstone,
} from "@/schemas/models/account-deletion-tombstone.mongo.schema.ts";
import type { AccountDeletionTombstoneRepository } from "@/services/account-deletion/tombstone/account-deletion-tombstone.repository.ts";
import { requireData } from "@/utils/require-data.ts";

export class AccountDeletionTombstoneService {
  constructor(
    private readonly repository: AccountDeletionTombstoneRepository,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.repository.initialize();
  }

  async assertNotDeleted(userId: string): Promise<void> {
    if (await this.isDeleted(userId)) {
      throw new AppError({
        status: 403,
        message: "Deleted accounts cannot access application routes",
      });
    }
  }

  async assertNotDeletedAsNotFound(
    userId: string,
    message: string,
  ): Promise<void> {
    if (await this.isDeleted(userId)) {
      throw new AppError({ status: 404, message });
    }
  }

  async isDeleted(userId: string): Promise<boolean> {
    const lookup = requireData(
      await this.repository.isDeleted.direct(userId),
      "Deleted-account status could not be checked",
    );
    return lookup.deleted;
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
