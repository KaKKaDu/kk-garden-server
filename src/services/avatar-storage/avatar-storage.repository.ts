import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AppError,
  handleError,
  type DataObject,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import { ProfileAvatarUploadRequestSchema } from "@kk-garden/shared/schemas";
import type { EnvService } from "@/services/env/env.service.ts";
import { avatarStorageEnvSchema } from "@/../env-vars/env.schema.ts";
import { Logger } from "@lib/logs/logger.ts";
import type {
  AvatarContentType,
  AvatarStorageConfig,
  AvatarStorageMetadata,
  AvatarStorageObject,
  AvatarStorageSignedUrl,
  AvatarStorageUpload,
} from "@/services/avatar-storage/types.ts";

import { Variables } from "@lib/variables/variables.ts";

const avatarStorageVariables = Variables.of({
  "staging-prefix": "avatars/staging/",
  "final-prefix": "avatars/final/",
  "upload-expiry-seconds": 900,
  "read-expiry-seconds": 300,
  "max-avatar-bytes": 5_000_000,
  "object-cache-control": "private, no-store",
  "object-id-pattern":
    "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
  "max-attempts": 3,
  "connection-timeout-ms": 5_000,
  "request-timeout-ms": 30_000,
} as const);

export class AvatarStorageRepository {
  private client?: S3Client;
  private config?: AvatarStorageConfig;

  constructor(private readonly envService: EnvService) {}

  private getConnection(): { client: S3Client; config: AvatarStorageConfig } {
    if (!this.client || !this.config) {
      const result = avatarStorageEnvSchema.safeParse({
        R2_ACCOUNT_ID: this.envService.getRawEnvValue("R2_ACCOUNT_ID"),
        R2_ENDPOINT: this.envService.getRawEnvValue("R2_ENDPOINT"),
        R2_BUCKET_NAME: this.envService.getRawEnvValue("R2_BUCKET_NAME"),
        R2_ACCESS_KEY_ID: this.envService.getRawEnvValue("R2_ACCESS_KEY_ID"),
        R2_SECRET_ACCESS_KEY: this.envService.getRawEnvValue(
          "R2_SECRET_ACCESS_KEY",
        ),
      });
      if (!result.success) {
        throw new AppError({
          status: 500,
          message: "Avatar storage configuration is missing or invalid",
        });
      }
      this.config = result.data;
      this.client = new S3Client({
        endpoint: this.config.R2_ENDPOINT,
        region: "auto",
        credentials: {
          accessKeyId: this.config.R2_ACCESS_KEY_ID,
          secretAccessKey: this.config.R2_SECRET_ACCESS_KEY,
        },
        maxAttempts: avatarStorageVariables.get("max-attempts"),
        requestHandler: {
          connectionTimeout: avatarStorageVariables.get(
            "connection-timeout-ms",
          ),
          requestTimeout: avatarStorageVariables.get("request-timeout-ms"),
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    }
    return { client: this.client, config: this.config };
  }

  private validateObjectKey(
    objectKey: string,
    kind?: "staging" | "final",
  ): void {
    const prefix: string = kind
      ? `avatars/${kind}/`
      : "avatars/(staging|final)/";
    const suffix: string = kind === "staging" ? "" : "(\\.webp)?";
    if (
      !new RegExp(
        `^${prefix}${avatarStorageVariables.get("object-id-pattern")}${suffix}$`,
      ).test(objectKey) ||
      (objectKey.startsWith(avatarStorageVariables.get("final-prefix")) &&
        !objectKey.endsWith(".webp")) ||
      (objectKey.startsWith(avatarStorageVariables.get("staging-prefix")) &&
        objectKey.endsWith(".webp"))
    ) {
      throw new AppError({
        status: 400,
        message: "Invalid server-managed avatar object reference",
      });
    }
  }

  private async execute<T extends DataObject>(
    operation: string,
    callback: (client: S3Client, config: AvatarStorageConfig) => Promise<T>,
  ): Promise<SuccessDataAny<T>> {
    let result: SuccessDataAny<T>;
    try {
      const { client, config } = this.getConnection();
      result = { success: true, data: await callback(client, config) };
    } catch (error: unknown) {
      if (error instanceof AppError) {
        result = handleError<T>(error);
      } else {
        const notFound: boolean =
          error instanceof S3ServiceException &&
          error.$metadata.httpStatusCode === 404;
        result = handleError<T>(
          new AppError({
            status: notFound ? 404 : 502,
            message: notFound
              ? "Avatar storage object was not found"
              : "Avatar storage operation failed",
          }),
        );
      }
    }
    Logger.report(`AvatarStorageRepository.${operation}`, result);
    return result;
  }

  async issueUpload(
    contentType: AvatarContentType,
    objectKey: string = `${avatarStorageVariables.get("staging-prefix")}${randomUUID()}`,
    issuedAt: number = Date.now(),
  ): Promise<SuccessDataAny<AvatarStorageUpload>> {
    return this.execute(
      "issueUpload",
      async (
        client: S3Client,
        config: AvatarStorageConfig,
      ): Promise<AvatarStorageUpload> => {
        const validType: AvatarContentType =
          ProfileAvatarUploadRequestSchema.shape.contentType.parse(contentType);
        this.validateObjectKey(objectKey, "staging");
        const url: string = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: config.R2_BUCKET_NAME,
            Key: objectKey,
            ContentType: validType,
          }),
          {
            expiresIn: avatarStorageVariables.get("upload-expiry-seconds"),
            signingDate: new Date(issuedAt),
            signableHeaders: new Set(["content-type"]),
          },
        );
        return {
          objectKey,
          url,
          expiresAt: new Date(
            issuedAt +
              avatarStorageVariables.get("upload-expiry-seconds") * 1_000,
          ).toISOString(),
        };
      },
    );
  }

