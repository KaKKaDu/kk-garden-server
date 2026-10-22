import { RateLimiterMongo, RateLimiterRes } from "rate-limiter-flexible";
import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import { ProfileLookupCodeSchema } from "@kk-garden/shared/schemas";
import type { Nullable, Profile } from "@kk-garden/shared/types";
import type { ClientSession, Mongoose } from "mongoose";
import { parseProfile } from "@/schemas/models/index.ts";
import type { ProfileLookup } from "@/services/crud/profile/types.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { getConfiguredMongoDatabase } from "@/services/mongo/mongo.repository.ts";
import { Variables } from "@lib/variables/variables.ts";

const lookupVariables = Variables.of({
  "profile-collection-name": "profiles",
  "rate-collection-name": "profile_lookup_limits",
  "rate-key-prefix": "profile-lookup",
  "rate-points": 30,
  "rate-duration-seconds": 60,
  "lookup-code-index-name": "profile_lookup_code_unique",
} as const);

export class ProfileLookupRepository {
  private limiter?: RateLimiterMongo;

  constructor(private readonly mongoService: MongoService) {}

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<{ ready: true }> => {
        const database = getConfiguredMongoDatabase(connection);
        await database
          .collection<Profile>(lookupVariables.get("profile-collection-name"))
          .createIndex(
            { lookupCode: 1 },
            {
              name: lookupVariables.get("lookup-code-index-name"),
              unique: true,
              sparse: true,
            },
          );
        this.limiter = new RateLimiterMongo({
          storeClient: database,
          tableName: lookupVariables.get("rate-collection-name"),
          keyPrefix: lookupVariables.get("rate-key-prefix"),
          points: lookupVariables.get("rate-points"),
          duration: lookupVariables.get("rate-duration-seconds"),
          disableIndexesCreation: true,
        });
        await this.limiter.createIndexes();
        return { ready: true };
      },
      "ProfileLookupRepository.initialize",
    );
  }

  consumeLimit(
    requesterId: string,
  ): Promise<SuccessDataAny<{ consumed: true }>> {
    return this.mongoService.execute(async (): Promise<{ consumed: true }> => {
      if (!this.limiter) {
        throw new AppError({
          status: 503,
          message: "Profile lookup is not ready",
        });
      }
      try {
        await this.limiter.consume(requesterId);
      } catch (error: unknown) {
        throw new AppError({
          status: error instanceof RateLimiterRes ? 429 : 503,
          message:
            error instanceof RateLimiterRes
              ? "Profile lookup limit reached; try again later"
              : "Profile lookup rate limiter is unavailable",
        });
      }
      return { consumed: true };
    }, "ProfileLookupRepository.consumeLimit");
  }

  getProfileById(
    userId: string,
    session: Nullable<ClientSession>,
  ): Promise<SuccessDataAny<ProfileLookup>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<ProfileLookup> => {
        const profile: Nullable<Profile> = await getConfiguredMongoDatabase(
          connection,
        )
          .collection<Profile>(lookupVariables.get("profile-collection-name"))
          .findOne({ _id: userId }, { session: session ?? undefined });
        return { profile: profile ? parseProfile(profile) : null };
      },
      "ProfileLookupRepository.getProfileById",
    );
  }

  setCodeIfMissing(
    userId: string,
    lookupCode: string,
    session: Nullable<ClientSession>,
  ): Promise<SuccessDataAny<ProfileLookup>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<ProfileLookup> => {
        const collection = getConfiguredMongoDatabase(
          connection,
        ).collection<Profile>(lookupVariables.get("profile-collection-name"));
        const validatedCode: string = ProfileLookupCodeSchema.parse(lookupCode);
        await collection.updateOne(
          { _id: userId, lookupCode: { $exists: false } },
          { $set: { lookupCode: validatedCode } },
          { session: session ?? undefined },
        );
        const current: Nullable<Profile> = await collection.findOne(
          { _id: userId },
          { session: session ?? undefined },
        );
        return { profile: current ? parseProfile(current) : null };
      },
      "ProfileLookupRepository.setCodeIfMissing",
    );
  }

  findByLookupCode(lookupCode: string): Promise<SuccessDataAny<ProfileLookup>> {
    return this.mongoService.execute(
      async (connection: Mongoose): Promise<ProfileLookup> => {
        const validatedCode: string = ProfileLookupCodeSchema.parse(lookupCode);
        const profile: Nullable<Profile> = await getConfiguredMongoDatabase(
          connection,
        )
          .collection<Profile>(lookupVariables.get("profile-collection-name"))
          .findOne({ lookupCode: validatedCode });
        return { profile: profile ? parseProfile(profile) : null };
      },
      "ProfileLookupRepository.findByLookupCode",
    );
  }
}
