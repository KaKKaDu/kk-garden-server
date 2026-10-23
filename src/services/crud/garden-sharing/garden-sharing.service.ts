import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  CreateGardenShareRequestResponse,
  GardenShareActionResponse,
  GardenShareDirection,
  GardenShareListEntry,
  GardenShareListResponse,
  ProfileLookupCardResponse,
} from "@kk-garden/shared/schemas";
import type {
  GardenShareGrant,
  GardenShareRequest,
  Nullable,
  User,
} from "@kk-garden/shared/types";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";
import type { GardenSharingRepository } from "@/services/crud/garden-sharing/garden-sharing.repository.ts";
import type { ProfileLookupService } from "@/services/crud/profile-lookup/profile-lookup.service.ts";
import type { GardenSharingTransactionService } from "@/services/transactions/garden-sharing/garden-sharing-transaction.service.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import { captureSuccessData } from "@/utils/capture-success-data.ts";
import { requireData } from "@/utils/require-data.ts";

export class GardenSharingService {
  constructor(
    private readonly repository: GardenSharingRepository,
    private readonly transactions: GardenSharingTransactionService,
    private readonly profileLookup: ProfileLookupService,
    private readonly userService: UserService,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.repository.initialize();
  }

  createRequest(
    requesterId: string,
    lookupCode: string,
  ): Promise<SuccessDataAny<CreateGardenShareRequestResponse>> {
    return captureSuccessData(
      "GardenSharingService.createRequest",
      async (): Promise<CreateGardenShareRequestResponse> => {
        const { userId: ownerId } = requireData(
          await this.profileLookup.resolveUserIdByLookupCode(
            requesterId,
            lookupCode,
          ),
          "Garden owner could not be resolved",
        );
        const request: GardenShareRequest = requireData(
          await this.transactions.createRequest(requesterId, ownerId),
          "Garden sharing request could not be created",
        );
        return { requestId: request._id };
      },
    );
  }

  listRequests(
    userId: string,
    direction: GardenShareDirection,
  ): Promise<SuccessDataAny<GardenShareListResponse>> {
    return captureSuccessData(
      "GardenSharingService.listRequests",
      async (): Promise<GardenShareListResponse> => {
        await this.assertActive(userId, "forbidden");
        const requests: GardenShareRequest[] = requireData(
          await this.repository.listRequests.direct(userId, direction),
          "Garden sharing requests could not be loaded",
        );
        const entries = await Promise.all(
          requests.map(
            async (request): Promise<GardenShareListEntry | null> => {
              const peerId: string =
                direction === "incoming"
                  ? request.requesterId
                  : request.ownerId;
              const card = await this.getCardOrNull(peerId);
              return card
                ? {
                    id: request._id,
                    displayName: card.displayName,
                    avatar: card.avatar,
                    createdAt: request.createdAt,
                  }
                : null;
            },
          ),
        );
        return {
          items: entries.filter(
            (entry): entry is GardenShareListEntry => entry !== null,
          ),
        };
      },
    );
  }

  acceptRequest(
    ownerId: string,
    requestId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return captureSuccessData(
      "GardenSharingService.acceptRequest",
      async (): Promise<GardenShareActionResponse> => {
        requireData(
          await this.transactions.acceptRequest(ownerId, requestId),
          "Garden access could not be granted",
        );
        return { success: true };
      },
    );
  }

  declineRequest(
    ownerId: string,
    requestId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.transactions.declineRequest(ownerId, requestId);
  }

  cancelRequest(
    requesterId: string,
    requestId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.transactions.cancelRequest(requesterId, requestId);
  }

  listGrants(
    userId: string,
    direction: GardenShareDirection,
  ): Promise<SuccessDataAny<GardenShareListResponse>> {
    return captureSuccessData(
      "GardenSharingService.listGrants",
      async (): Promise<GardenShareListResponse> => {
        await this.assertActive(userId, "forbidden");
        const grants: GardenShareGrant[] = requireData(
          await this.repository.listGrants.direct(userId, direction),
          "Garden access list could not be loaded",
        );
        const entries = await Promise.all(
          grants.map(async (grant): Promise<GardenShareListEntry | null> => {
            const peerId: string =
              direction === "incoming" ? grant.ownerId : grant.viewerId;
            const card = await this.getCardOrNull(peerId);
            return card
              ? {
                  id: grant._id,
                  displayName: card.displayName,
                  avatar: card.avatar,
                  createdAt: grant.grantedAt,
                }
              : null;
          }),
        );
        return {
          items: entries.filter(
            (entry): entry is GardenShareListEntry => entry !== null,
          ),
        };
      },
    );
  }

  revokeGrant(
    ownerId: string,
    grantId: string,
  ): Promise<SuccessDataAny<GardenShareActionResponse>> {
    return this.transactions.revokeGrant(ownerId, grantId);
  }

  authorize(
    viewerId: string,
    ownerId: string,
  ): Promise<SuccessDataAny<GardenShareGrant>> {
    return captureSuccessData("GardenSharingService.authorize", async () => {
      await this.assertActive(viewerId, "not-found");
      await this.assertActive(ownerId, "not-found");
      const grant: Nullable<GardenShareGrant> = requireData(
        await this.repository.findGrantByPair.direct(viewerId, ownerId),
        "Garden access lookup failed",
      ).grant;
      if (!grant) {
        throw new AppError({ status: 404, message: "Garden not found" });
      }
      return grant;
    });
  }

  private async assertActive(
    userId: string,
    inactivePolicy: "forbidden" | "not-found",
  ): Promise<void> {
    await this.tombstones.assertNotDeletedAsNotFound(
      userId,
      "Garden not found",
    );
    const user: User = requireData(
      await this.userService.getById.direct(userId),
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

  private async getCardOrNull(
    userId: string,
  ): Promise<Nullable<ProfileLookupCardResponse>> {
    const result: SuccessDataAny<ProfileLookupCardResponse> =
      await this.profileLookup.getCardForUserId(userId);
    if (result.success && result.data) {
      return result.data;
    }
    if (!result.success && result.errors[0]?.status === 404) {
      return null;
    }
    throw new AppError({
      status: result.success ? 503 : (result.errors[0]?.status ?? 503),
      message: result.success
        ? "Relationship profile card is unavailable"
        : (result.errors[0]?.message ??
          "Relationship profile card is unavailable"),
    });
  }
}
