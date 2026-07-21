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
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ServerEnvVariable = keyof ServerEnv;
