import { z } from "zod";

export const serverEnvSchema = z.object({
  MONGODB_DB_NAME: z
    .string()
    .min(1, { message: "MONGODB_DB_NAME is required" }),
  MONGODB_URI: z.string().min(1, { message: "MONGODB_URI is required" }),
  SIGNATURE_PRIVATE_KEY: z
    .string()
    .min(1, { message: "SIGNATURE_PRIVATE_KEY is required" }),
  SIGNATURE_PUBLIC_KEY: z
    .string()
    .min(1, { message: "SIGNATURE_PUBLIC_KEY is required" }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(1, { message: "BETTER_AUTH_SECRET is required" }),
  BETTER_AUTH_URL: z
    .string()
    .min(1, { message: "BETTER_AUTH_URL is required" }),
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1, { message: "GOOGLE_CLIENT_ID is required" }),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .min(1, { message: "GOOGLE_CLIENT_SECRET is required" }),
  GITHUB_CLIENT_ID: z
    .string()
    .min(1, { message: "GITHUB_CLIENT_ID is required" }),
  GITHUB_CLIENT_SECRET: z
    .string()
    .min(1, { message: "GITHUB_CLIENT_SECRET is required" }),
  CLIENT_ORIGINS: z.string().min(1, { message: "CLIENT_ORIGINS is required" }),
  EMAIL_FROM: z.string().min(1, { message: "EMAIL_FROM is required" }),
  RESEND_API_KEY: z.string().min(1, { message: "RESEND_API_KEY is required" }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ServerEnvVariable = keyof ServerEnv;
