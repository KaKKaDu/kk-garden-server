import { AppError, type SuccessDataAny } from "@kk-garden/shared/errors";
import type { GardenShareDirection } from "@kk-garden/shared/schemas";
import type {
  GardenShareGrant,
  GardenShareRequest,
  Nullable,
} from "@kk-garden/shared/types";
import { MongoServerError } from "mongodb";
import type { ClientSession, Model, Mongoose } from "mongoose";
import {
  GardenShareGrantMongoSchema,
  GardenShareRequestMongoSchema,
  parseGardenShareGrant,
  parseGardenShareRequest,
} from "@/schemas/models/index.ts";
import type { MongoService } from "@/services/mongo/mongo.service.ts";
import { transactional, type DocumentLike } from "@/types/mongo.types.ts";
import { Variables } from "@lib/variables/variables.ts";

type RequestActor = "requesterId" | "ownerId";

const sharingVariables = Variables.of({
  "request-model-name": "GardenShareRequest",
  "request-collection-name": "garden_share_requests",
  "grant-model-name": "GardenShareGrant",
  "grant-collection-name": "garden_share_grants",
  "list-limit": 50,
} as const);

export class GardenSharingRepository {
  constructor(private readonly mongoService: MongoService) {}

  private getRequestModel(db: Mongoose): Model<GardenShareRequest> {
    const existing: Nullable<Model<GardenShareRequest>> = db.models[
      sharingVariables.get("request-model-name")
    ] as Nullable<Model<GardenShareRequest>>;
    return (
      existing ??
      db.model<GardenShareRequest>(
        sharingVariables.get("request-model-name"),
        GardenShareRequestMongoSchema,
        sharingVariables.get("request-collection-name"),
      )
    );
  }

  private getGrantModel(db: Mongoose): Model<GardenShareGrant> {
    const existing: Nullable<Model<GardenShareGrant>> = db.models[
      sharingVariables.get("grant-model-name")
    ] as Nullable<Model<GardenShareGrant>>;
    return (
      existing ??
      db.model<GardenShareGrant>(
        sharingVariables.get("grant-model-name"),
        GardenShareGrantMongoSchema,
        sharingVariables.get("grant-collection-name"),
      )
    );
  }

  private toRequest(document: DocumentLike): GardenShareRequest {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<GardenShareRequest, "_id"> & { _id?: unknown };
    return parseGardenShareRequest({ ...raw, _id: String(raw._id) });
  }

  private toGrant(document: DocumentLike): GardenShareGrant {
    const raw = document.toObject({
      flattenMaps: true,
    }) as Omit<GardenShareGrant, "_id"> & { _id?: unknown };
    return parseGardenShareGrant({ ...raw, _id: String(raw._id) });
  }

  initialize(): Promise<SuccessDataAny<{ ready: true }>> {
    return this.mongoService.execute(
      async (db: Mongoose): Promise<{ ready: true }> => {
        await Promise.all([
          this.getRequestModel(db).init(),
          this.getGrantModel(db).init(),
        ]);
        return { ready: true };
      },
      "GardenSharingRepository.initialize",
    );
  }

