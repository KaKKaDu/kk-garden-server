import assert from "node:assert/strict";
import { GardenShareListQuerySchema } from "@kk-garden/shared/schemas";
import type { DataObject, SuccessDataAny } from "@kk-garden/shared/errors";
import type { Mongoose } from "mongoose";
import {
  GardenShareGrantMongoSchema as GrantSchema,
  GardenShareRequestMongoSchema as RequestSchema,
} from "../src/schemas/models/index.ts";
import type { MongoService } from "../src/services/mongo/mongo.service.ts";
import { GardenSharingRepository as Repository } from "../src/services/crud/garden-sharing/garden-sharing.repository.ts";

/* eslint-disable no-console */

type SmokeRecord = {
  [key: string]: string | Date | undefined;
  _id: string;
  ownerId: string;
  requesterId?: string;
  viewerId?: string;
  createdAt?: Date;
  grantedAt?: Date;
};

type QueryCapture = {
  filter: Record<string, string>;
  sort: Record<string, 1 | -1>;
  skip: number;
  limit: number;
};

class FakeQuery {
  private sortFields: Record<string, 1 | -1> = {};
  private skipCount = 0;
  private limitCount = 0;

  constructor(
    private readonly rows: SmokeRecord[],
    private readonly filter: Record<string, string>,
    private readonly captures: QueryCapture[],
  ) {}

  sort(fields: Record<string, 1 | -1>): this {
    this.sortFields = fields;
    return this;
  }

