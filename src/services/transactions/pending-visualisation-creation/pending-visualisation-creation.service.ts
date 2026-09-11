import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  GardenDrawDataDto,
  VisualisationPendingDto,
} from "@kk-garden/shared/types";
import type { VisualisationPendingService } from "@/services/crud/visualisation-pending/visualisation-pending.service.js";
import type { MongoService } from "@/services/mongo/mongo.service.js";
import type { ClientSession, Mongoose } from "mongoose";

export class PendingVisualisationCreationService {
  constructor(
    private readonly visualisationPendingService: VisualisationPendingService,
    private readonly mongoService: MongoService,
  ) {}

  async createPendingVisualisationsTransaction(
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
                const pendingVisualisations: VisualisationPendingDto[] = [];

                for (const generation of generations) {
                  const createResult: SuccessDataAny<VisualisationPendingDto> =
                    await this.visualisationPendingService.createFromData(
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
