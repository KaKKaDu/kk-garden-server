import mongoose, { Mongoose } from "mongoose";
import type { Db } from "mongodb";
import { handleError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import { Logger } from "@lib/logs/logger.ts";
import { getEnvService } from "@/services/env/index.ts";

export const getConfiguredMongoDatabase = (connection: Mongoose): Db => {
  const database = connection.connection.db;
  if (!database) {
    throw new Error("MongoDB connection has no configured database");
  }
  return database;
};

export class MongoRepository {
  private connection: Nullable<Mongoose> = null;

  async getConnection(): Promise<SuccessDataAny<Mongoose>> {
    try {
      if (this.connection && mongoose.connection.readyState === 1) {
        return { success: true, data: this.connection };
      }

      const mongoUri: Nullable<string> =
        getEnvService().getRawEnvValue("MONGODB_URI");

      if (!mongoUri) {
        throw new Error("MONGODB_URI is not defined in environment variables");
      }

      const dbName: Nullable<string> =
        getEnvService().getRawEnvValue("MONGODB_DB_NAME");
      if (!dbName) {
        throw new Error(
          "MONGODB_DB_NAME is not defined in environment variables",
        );
      }

      this.connection = await mongoose.connect(mongoUri, {
        dbName,
      });
      const result: SuccessDataAny<Mongoose> = {
        success: true,
        data: this.connection,
      };
      Logger.report("MongoRepository.getConnection", result);
      return result;
    } catch (error: unknown) {
      const failedResult: SuccessDataAny<Mongoose> =
        handleError<Mongoose>(error);
      Logger.report("MongoRepository.getConnection", failedResult);
      return failedResult;
    }
  }
}
