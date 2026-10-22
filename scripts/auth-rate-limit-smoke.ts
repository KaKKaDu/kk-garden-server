import dotenv from "dotenv";
import { parseClientOrigins } from "../src/lib/auth/auth-origins.ts";

/* eslint-disable no-console */

dotenv.config({ quiet: true });

const target: URL = new URL(
  process.argv[2] ?? "http://localhost:8090/api/auth/sign-in/social",
);
const rawOrigins: string | undefined = process.env.CLIENT_ORIGINS;
if (!rawOrigins) {
  console.error("CLIENT_ORIGINS must be configured for this smoke test.");
  process.exit(1);
}
const trustedOrigin: string | undefined = parseClientOrigins(
  rawOrigins,
  process.env.NODE_ENV === "production",
)[0];
if (!trustedOrigin) {
  console.error("No trusted origin is configured for this smoke test.");
  process.exit(1);
}
const isLoopback: boolean = ["localhost", "127.0.0.1", "[::1]"].includes(
  target.hostname,
);

if (target.protocol !== "http:" || !isLoopback) {
  console.error(
    "This smoke test only sends malformed requests to a local HTTP server.",
  );
  process.exit(1);
}

let rateLimited: boolean = false;

for (let attempt: number = 0; attempt < 11; attempt += 1) {
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: trustedOrigin,
      },
      body: "{}",
    });
  } catch {
    console.error(
      `Could not connect to ${target.origin}; start the local server and try again.`,
    );
    process.exit(1);
  }

  if (response.status === 429) {
    rateLimited = true;
    break;
  }
}

if (!rateLimited) {
  console.error("The endpoint did not return HTTP 429 after 11 requests.");
  process.exit(1);
}

console.log(
  "Auth rate-limit smoke passed: the local endpoint returned HTTP 429.",
);
