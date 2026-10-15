/* eslint-disable no-console */

const target: URL = new URL(
  process.argv[2] ?? "http://localhost:8090/api/auth/sign-in/social",
);
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
      headers: { "content-type": "application/json" },
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