  createRequest = transactional(
    async (
      request: GardenShareRequest,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<GardenShareRequest>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<GardenShareRequest> => {
          const model: Model<GardenShareRequest> = this.getRequestModel(db);
          try {
            const document: DocumentLike = await new model(
              parseGardenShareRequest(request),
            ).save(session ? { session } : undefined);
            return this.toRequest(document);
          } catch (error: unknown) {
            if (error instanceof MongoServerError && error.code === 11000) {
              throw new AppError({
                status: 409,
                message: "A pending sharing request already exists",
              });
            }
            throw error;
          }
        },
        "GardenSharingRepository.createRequest",
      );
    },
  );

  getRequestById = transactional(
    async (
      requestId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<GardenShareRequest>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<GardenShareRequest> => {
          const query = this.getRequestModel(db).findById(requestId);
          if (session) query.session(session);
          const document: Nullable<DocumentLike> = await query.exec();
          if (!document) {
            throw new AppError({
              status: 404,
              message: "Sharing request not found",
            });
          }
          return this.toRequest(document);
        },
        "GardenSharingRepository.getRequestById",
      );
    },
  );

  listRequests = transactional(
    async (
      userId: string,
      direction: GardenShareDirection,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<GardenShareRequest[]>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<GardenShareRequest[]> => {
          const field: RequestActor =
            direction === "incoming" ? "ownerId" : "requesterId";
          const query = this.getRequestModel(db)
            .find({ [field]: userId })
            .sort({ createdAt: -1 })
            .limit(sharingVariables.get("list-limit"));
          if (session) query.session(session);
          const documents: DocumentLike[] = await query.exec();
          return documents.map((document) => this.toRequest(document));
        },
        "GardenSharingRepository.listRequests",
      );
    },
  );

  deleteRequest = transactional(
    async (
      requestId: string,
      actorId: string,
      actor: RequestActor,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<{ deleted: true }>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<{ deleted: true }> => {
          const query = this.getRequestModel(db).findOneAndDelete({
            _id: requestId,
            [actor]: actorId,
          });
          if (session) query.session(session);
          const document: Nullable<DocumentLike> = await query.exec();
          if (!document) {
            throw new AppError({
              status: 404,
              message: "Sharing request not found",
            });
          }
          return { deleted: true };
        },
        "GardenSharingRepository.deleteRequest",
      );
    },
  );

  createGrant = transactional(
    async (
      grant: GardenShareGrant,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<GardenShareGrant>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<GardenShareGrant> => {
          const model: Model<GardenShareGrant> = this.getGrantModel(db);
          try {
            const document: DocumentLike = await new model(
              parseGardenShareGrant(grant),
            ).save(session ? { session } : undefined);
            return this.toGrant(document);
          } catch (error: unknown) {
            if (error instanceof MongoServerError && error.code === 11000) {
              throw new AppError({
                status: 409,
                message: "Garden access already exists",
              });
            }
            throw error;
          }
        },
        "GardenSharingRepository.createGrant",
      );
    },
  );

  getGrantById = transactional(
    async (
      grantId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<GardenShareGrant>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<GardenShareGrant> => {
          const query = this.getGrantModel(db).findById(grantId);
          if (session) query.session(session);
          const document: Nullable<DocumentLike> = await query.exec();
          if (!document) {
            throw new AppError({
              status: 404,
              message: "Garden access not found",
            });
          }
          return this.toGrant(document);
        },
        "GardenSharingRepository.getGrantById",
      );
    },
  );

  findGrantByPair = transactional(
    async (
      viewerId: string,
      ownerId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<{ grant: Nullable<GardenShareGrant> }>> => {
      return this.mongoService.execute(
        async (
          db: Mongoose,
        ): Promise<{ grant: Nullable<GardenShareGrant> }> => {
          const query = this.getGrantModel(db).findOne({ viewerId, ownerId });
          if (session) query.session(session);
          const document: Nullable<DocumentLike> = await query.exec();
          return { grant: document ? this.toGrant(document) : null };
        },
        "GardenSharingRepository.findGrantByPair",
      );
    },
  );

  listGrants = transactional(
    async (
      userId: string,
      direction: GardenShareDirection,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<GardenShareGrant[]>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<GardenShareGrant[]> => {
          const field = direction === "incoming" ? "viewerId" : "ownerId";
          const query = this.getGrantModel(db)
            .find({ [field]: userId })
            .sort({ grantedAt: -1 })
            .limit(sharingVariables.get("list-limit"));
          if (session) query.session(session);
          const documents: DocumentLike[] = await query.exec();
          return documents.map((document) => this.toGrant(document));
        },
        "GardenSharingRepository.listGrants",
      );
    },
  );

  deleteGrantByOwner = transactional(
    async (
      grantId: string,
      ownerId: string,
      session: Nullable<ClientSession>,
    ): Promise<SuccessDataAny<{ deleted: true }>> => {
      return this.mongoService.execute(
        async (db: Mongoose): Promise<{ deleted: true }> => {
          const query = this.getGrantModel(db).findOneAndDelete({
            _id: grantId,
            ownerId,
          });
          if (session) query.session(session);
          const document: Nullable<DocumentLike> = await query.exec();
          if (!document) {
            throw new AppError({
              status: 404,
              message: "Garden access not found",
            });
          }
          return { deleted: true };
        },
        "GardenSharingRepository.deleteGrantByOwner",
      );
    },
  );
}