  async signRead(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageSignedUrl>> {
    return this.execute(
      "signRead",
      async (
        client: S3Client,
        config: AvatarStorageConfig,
      ): Promise<AvatarStorageSignedUrl> => {
        this.validateObjectKey(objectKey, "final");
        const issuedAt: number = Date.now();
        const url: string = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: config.R2_BUCKET_NAME,
            Key: objectKey,
            ResponseCacheControl: avatarStorageVariables.get(
              "object-cache-control",
            ),
            ResponseContentType: "image/webp",
          }),
          {
            expiresIn: avatarStorageVariables.get("read-expiry-seconds"),
            signingDate: new Date(issuedAt),
          },
        );
        return {
          url,
          expiresAt: new Date(
            issuedAt +
              avatarStorageVariables.get("read-expiry-seconds") * 1_000,
          ).toISOString(),
        };
      },
    );
  }

  async inspectStaging(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageMetadata>> {
    return this.execute(
      "inspectStaging",
      async (
        client: S3Client,
        config: AvatarStorageConfig,
      ): Promise<AvatarStorageMetadata> => {
        this.validateObjectKey(objectKey, "staging");
        const metadata = await client.send(
          new HeadObjectCommand({
            Bucket: config.R2_BUCKET_NAME,
            Key: objectKey,
          }),
        );
        if (metadata.ContentLength === undefined) {
          throw new AppError({
            status: 502,
            message: "Avatar storage size is missing",
          });
        }
        return {
          byteSize: metadata.ContentLength,
          contentType: metadata.ContentType,
          etag: metadata.ETag,
        };
      },
    );
  }

  async readStaging(objectKey: string): Promise<SuccessDataAny<Buffer>> {
    return this.execute(
      "readStaging",
      async (
        client: S3Client,
        config: AvatarStorageConfig,
      ): Promise<Buffer> => {
        this.validateObjectKey(objectKey, "staging");
        const controller: AbortController = new AbortController();
        const timeout = setTimeout(
          (): void => controller.abort(),
          avatarStorageVariables.get("request-timeout-ms"),
        );
        try {
          const head = await client.send(
            new HeadObjectCommand({
              Bucket: config.R2_BUCKET_NAME,
              Key: objectKey,
            }),
            { abortSignal: controller.signal },
          );
          if (head.ContentLength === undefined || !head.ETag) {
            throw new AppError({
              status: 502,
              message: "Avatar storage metadata is incomplete",
            });
          }
          if (
            head.ContentLength < 1 ||
            head.ContentLength > avatarStorageVariables.get("max-avatar-bytes")
          ) {
            throw new AppError({
              status: 413,
              message:
                "Avatar staging size must be between 1 and 5,000,000 bytes",
            });
          }
          const response = await client.send(
            new GetObjectCommand({
              Bucket: config.R2_BUCKET_NAME,
              Key: objectKey,
              IfMatch: head.ETag,
            }),
            { abortSignal: controller.signal },
          );
          if (!(response.Body instanceof Readable)) {
            throw new AppError({
              status: 502,
              message: "Avatar storage returned no readable body",
            });
          }
          const body: Readable = response.Body;
          const chunks: Buffer[] = [];
          let byteSize: number = 0;
          try {
            for await (const chunk of body) {
              if (!(chunk instanceof Uint8Array)) {
                throw new AppError({
                  status: 502,
                  message: "Avatar storage returned an invalid chunk",
                });
              }
              byteSize += chunk.byteLength;
              if (byteSize > avatarStorageVariables.get("max-avatar-bytes")) {
                throw new AppError({
                  status: 413,
                  message: "Avatar staging download exceeds 5,000,000 bytes",
                });
              }
              chunks.push(Buffer.from(chunk));
            }
            if (byteSize !== head.ContentLength) {
              throw new AppError({
                status: 502,
                message: "Avatar staging download size changed",
              });
            }
            return Buffer.concat(chunks, byteSize);
          } finally {
            body.destroy();
          }
        } finally {
          clearTimeout(timeout);
          controller.abort();
        }
      },
    );
  }

  async putFinal(bytes: Buffer): Promise<SuccessDataAny<AvatarStorageObject>> {
    return this.execute(
      "putFinal",
      async (
        client: S3Client,
        config: AvatarStorageConfig,
      ): Promise<AvatarStorageObject> => {
        if (
          bytes.length < 1 ||
          bytes.length > avatarStorageVariables.get("max-avatar-bytes")
        ) {
          throw new AppError({
            status: 413,
            message: "Final avatar size must be between 1 and 5,000,000 bytes",
          });
        }
        const objectKey: string = `${avatarStorageVariables.get("final-prefix")}${randomUUID()}.webp`;
        await client.send(
          new PutObjectCommand({
            Bucket: config.R2_BUCKET_NAME,
            Key: objectKey,
            Body: bytes,
            ContentType: "image/webp",
            CacheControl: avatarStorageVariables.get("object-cache-control"),
            IfNoneMatch: "*",
          }),
        );
        return { objectKey };
      },
    );
  }

  async deleteObject(
    objectKey: string,
  ): Promise<SuccessDataAny<AvatarStorageObject>> {
    return this.execute(
      "deleteObject",
      async (
        client: S3Client,
        config: AvatarStorageConfig,
      ): Promise<AvatarStorageObject> => {
        this.validateObjectKey(objectKey);
        try {
          await client.send(
            new DeleteObjectCommand({
              Bucket: config.R2_BUCKET_NAME,
              Key: objectKey,
            }),
          );
        } catch (error: unknown) {
          if (
            !(
              error instanceof S3ServiceException &&
              error.$metadata.httpStatusCode === 404
            )
          ) {
            throw error;
          }
        }
        return { objectKey };
      },
    );
  }
}
