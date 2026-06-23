import { Mongoose } from "mongoose";
import type { MongoRepository } from "@/services/mongo/mongo.repository.js";
import {
  type DataObject,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.js";

export class MongoService {
  constructor(private readonly repository: MongoRepository) {}

  async execute<T extends DataObject>(
    callback: (db: Mongoose) => Promise<T>,
    context?: string,
  ): Promise<SuccessDataAny<T>> {
    const reportContext: string = context ?? "MongoService.execute";
    const connectionResult: SuccessDataAny<Mongoose> =
      await this.repository.getConnection();

    if (!connectionResult.success) {
      const failedConnectionResult: SuccessDataAny<T> =
        connectionResult as unknown as SuccessDataAny<T>;
      Logger.report(reportContext, failedConnectionResult);
      return failedConnectionResult;
    }

    try {
      const data: T = await callback(connectionResult.data!);
      const result: SuccessDataAny<T> = { success: true, data };
      Logger.report(reportContext, result);
      return result;
    } catch (error: unknown) {
      const failedResult: SuccessDataAny<T> = handleError<T>(error);
      Logger.report(reportContext, failedResult);
      return failedResult;
    }
  }
}
