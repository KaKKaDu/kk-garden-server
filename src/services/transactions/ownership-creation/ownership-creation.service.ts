import type { OwnershipService } from "@/services/crud/ownership/ownership.service.ts";
import type { UserService } from "@/services/crud/user/user.service.ts";
import type { SignatureService } from "@/services/crud/signature/signature.service.ts";
import type { VisualisationService } from "@/services/crud/visualisation/visualisation.service.ts";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.ts";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type {
  Ownership,
  Signature,
  User,
  VisualisationDto,
} from "@kk-garden/shared/types";
import type { ClientSession, Mongoose } from "mongoose";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/tombstone/account-deletion-tombstone.service.ts";

export class OwnershipCreationService {
  constructor(
    private readonly ownershipService: OwnershipService,
    private readonly userService: UserService,
    private readonly signatureService: SignatureService,
    private readonly visualisationService: VisualisationService,
    private readonly visualisationPendingService: VisualisationPendingService,
    private readonly mongoService: MongoService,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  async createOwnershipTransaction(
    ownerId: string,
    visualisationId: string,
    pendingId?: string,
  ): Promise<SuccessDataAny<Ownership>> {
    return this.mongoService.execute(
      async (db: Mongoose): Promise<Ownership> => {
        const session: ClientSession = await db.startSession();

        try {
          const transactionResult: SuccessDataAny<Ownership> =
            await session.withTransaction(
              async (): Promise<SuccessDataAny<Ownership>> => {
                await this.tombstones.assertMutationAllowed(ownerId, session);
                const verifyUser: SuccessDataAny<User> =
                  await this.userService.getById(ownerId, session);

                if (!verifyUser.success) {
                  throw new Error("User for the transaction not found");
                }

                const verifyVisualisation: SuccessDataAny<VisualisationDto> =
                  pendingId
                    ? await this.visualisationPendingService.persistByPendingIdAndVisualisationId(
                        ownerId,
                        pendingId,
                        visualisationId,
                        session,
                      )
                    : await this.visualisationService.getById(
                        visualisationId,
                        true,
                        session,
                      );

                if (!verifyVisualisation.success) {
                  throw verifyVisualisation.errors[0];
                }
                if (!verifyVisualisation.data) {
                  throw new AppError({
                    status: 500,
                    message:
                      "Visualisation for the transaction returned no data",
                  });
                }

                const visualisation: VisualisationDto =
                  verifyVisualisation.data;
                const resolvedVisualisationId: string = visualisation._id;

                const isVisualisationValid: SuccessDataAny =
                  this.visualisationService.verify(
                    resolvedVisualisationId,
                    visualisation.data,
                  );

                if (!isVisualisationValid.success) {
                  throw new Error(
                    "Visualisation data identity verification failed",
                  );
                }

                const createSignature: SuccessDataAny<Signature> =
                  await this.signatureService.mint(
                    resolvedVisualisationId,
                    session,
                  );

                if (!createSignature.success || !createSignature.data) {
                  throw new Error("Signature mint failed");
                }

                const signatureId: string = createSignature.data._id;

                const createOwnership = await this.ownershipService.assign(
                  ownerId,
                  signatureId,
                  session,
                );

                if (!createOwnership.success) {
                  throw createOwnership.errors[0];
                }
                if (!createOwnership.data) {
                  throw new AppError({
                    status: 500,
                    message: "Ownership creation returned no data",
                  });
                }

                return createOwnership;
              },
            );

          if (!transactionResult.success || !transactionResult.data) {
            throw new Error("Ownership creation transaction failed");
          }

          return transactionResult.data;
        } finally {
          await session.endSession();
        }
      },
      "OwnershipCreationService.createOwnershipTransaction",
    );
  }
}
