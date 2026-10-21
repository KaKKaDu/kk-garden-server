import sharp, { type Metadata, type Sharp } from "sharp";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import { Logger } from "@lib/logs/logger.ts";
import { Variables } from "@lib/variables/variables.ts";
import type {
  AvatarImageContentType,
  NormalizedAvatarImage,
} from "@/services/avatar-image/types.ts";

const avatarImageVariables = Variables.of({
  "max-input-bytes": 5_000_000,
  "max-input-pixels": 20_000_000,
  "max-input-channels": 4,
  "max-input-side": 8192,
  "max-output-side": 512,
  "max-concurrent-images": 2,
  "processing-timeout-seconds": 5,
  "webp-quality": 80,
  "webp-alpha-quality": 100,
  "webp-effort": 4,
  "native-threads-per-image": 1,
} as const);

sharp.cache(false);
sharp.concurrency(avatarImageVariables.get("native-threads-per-image"));

let activeImages: number = 0;

export class AvatarImageService {
  private invalidImage(message: string): AppError {
    return new AppError({ status: 400, message });
  }

  private detectContentType(bytes: Buffer): AvatarImageContentType {
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      return "image/jpeg";
    }
    if (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    ) {
      return "image/png";
    }
    if (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "image/webp";
    }
    throw this.invalidImage(
      "Only static JPEG, PNG, and WebP images are accepted",
    );
  }

  private rejectPngAnimation(bytes: Buffer): void {
    let offset: number = 8;
    while (offset + 12 <= bytes.length) {
      const size: number = bytes.readUInt32BE(offset);
      const type: string = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset + 12 + size > bytes.length) {
        throw this.invalidImage("Malformed PNG image");
      }
      if (["acTL", "fcTL", "fdAT"].includes(type)) {
        throw this.invalidImage("Animated PNG images are not accepted");
      }
      offset += 12 + size;
      if (type === "IEND" && size === 0 && offset === bytes.length) {
        return;
      }
    }
    throw this.invalidImage("Malformed PNG image");
  }

  private rejectWebpAnimation(bytes: Buffer): void {
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) {
      throw this.invalidImage("Malformed WebP image");
    }
    let offset: number = 12;
    while (offset + 8 <= bytes.length) {
      const type: string = bytes.toString("ascii", offset, offset + 4);
      const size: number = bytes.readUInt32LE(offset + 4);
      const end: number = offset + 8 + size + (size % 2);
      if (end > bytes.length) {
        throw this.invalidImage("Malformed WebP image");
      }
      if (
        type === "ANIM" ||
        type === "ANMF" ||
        (type === "VP8X" && size > 0 && (bytes[offset + 8] & 0x02) !== 0)
      ) {
        throw this.invalidImage("Animated WebP images are not accepted");
      }
      offset = end;
    }
    if (offset !== bytes.length) {
      throw this.invalidImage("Malformed WebP image");
    }
  }

  async normalize(
    input: Buffer,
    declaredContentType: AvatarImageContentType,
  ): Promise<SuccessDataAny<NormalizedAvatarImage>> {
    let acquired: boolean = false;
    let pipeline: Sharp | undefined;
    let result: SuccessDataAny<NormalizedAvatarImage>;
    try {
      if (input.length < 1) {
        throw this.invalidImage("Avatar image is empty");
      }
      if (input.length > avatarImageVariables.get("max-input-bytes")) {
        throw new AppError({
          status: 413,
          message: "Avatar image exceeds 5,000,000 bytes",
        });
      }
      if (activeImages >= avatarImageVariables.get("max-concurrent-images")) {
        throw new AppError({
          status: 503,
          message: "Avatar image processing is busy; retry later",
        });
      }
      activeImages++;
      acquired = true;
      const bytes: Buffer = Buffer.from(input);
      const contentType: AvatarImageContentType = this.detectContentType(bytes);
      if (contentType !== declaredContentType) {
        throw this.invalidImage(
          "Avatar content does not match its declared media type",
        );
      }
      if (contentType === "image/png") {
        this.rejectPngAnimation(bytes);
      } else if (contentType === "image/webp") {
        this.rejectWebpAnimation(bytes);
      }

      pipeline = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: avatarImageVariables.get("max-input-pixels"),
        limitInputChannels: avatarImageVariables.get("max-input-channels"),
        unlimited: false,
        sequentialRead: true,
      }).timeout({
        seconds: avatarImageVariables.get("processing-timeout-seconds"),
      });
      const metadata: Metadata = await pipeline.metadata();
      const expectedFormat: string = contentType.slice("image/".length);
      if (metadata.format !== expectedFormat) {
        throw this.invalidImage(
          "Avatar image format is unsupported or spoofed",
        );
      }
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width > avatarImageVariables.get("max-input-side") ||
        metadata.height > avatarImageVariables.get("max-input-side") ||
        metadata.width * metadata.height >
          avatarImageVariables.get("max-input-pixels")
      ) {
        throw this.invalidImage("Avatar image exceeds source dimension limits");
      }
      if (
        (metadata.pages ?? 1) !== 1 ||
        metadata.delay !== undefined ||
        metadata.loop !== undefined
      ) {
        throw this.invalidImage("Animated images are not accepted");
      }
      const output = await pipeline
        .autoOrient()
        .resize({
          width: avatarImageVariables.get("max-output-side"),
          height: avatarImageVariables.get("max-output-side"),
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColourspace("srgb")
        .webp({
          quality: avatarImageVariables.get("webp-quality"),
          alphaQuality: avatarImageVariables.get("webp-alpha-quality"),
          effort: avatarImageVariables.get("webp-effort"),
        })
        .toBuffer({ resolveWithObject: true });
      if (
        output.info.width > avatarImageVariables.get("max-output-side") ||
        output.info.height > avatarImageVariables.get("max-output-side") ||
        output.data.length > avatarImageVariables.get("max-input-bytes")
      ) {
        throw new AppError({
          status: 500,
          message: "Avatar normalization exceeded output limits",
        });
      }
      result = {
        success: true,
        data: {
          bytes: output.data,
          contentType: "image/webp",
          width: output.info.width,
          height: output.info.height,
        },
      };
    } catch (error: unknown) {
      result = handleError<NormalizedAvatarImage>(
        error instanceof AppError
          ? error
          : this.invalidImage(
              "Avatar image is malformed, unsupported, or exceeded processing limits",
            ),
      );
    } finally {
      pipeline?.destroy();
      if (acquired) {
        activeImages--;
      }
    }
    Logger.report("AvatarImageService.normalize", result);
    return result;
  }
}
