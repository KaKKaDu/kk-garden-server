import { randomUUID } from "node:crypto";
import {
  AppError,
  type DataObject,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import type { GardenShareActionResponse } from "@kk-garden/shared/schemas";
import type {
  GardenShareGrant,
  GardenShareRequest,
  User,
} from "@kk-garden/shared/types";
import type { ClientSession, Mongoose } from "mongoose";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";
import type { GardenSharingRepository } from "@/services/crud/garden-sharing/garden-sharing.repository.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { requireData } from "@/utils/require-data.ts";

type RequestActor = "requesterId" | "ownerId";

export class GardenSharingTransactionService {
  constructor(
    private readonly repository: GardenSharingRepository,
    private readonly mongoService: MongoService,
    private readonly userService: UserService,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  createRequest(
    requesterId: string,
    ownerId: string,
  ): Promise<SuccessDataAny<GardenShareRequest>> {
    return this.execute(
      "GardenSharingTransactionService.createRequest",
      async (session: ClientSession): Promise<GardenShareRequest> => {
        if (requesterId === ownerId) {
          throw new AppError({
            status: 400,
            message: "You cannot request access to your own garden",
          });
        }
        await this.assertActive(requesterId, session, "forbidden");
        await this.assertActive(ownerId, session, "not-found");
        const existingGrant = requireData(
          await this.repository.findGrantByPair(requesterId, ownerId, session),
          "Garden access lookup failed",
        ).grant;
        if (existingGrant) {
          throw new AppError({
            status: 409,
            message: "Garden access has already been granted",
          });
        }
        return requireData(
          await this.repository.createRequest(
            {
              _id: randomUUID(),
              requesterId,
              ownerId,
              createdAt: new Date(),
            },
            session,
          ),
          "Garden sharing request could not be created",
        );
      },
    );
  }

  acceptRequest(
    ownerId: string,
    requestId: string,
  ): Promise<SuccessDataAny<GardenShareGrant>> {
    return this.execute(
      "GardenSharingTransactionService.acceptRequest",
      async (session: ClientSession): Promise<GardenShareGrant> => {
        await this.assertActive(ownerId, session, "forbidden");
        const request: GardenShareRequest = await this.getOwnedRequest(
          requestId,
          ownerId,
          "ownerId",
          session,
        );
        await this.assertActive(request.requesterId, session, "not-found");
        const existingGrant = requireData(
          await this.repository.findGrantByPair(
            request.requesterId,
            ownerId,
            session,
          ),
          "Garden access lookup failed",
        ).grant;
        if (existingGrant) {
          throw new AppError({
            status: 409,
            message: "Garden access has already been granted",
          });
        }
        const grant: GardenShareGrant = requireData(
          await this.repository.createGrant(
            {
              _id: randomUUID(),
              viewerId: request.requesterId,
              ownerId,
              grantedAt: new Date(),
            },
            session,
          ),
          "Garden access could not be granted",
        );
        requireData(
          await this.repository.deleteRequest(
            requestId,
            ownerId,
            "ownerId",
            session,
          ),
          "Sharing request could not be resolved",
        );
        return grant;
      },
    );
  }

  declineRequest(
    ownerId: string,
    requestId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.removeRequest(ownerId, requestId, "ownerId");
  }

  cancelRequest(
    requesterId: string,
    requestId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.removeRequest(requesterId, requestId, "requesterId");
  }

  revokeGrant(
    ownerId: string,
    grantId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.execute(
      "GardenSharingTransactionService.revokeGrant",
      async (session: ClientSession): Promise<GardenShareActionResponse> => {
        await this.assertActive(ownerId, session, "forbidden");
        requireData(
          await this.repository.deleteGrantByOwner(grantId, ownerId, session),
          "Garden access could not be revoked",
        );
        return { success: true };
      },
    );
  }

  private removeRequest(
    userId: string,
    requestId: string,
    actor: RequestActor,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.execute(
      "GardenSharingTransactionService.removeRequest",
      async (session: ClientSession): Promise<GardenShareActionResponse> => {
        await this.assertActive(userId, session, "forbidden");
        requireData(
          await this.repository.deleteRequest(
            requestId,
            userId,
            actor,
            session,
          ),
          "Sharing request not found",
        );
        return { success: true };
      },
    );
  }

  private async getOwnedRequest(
    requestId: string,
    userId: string,
    actor: RequestActor,
    session: ClientSession,
  ): Promise<GardenShareRequest> {
    const request: GardenShareRequest = requireData(
      await this.repository.getRequestById(requestId, session),
      "Sharing request not found",
    );
    if (request[actor] !== userId) {
      throw new AppError({ status: 404, message: "Sharing request not found" });
    }
    return request;
  }

  private async assertActive(
    userId: string,
    session: ClientSession,
    inactivePolicy: "forbidden" | "not-found",
  ): Promise<void> {
    await this.tombstones.assertMutationAllowed(userId, session);
    const user: User = requireData(
      await this.userService.getById(userId, session),
      "Account status could not be checked",
    );
    const forbidden: boolean = inactivePolicy === "forbidden";
    if (user.status !== "active") {
      throw new AppError({
        status: forbidden ? 403 : 404,
        message: forbidden
          ? "Only active accounts can manage garden sharing"
          : "Garden not found",
      });
    }
  }

  private execute<T extends DataObject>(
    context: string,
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<SuccessDataAny<T>> {
    return this.mongoService.execute(async (db: Mongoose): Promise<T> => {
      const session: ClientSession = await db.startSession();
      try {
        const transactionResult: SuccessDataAny<T> =
          await session.withTransaction(
            async (): Promise<SuccessDataAny<T>> => ({
              success: true,
              data: await operation(session),
            }),
          );
        if (!transactionResult.success || !transactionResult.data) {
          throw new AppError({
            status: 503,
            message: "Garden sharing transaction did not complete",
          });
        }
        return transactionResult.data;
      } finally {
        await session.endSession();
      }
    }, context);
  }
}
