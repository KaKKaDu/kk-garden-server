import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import mongoose, { type Mongoose } from "mongoose";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import type {
  GardenShareDirection,
  GardenShareListResponse,
} from "@kk-garden/shared/schemas";
import { getAccountDeletionTombstoneService } from "../src/services/account-deletion/index.ts";
import { getGardenSharingService } from "../src/services/crud/garden-sharing/index.ts";
import { getMongoService } from "../src/services/mongo/index.ts";
import { getConfiguredMongoDatabase } from "../src/services/mongo/mongo.repository.ts";
import { requireData } from "../src/utils/require-data.ts";

/* eslint-disable no-console */

const pageSize = 50;
const warmupRuns = 3;
const measuredRuns = 25;
const latencyTargetMs = 500;
const defaultPages = [1, 10, 100, 1_000];

type ListShape = {
  kind: "requests" | "grants";
  direction: GardenShareDirection;
  collection: "garden_share_requests" | "garden_share_grants";
  actorField: "ownerId" | "requesterId" | "viewerId";
  sortField: "createdAt" | "grantedAt";
};

type ExplainSummary = {
  stages: string[];
  totalKeysExamined: number;
  totalDocsExamined: number;
};

const shapes: ListShape[] = [
  {
    kind: "requests",
    direction: "incoming",
    collection: "garden_share_requests",
    actorField: "ownerId",
    sortField: "createdAt",
  },
  {
    kind: "requests",
    direction: "outgoing",
    collection: "garden_share_requests",
    actorField: "requesterId",
    sortField: "createdAt",
  },
  {
    kind: "grants",
    direction: "incoming",
    collection: "garden_share_grants",
    actorField: "viewerId",
    sortField: "grantedAt",
  },
  {
    kind: "grants",
    direction: "outgoing",
    collection: "garden_share_grants",
    actorField: "ownerId",
    sortField: "grantedAt",
  },
];

const readPages = (): number[] => {
  const rawPages = process.argv[3];
  const pages = rawPages
    ? rawPages.split(",").map((value) => Number(value.trim()))
    : defaultPages;
  if (
    pages.length === 0 ||
    pages.some((page) => !Number.isSafeInteger(page) || page < 1)
  ) {
    throw new Error(
      "Pages must be positive safe integers, for example: 1,10,100,1000",
    );
  }
  return [...new Set(pages)];
};

const collectStages = (value: unknown, stages: string[]): void => {
  if (Array.isArray(value)) {
    for (const entry of value) collectStages(entry, stages);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record: Record<string, unknown> = value as Record<string, unknown>;
  if (typeof record.stage === "string") stages.push(record.stage);
  for (const nested of Object.values(record)) collectStages(nested, stages);
};

const percentile95 = (samples: number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
};

const executeList = (
  kind: ListShape["kind"],
  userId: string,
  direction: GardenShareDirection,
  page: number,
): Promise<SuccessDataAny<GardenShareListResponse>> =>
  kind === "requests"
    ? getGardenSharingService().listRequests(userId, {
        direction,
        page,
        pageSize,
      })
    : getGardenSharingService().listGrants(userId, {
        direction,
        page,
        pageSize,
      });

const requireListData = (
  result: SuccessDataAny<GardenShareListResponse>,
): GardenShareListResponse => {
  if (!result.success || !result.data) {
    throw new Error("Sharing list request failed; benchmark cannot continue");
  }
  return result.data;
};

const explainQuery = async (
  shape: ListShape,
  userId: string,
  page: number,
): Promise<ExplainSummary> => {
  const result = await getMongoService().execute(
    async (connection: Mongoose): Promise<ExplainSummary> => {
      const explain = await getConfiguredMongoDatabase(connection)
        .collection(shape.collection)
        .find({ [shape.actorField]: userId })
        .sort({ [shape.sortField]: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize + 1)
        .explain("executionStats");
      const stages: string[] = [];
      collectStages(explain.queryPlanner.winningPlan, stages);
      return {
        stages,
        totalKeysExamined: explain.executionStats.totalKeysExamined,
        totalDocsExamined: explain.executionStats.totalDocsExamined,
      };
    },
    "GardenSharingPaginationBenchmark.explain",
    false,
  );
  return requireData(result, "Sharing list query plan could not be loaded");
};

const run = async (): Promise<void> => {
  dotenv.config({ quiet: true });

  const userId = process.argv[2];
  if (!userId) {
    throw new Error(
      "Usage: npm run benchmark:garden-sharing-pagination -- <active-user-id> [pages]",
    );
  }
  const pages = readPages();
  const initialized = await getGardenSharingService().initialize();
  requireData(initialized, "Sharing indexes could not be initialized");
  const tombstoneIndex =
    await getAccountDeletionTombstoneService().initialize();
  requireData(tombstoneIndex, "Tombstone index could not be initialized");

  let withinLatencyTarget = true;
  let queryPlansUseIndexes = true;
  let representativeDataAvailable = true;

  for (const shape of shapes) {
    const filter: Record<string, string> = { [shape.actorField]: userId };
    const countResult = await getMongoService().execute(
      async (connection: Mongoose): Promise<{ count: number }> => ({
        count: await getConfiguredMongoDatabase(connection)
          .collection(shape.collection)
          .countDocuments(filter),
      }),
      "GardenSharingPaginationBenchmark.count",
      false,
    );
    const matchingRecords = requireData(
      countResult,
      "Sharing list record count could not be loaded",
    ).count;
    console.log(
      `${shape.kind}/${shape.direction}: ${matchingRecords} matching records`,
    );

    for (const page of pages) {
      for (let run = 0; run < warmupRuns; run++) {
        requireListData(
          await executeList(shape.kind, userId, shape.direction, page),
        );
      }

      const samples: number[] = [];
      let response: GardenShareListResponse | undefined;
      for (let run = 0; run < measuredRuns; run++) {
        const start = performance.now();
        response = requireListData(
          await executeList(shape.kind, userId, shape.direction, page),
        );
        samples.push(performance.now() - start);
      }

      const p95Ms = percentile95(samples);
      const explain = await explainQuery(shape, userId, page);
      const hasCollectionScan = explain.stages.includes("COLLSCAN");
      const hasBlockingSort = explain.stages.includes("SORT");
      const enoughRowsForPage = matchingRecords >= page * pageSize;
      if (!enoughRowsForPage || response?.items.length !== pageSize) {
        representativeDataAvailable = false;
      }
      if (p95Ms >= latencyTargetMs || hasCollectionScan || hasBlockingSort) {
        withinLatencyTarget = false;
      }
      if (hasCollectionScan || hasBlockingSort) queryPlansUseIndexes = false;

      console.log(
        JSON.stringify({
          kind: shape.kind,
          direction: shape.direction,
          page,
          pageSize,
          matchingRecords,
          enoughRowsForPage,
          returnedItems: response?.items.length ?? 0,
          hasNextPage: response?.hasNextPage ?? false,
          p95ServiceLatencyMs: Number(p95Ms.toFixed(2)),
          stages: explain.stages,
          totalKeysExamined: explain.totalKeysExamined,
          totalDocsExamined: explain.totalDocsExamined,
        }),
      );
    }
  }

  if (
    !withinLatencyTarget ||
    !queryPlansUseIndexes ||
    !representativeDataAvailable
  ) {
    process.exitCode = 1;
    console.error(
      `Benchmark failed: each requested page needs ${pageSize} profile-backed rows, p95 must be below ${latencyTargetMs} ms, and query plans must avoid COLLSCAN/SORT.`,
    );
  }
};

void run()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Pagination benchmark failed",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
