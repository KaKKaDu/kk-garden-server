import { z } from "zod";

export const avatarStorageEnvSchema = z
  .object({
    R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
    R2_ENDPOINT: z.url(),
    R2_BUCKET_NAME: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    R2_ACCESS_KEY_ID: z.string().trim().min(1),
    R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
  })
  .superRefine((value, context): void => {
    const endpoints: string[] = ["", ".eu", ".us", ".fedramp"].map(
      (jurisdiction: string): string =>
        `https://${value.R2_ACCOUNT_ID}${jurisdiction}.r2.cloudflarestorage.com`,
    );
    if (!endpoints.includes(value.R2_ENDPOINT)) {
      context.addIssue({
        code: "custom",
        path: ["R2_ENDPOINT"],
        message:
          "R2_ENDPOINT must be the account's HTTPS R2 S3 endpoint without a trailing slash",
      });
    }
  });

export const serverEnvSchema = z
  .object({
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
    BETTER_AUTH_SECRET: z.string().min(32, {
      message: "BETTER_AUTH_SECRET must contain at least 32 characters",
    }),
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
    CLIENT_ORIGINS: z
      .string()
      .min(1, { message: "CLIENT_ORIGINS is required" }),
    EMAIL_FROM: z.string().min(1, { message: "EMAIL_FROM is required" }),
    RESEND_API_KEY: z
      .string()
      .min(1, { message: "RESEND_API_KEY is required" }),
  })
  .and(avatarStorageEnvSchema);

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ServerEnvVariable = keyof ServerEnv;
