import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { createAuthInstance, type AuthInstance } from "@/lib/auth/auth.js";

const globalWithAuth = globalThis as unknown as {
  authInstancePromise: Promise<SuccessDataAny<AuthInstance>> | undefined;
};

// Cached as a promise since construction is async (needs the Mongo bridge).
export const getAuthService = (): Promise<SuccessDataAny<AuthInstance>> => {
  if (!globalWithAuth.authInstancePromise) {
    globalWithAuth.authInstancePromise = createAuthInstance();
  }
  return globalWithAuth.authInstancePromise;
};
