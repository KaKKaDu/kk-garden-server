import { z } from "zod";
import { UserIdSchema } from "@kk-garden/shared/schemas";

export const ACCOUNT_DELETION_TOMBSTONE_COLLECTION =
  "account_deletion_tombstones";

export const AccountDeletionTombstoneSchema = z
  .object({
    userId: UserIdSchema,
    deletedAt: z.date(),
  })
  .strict();

export type AccountDeletionTombstone = z.infer<
  typeof AccountDeletionTombstoneSchema
>;
