import sharp, { type Metadata, type Sharp } from "sharp";
import {
  AppError,
  handleError,
  type SuccessDataAny,
} from "@kk-garden/shared/errors";
import type { Nullable } from "@kk-garden/shared/types";
import { Logger } from "@lib/logs/logger.ts";
import { Variables } from "@lib/variables/variables.ts";
import type {
  AvatarImageContentType,
  NormalizedAvatarImage,
} from "@/services/avatar/avatar-image/types.ts";

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
    const hasJpegLength: boolean = bytes.length >= 3;
    const hasJpegStart: boolean = bytes[0] === 0xff && bytes[1] === 0xd8;
    const hasJpegEnd: boolean = bytes[2] === 0xff;
    const isJpeg: boolean = hasJpegLength && hasJpegStart && hasJpegEnd;
    if (isJpeg) {
      return "image/jpeg";
    }
    const hasPngLength: boolean = bytes.length >= 8;
    const hasPngSignature: boolean = bytes
      .subarray(0, 8)
      .equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const isPng: boolean = hasPngLength && hasPngSignature;
    if (isPng) {
      return "image/png";
    }
    const hasWebpLength: boolean = bytes.length >= 12;
    const hasRiffMarker: boolean = bytes.toString("ascii", 0, 4) === "RIFF";
    const hasWebpMarker: boolean = bytes.toString("ascii", 8, 12) === "WEBP";
    const isWebp: boolean = hasWebpLength && hasRiffMarker && hasWebpMarker;
    if (isWebp) {
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
      const isEndChunk: boolean = type === "IEND";
      const isEmptyEndChunk: boolean = size === 0;
      if (isEndChunk && isEmptyEndChunk) {
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
      const isAnimationChunk: boolean = type === "ANIM" || type === "ANMF";
      const isExtendedWebpHeader: boolean = type === "VP8X" && size > 0;
      const hasAnimationFlag: boolean =
        isExtendedWebpHeader && (bytes[offset + 8] & 0x02) !== 0;
      const isAnimated: boolean = isAnimationChunk || hasAnimationFlag;
      if (isAnimated) {
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
    let pipeline: Nullable<Sharp> = null;
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
      const width: number = metadata.width ?? 0;
      const height: number = metadata.height ?? 0;
      const missingDimensions: boolean = width === 0 || height === 0;
      const sideLimitExceeded: boolean =
        width > avatarImageVariables.get("max-input-side") ||
        height > avatarImageVariables.get("max-input-side");
      const pixelLimitExceeded: boolean =
        width * height > avatarImageVariables.get("max-input-pixels");
      const dimensionsInvalid: boolean = missingDimensions || sideLimitExceeded;
      if (dimensionsInvalid || pixelLimitExceeded) {
        throw this.invalidImage("Avatar image exceeds source dimension limits");
      }
      const hasMultiplePages: boolean = (metadata.pages ?? 1) !== 1;
      const hasFrameDelay: boolean = metadata.delay !== undefined;
      const hasLoopMetadata: boolean = metadata.loop !== undefined;
      const animationMetadata: boolean = hasMultiplePages || hasFrameDelay;
      if (animationMetadata || hasLoopMetadata) {
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
      const outputWidthExceeded: boolean =
        output.info.width > avatarImageVariables.get("max-output-side");
      const outputHeightExceeded: boolean =
        output.info.height > avatarImageVariables.get("max-output-side");
      const outputSizeExceeded: boolean =
        output.data.length > avatarImageVariables.get("max-input-bytes");
      const outputDimensionsExceeded: boolean =
        outputWidthExceeded || outputHeightExceeded;
      if (outputDimensionsExceeded || outputSizeExceeded) {
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
