import type { AuthInstance } from "@/lib/auth/auth.ts";

type AuthSession = NonNullable<
  Awaited<ReturnType<AuthInstance["api"]["getSession"]>>
>;

declare module "fastify" {
  interface FastifyRequest {
    user: AuthSession["user"] | null;
    session: AuthSession["session"] | null;
  }
}
