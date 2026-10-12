import type { Mongoose } from "mongoose";
import type { Db, MongoClient } from "mongodb";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { getMongoService } from "@/services/mongo/index.js";

export interface AuthDbBridge {
  db: Db;
  client: MongoClient;
}

// Reuses the existing Mongoose connection so better-auth doesn't open a second pool.
export const getAuthDb = async (): Promise<SuccessDataAny<AuthDbBridge>> => {
  return getMongoService().execute<AuthDbBridge>(
    async (connection: Mongoose): Promise<AuthDbBridge> => {
      const client: MongoClient = connection.connection.getClient();
      const db: Db = client.db();
      return { db, client };
    },
    "auth-db.getAuthDb",
  );
};
