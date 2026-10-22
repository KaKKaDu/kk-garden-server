import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import type { DataObject, SuccessDataAny } from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import { getAvatarStorageService } from "../src/services/avatar/avatar-storage/index.ts";
import type { AvatarStorageService } from "../src/services/avatar/avatar-storage/avatar-storage.service.ts";
import { parseClientOrigins } from "../src/lib/auth/auth-origins.ts";

/* eslint-disable no-console */

dotenv.config({ quiet: true });

const requireData = <T extends DataObject>(result: SuccessDataAny<T>): T => {
  if (!result.success) {
    throw new Error(
      result.errors.map((error): string => error.message).join("; "),
    );
  }
  if (!result.data) {
    throw new Error("Storage operation returned no data");
  }
  return result.data;
};

const request = async (url: string, init?: RequestInit): Promise<Response> => {
  return fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
};

const run = async (): Promise<void> => {
  const rawOrigins: Nullable<string> = process.env.CLIENT_ORIGINS;
  assert(rawOrigins, "CLIENT_ORIGINS must be configured");
  const origins: string[] = parseClientOrigins(
    rawOrigins,
    process.env.NODE_ENV === "production",
  );
  const storage: AvatarStorageService = getAvatarStorageService();
  const keys: string[] = [];
  const fixture: Buffer = Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    "base64",
  );
  try {
    const upload = requireData(await storage.issueUpload("image/webp"));
    keys.push(upload.objectKey);
    const putUrl: URL = new URL(upload.url);
    assert(
      putUrl.searchParams.get("X-Amz-Expires") === "900",
      "PUT must expire in 15 minutes",
    );
    assert(
      putUrl.searchParams.get("X-Amz-SignedHeaders")?.includes("content-type"),
      "PUT must sign Content-Type",
    );
    for (const origin of origins) {
      const preflight: Response = await request(upload.url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert(
        preflight.ok,
        "R2 PUT preflight must succeed for each configured client origin",
      );
      assert(
        preflight.headers.get("access-control-allow-origin") === origin,
        "R2 must allow the configured client origin",
      );
      assert(
        preflight.headers.get("access-control-allow-methods")?.includes("PUT"),
        "R2 must allow PUT",
      );
      assert(
        preflight.headers
          .get("access-control-allow-headers")
          ?.toLowerCase()
          .includes("content-type"),
        "R2 must allow Content-Type",
      );
      await preflight.body?.cancel();
    }
    const put: Response = await request(upload.url, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: new Uint8Array(fixture),
    });
    assert(put.ok, `Signed staging PUT must succeed (HTTP ${put.status})`);
    await put.body?.cancel();
    const metadata = requireData(
      await storage.inspectStaging(upload.objectKey),
    );
    assert(
      metadata.byteSize === fixture.length,
      "Staging metadata size must match",
    );
    const downloaded: Buffer = requireData(
      await storage.readStaging(upload.objectKey),
    );
    assert(
      downloaded.equals(fixture),
      "Bounded staging read must match uploaded bytes",
    );
    const finalObjectKey: string = `avatars/final/${randomUUID()}.webp`;
    const final = requireData(
      await storage.putFinal(downloaded, finalObjectKey),
    );
    keys.push(final.objectKey);
    const read = requireData(await storage.signRead(final.objectKey));
    const readUrl: URL = new URL(read.url);
    assert(
      readUrl.searchParams.get("X-Amz-Expires") === "300",
      "GET must expire in five minutes",
    );
    for (const origin of origins) {
      const get: Response = await request(read.url, {
        headers: { Origin: origin },
      });
      assert(get.ok, `Signed final GET must succeed (HTTP ${get.status})`);
      assert(
        get.headers.get("cache-control") === "private, no-store",
        "Final reads must be private/no-store",
      );
      assert(
        get.headers.get("content-type")?.startsWith("image/webp"),
        "Final object must be served as WebP",
      );
      assert(
        get.headers.get("access-control-allow-origin") === origin,
        "R2 must allow final reads from each client origin",
      );
      assert(
        Buffer.from(await get.arrayBuffer()).equals(fixture),
        "Final object bytes must match",
      );
    }
    readUrl.search = "";
    const unsigned: Response = await request(readUrl.toString());
    assert(!unsigned.ok, "Unsigned final object access must fail");
    await unsigned.body?.cancel();
    const invalid = await storage.signRead(upload.objectKey);
    assert(!invalid.success, "Staging objects must not receive delivery URLs");
    const oversizedPut: Response = await request(upload.url, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: new Uint8Array(5_000_001),
    });
    assert(
      oversizedPut.ok,
      "Staging PUT can temporarily accept an oversized object",
    );
    await oversizedPut.body?.cancel();
    const oversized = await storage.readStaging(upload.objectKey);
    assert(
      !oversized.success && oversized.errors[0]?.status === 413,
      "Oversized staging objects must be rejected before download",
    );
    requireData(await storage.deleteObject(upload.objectKey));
    requireData(await storage.deleteObject(upload.objectKey));
    const missing = await storage.inspectStaging(upload.objectKey);
    assert(
      !missing.success && missing.errors[0]?.status === 404,
      "Deleted staging object must return an explicit 404",
    );
    requireData(await storage.deleteObject(final.objectKey));
    const removed: Response = await request(read.url);
    assert(
      removed.status === 404,
      "Deleted final object must no longer be readable",
    );
    await removed.body?.cancel();
    console.log(
      "Avatar storage smoke checks passed. No keys or signed URLs were printed.",
    );
  } finally {
    const failedCleanup: string[] = [];
    for (const key of keys) {
      const result = await storage.deleteObject(key);
      if (!result.success) {
        failedCleanup.push("A smoke-test object could not be deleted");
      }
    }
    if (failedCleanup.length > 0) {
      throw new Error(
        `${failedCleanup.length} smoke-test objects require cleanup; inspect the development bucket`,
      );
    }
  }
};

void run().catch((error: unknown): void => {
  console.error(
    error instanceof Error ? error.message : "Avatar storage smoke failed",
  );
  process.exitCode = 1;
});