  skip(count: number): this {
    this.skipCount = count;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  session(): this {
    return this;
  }

  async exec(): Promise<Array<{ toObject: () => SmokeRecord }>> {
    this.captures.push({
      filter: this.filter,
      sort: this.sortFields,
      skip: this.skipCount,
      limit: this.limitCount,
    });
    const matches = this.rows
      .filter((row) =>
        Object.entries(this.filter).every(([key, value]) => row[key] === value),
      )
      .sort((left, right) => {
        for (const [field, direction] of Object.entries(this.sortFields)) {
          const a = left[field];
          const b = right[field];
          if (a === b) continue;
          if (a instanceof Date && b instanceof Date) {
            return a < b ? -direction : direction;
          }
          const leftValue = String(a);
          const rightValue = String(b);
          if (leftValue !== rightValue) {
            return leftValue < rightValue ? -direction : direction;
          }
        }
        return 0;
      });

    return matches
      .slice(this.skipCount, this.skipCount + this.limitCount)
      .map((row) => ({ toObject: () => row }));
  }
}

const makeModel = (rows: SmokeRecord[], captures: QueryCapture[]) => ({
  find: (filter: Record<string, string>) =>
    new FakeQuery(rows, filter, captures),
});

const assertPage = <T extends { _id: string }>(
  result: SuccessDataAny<{ items: T[]; hasNextPage: boolean }>,
  expectedIds: string[],
  hasNextPage: boolean,
): void => {
  assert.equal(result.success, true);
  if (!result.success || !result.data) {
    throw new Error("Pagination repository call failed");
  }
  assert.deepEqual(
    result.data.items.map((item) => item._id),
    expectedIds,
  );
  assert.equal(result.data.hasNextPage, hasNextPage);
};

const run = async (): Promise<void> => {
  assert.deepEqual(
    GardenShareListQuerySchema.parse({ direction: "incoming" }),
    { direction: "incoming", page: 1, pageSize: 50 },
  );
  assert.deepEqual(
    GardenShareListQuerySchema.parse({
      direction: "outgoing",
      page: "4",
      pageSize: "2",
    }),
    { direction: "outgoing", page: 4, pageSize: 2 },
  );
  assert.equal(
    GardenShareListQuerySchema.safeParse({
      direction: "incoming",
      page: 1,
      pageSize: 51,
    }).success,
    false,
  );
  assert.equal(
    GardenShareListQuerySchema.safeParse({
      direction: "incoming",
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 50,
    }).success,
    false,
  );

  const timestamp = new Date("2026-10-28T12:00:00.000Z");
  const actorId = "actor";
  const peerId = "peer";
  const requestRows: SmokeRecord[] = [
    {
      _id: "request-a",
      requesterId: peerId,
      ownerId: actorId,
      createdAt: timestamp,
    },
    {
      _id: "request-b",
      requesterId: peerId,
      ownerId: actorId,
      createdAt: timestamp,
    },
    {
      _id: "request-c",
      requesterId: peerId,
      ownerId: actorId,
      createdAt: new Date(timestamp.getTime() - 1),
    },
    {
      _id: "request-out-a",
      requesterId: actorId,
      ownerId: peerId,
      createdAt: timestamp,
    },
    {
      _id: "request-out-b",
      requesterId: actorId,
      ownerId: peerId,
      createdAt: new Date(timestamp.getTime() - 1),
    },
    {
      _id: "request-unrelated",
      requesterId: "other",
      ownerId: "other-owner",
      createdAt: timestamp,
    },
  ];
  const grantRows: SmokeRecord[] = [
    {
      _id: "grant-a",
      viewerId: actorId,
      ownerId: peerId,
      grantedAt: timestamp,
    },
    {
      _id: "grant-b",
      viewerId: actorId,
      ownerId: peerId,
      grantedAt: timestamp,
    },
    {
      _id: "grant-c",
      viewerId: actorId,
      ownerId: peerId,
      grantedAt: new Date(timestamp.getTime() - 1),
    },
    {
      _id: "grant-out-a",
      viewerId: peerId,
      ownerId: actorId,
      grantedAt: timestamp,
    },
    {
      _id: "grant-out-b",
      viewerId: peerId,
      ownerId: actorId,
      grantedAt: new Date(timestamp.getTime() - 1),
    },
    {
      _id: "grant-unrelated",
      viewerId: "other",
      ownerId: "other-owner",
      grantedAt: timestamp,
    },
  ];
  const requestCaptures: QueryCapture[] = [];
  const grantCaptures: QueryCapture[] = [];
  const requestModel = makeModel(requestRows, requestCaptures);
  const grantModel = makeModel(grantRows, grantCaptures);
  const db = {
    models: {
      GardenShareRequest: requestModel,
      GardenShareGrant: grantModel,
    },
  } as unknown as Mongoose;
  const mongoService = {
    execute: async <T extends DataObject>(
      callback: (connection: Mongoose) => Promise<T>,
    ): Promise<SuccessDataAny<T>> => ({
      success: true,
      data: await callback(db),
    }),
  } as MongoService;
  const repository = new Repository(mongoService);

  assertPage(
    await repository.listRequests.direct(actorId, "incoming", 1, 2),
    ["request-b", "request-a"],
    true,
  );
  assertPage(
    await repository.listRequests.direct(actorId, "incoming", 2, 2),
    ["request-c"],
    false,
  );
  assertPage(
    await repository.listRequests.direct(actorId, "outgoing", 1, 2),
    ["request-out-a", "request-out-b"],
    false,
  );
  assertPage(
    await repository.listGrants.direct(actorId, "incoming", 1, 2),
    ["grant-b", "grant-a"],
    true,
  );
  assertPage(
    await repository.listGrants.direct(actorId, "incoming", 2, 2),
    ["grant-c"],
    false,
  );
  assertPage(
    await repository.listGrants.direct(actorId, "outgoing", 1, 2),
    ["grant-out-a", "grant-out-b"],
    false,
  );

  assert.deepEqual(requestCaptures[0], {
    filter: { ownerId: actorId },
    sort: { createdAt: -1, _id: -1 },
    skip: 0,
    limit: 3,
  });
  assert.deepEqual(requestCaptures[1].skip, 2);
  assert.deepEqual(requestCaptures[2].filter, { requesterId: actorId });
  assert.deepEqual(grantCaptures[0], {
    filter: { viewerId: actorId },
    sort: { grantedAt: -1, _id: -1 },
    skip: 0,
    limit: 3,
  });
  assert.deepEqual(grantCaptures[1].skip, 2);
  assert.deepEqual(grantCaptures[2].filter, { ownerId: actorId });

  const requestIndexes = RequestSchema.indexes();
  const grantIndexes = GrantSchema.indexes();
  assert.ok(
    requestIndexes.some(
      ([fields]) =>
        JSON.stringify(fields) ===
        JSON.stringify({ ownerId: 1, createdAt: -1, _id: -1 }),
    ),
  );
  assert.ok(
    requestIndexes.some(
      ([fields]) =>
        JSON.stringify(fields) ===
        JSON.stringify({ requesterId: 1, createdAt: -1, _id: -1 }),
    ),
  );
  assert.ok(
    grantIndexes.some(
      ([fields]) =>
        JSON.stringify(fields) ===
        JSON.stringify({ viewerId: 1, grantedAt: -1, _id: -1 }),
    ),
  );
  assert.ok(
    grantIndexes.some(
      ([fields]) =>
        JSON.stringify(fields) ===
        JSON.stringify({ ownerId: 1, grantedAt: -1, _id: -1 }),
    ),
  );
};

void run()
  .then(() => {
    console.log("Garden sharing pagination smoke checks passed.");
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Pagination smoke failed",
    );
    process.exitCode = 1;
  });
