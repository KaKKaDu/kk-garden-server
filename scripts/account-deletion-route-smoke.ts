import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { mock } from "node:test";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { SuccessDataAny } from "@kk-garden/shared/errors";
import { getAuthSecurityOptions } from "../src/lib/auth/auth-security-config.ts";
import { accountDeleteRoute } from "../src/routes/account/account-delete.route.ts";
import { getAccountDeletionService } from "../src/services/account-deletion/index.ts";
import { addMutationOriginGuard } from "../src/lib/routes/mutation-origin-guard.ts";

/* eslint-disable no-console */

const ownerId = "account-delete-route-smoke";
const trustedOrigin = "https://garden.example.test";
let sessionCreatedAt = new Date();
let authenticated = true;
const deletionCalls: string[] = [];
const deletionService = getAccountDeletionService();
mock.method(
  deletionService,
  "deleteAccount",
  async (userId: string): Promise<SuccessDataAny<{ deleted: true }>> => {
    deletionCalls.push(userId);
    return { success: true, data: { deleted: true } };
  },
);

const app: FastifyInstance = Fastify();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.decorateRequest("user", null);
app.decorateRequest("session", null);
app.addHook("preHandler", async (request): Promise<void> => {
  Object.assign(request, {
    user: authenticated ? { id: ownerId } : null,
    session: authenticated ? { createdAt: sessionCreatedAt } : null,
  });
});
addMutationOriginGuard(app, [trustedOrigin]);
accountDeleteRoute(app);

const sendDelete = (body: object, origin: string | null = trustedOrigin) =>
  app.inject({
    method: "DELETE",
    url: "/",
    headers: origin ? { origin } : {},
    payload: body,
  });

try {
  assert.equal(getAuthSecurityOptions(false).session?.expiresIn, 86_400);
  const invalidConfirmation = await sendDelete({ confirmation: "DELETE NOW" });
  assert.equal(invalidConfirmation.statusCode, 400);
  assert.equal(deletionCalls.length, 0);

  authenticated = false;
  const unauthenticated = await sendDelete({ confirmation: "DELETE" });
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(deletionCalls.length, 0);
  authenticated = true;
  sessionCreatedAt = new Date();
  const untrustedOrigin = await sendDelete(
    { confirmation: "DELETE" },
    "https://attacker.example.test",
  );
  assert.equal(untrustedOrigin.statusCode, 403);
  assert.equal(deletionCalls.length, 0);

  const missingOrigin = await sendDelete({ confirmation: "DELETE" }, null);
  assert.equal(missingOrigin.statusCode, 403);
  assert.equal(deletionCalls.length, 0);

  sessionCreatedAt = new Date(Date.now() - 10 * 60_000);
  const accepted = await sendDelete({ confirmation: "DELETE" });
  assert.equal(accepted.statusCode, 202);
  assert.deepEqual(deletionCalls, [ownerId]);
} finally {
  await app.close();
  mock.restoreAll();
}

console.log("Account deletion route smoke checks passed.");
