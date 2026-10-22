import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  GardenDrawDataDto,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import type { ClientSession, Mongoose } from "mongoose";
import type { AccountDeletionTombstoneService } from "@/services/account-deletion/account-deletion-tombstone.service.ts";

export class PendingVisualisationCreationService {
  constructor(
    private readonly visualisationPendingService: VisualisationPendingService,
    private readonly mongoService: MongoService,
    private readonly tombstones: AccountDeletionTombstoneService,
  ) {}

  async createPendingVisualisationsTransaction(
    ownerId: string,
    pendingId: string,
    generations: GardenDrawDataDto[],
  ): Promise<SuccessDataAny<VisualisationPendingDto[]>> {
    return this.mongoService.execute(
      async (db: Mongoose): Promise<VisualisationPendingDto[]> => {
        const session: ClientSession = await db.startSession();

        try {
          const transactionResult: SuccessDataAny<VisualisationPendingDto[]> =
            await session.withTransaction(
              async (): Promise<SuccessDataAny<VisualisationPendingDto[]>> => {
                await this.tombstones.assertMutationAllowed(ownerId, session);
                const pendingVisualisations: VisualisationPendingDto[] = [];

                for (const generation of generations) {
                  const createResult: SuccessDataAny<VisualisationPendingDto> =
                    await this.visualisationPendingService.createFromData(
                      ownerId,
                      pendingId,
                      generation,
                      session,
                    );

                  if (!createResult.success || !createResult.data) {
                    throw new Error(
                      "Pending visualisation creation in transaction failed",
                    );
                  }

                  pendingVisualisations.push(createResult.data);
                }

                return {
                  success: true,
                  data: pendingVisualisations,
                };
              },
            );

          if (!transactionResult.success || !transactionResult.data) {
            throw new Error("Pending visualisation init transaction failed");
          }

          return transactionResult.data;
        } finally {
          await session.endSession();
        }
      },
      "PendingVisualisationCreationService.createPendingVisualisationsTransaction",
    );
  }
}
