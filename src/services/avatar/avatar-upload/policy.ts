import { Variables } from "@lib/variables/variables.ts";

export const avatarUploadPolicy = Variables.of({
  "finalize-max-attempts": 3,
  "finalize-claim-lease-ms": 300_000,
  "finalize-retry-base-ms": 15_000,
  "finalize-retry-max-ms": 60_000,
} as const);
