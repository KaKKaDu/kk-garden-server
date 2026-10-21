import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import sharp, { type Metadata, type Sharp } from "sharp";
import type { DataObject, SuccessDataAny } from "@kk-garden/shared/errors";
import { getAvatarImageService } from "../src/services/avatar-image/index.ts";
import type {
  AvatarImageContentType,
  NormalizedAvatarImage,
} from "../src/services/avatar-image/types.ts";

/* eslint-disable no-console */

const requireData = <T extends DataObject>(result: SuccessDataAny<T>): T => {
  assert(
    result.success,
    result.success
      ? ""
      : result.errors.map((error): string => error.message).join("; "),
  );
  assert(result.data, "Successful normalization must return data");
  return result.data;
};

const image = (
  width: number,
  height: number,
  alpha: boolean = false,
): Sharp => {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: { r: 120, g: 60, b: 30, alpha: alpha ? 0.4 : 1 },
    },
  });
};

const checkOutput = async (
  bytes: Buffer,
  contentType: AvatarImageContentType,
  width: number,
  height: number,
): Promise<NormalizedAvatarImage> => {
  const result: NormalizedAvatarImage = requireData(
    await getAvatarImageService().normalize(bytes, contentType),
  );
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.width, width);
  assert.equal(result.height, height);
  const metadata: Metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.pages ?? 1, 1);
  return result;
};

const reject = async (
  bytes: Buffer,
  contentType: AvatarImageContentType,
  status: number = 400,
): Promise<void> => {
  const result = await getAvatarImageService().normalize(bytes, contentType);
  assert(!result.success, "Invalid image must not normalize");
  assert.equal(result.errors[0]?.status, status);
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const chunk: Buffer = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(chunk.subarray(4, chunk.length - 4)),
    chunk.length - 4,
  );
  return chunk;
};

const animatedPng = (png: Buffer): Buffer => {
  const chunks: Buffer[] = [png.subarray(0, 8)];
  const animationControl: Buffer = Buffer.alloc(8);
  animationControl.writeUInt32BE(2, 0);
  const frameControl = (sequence: number): Buffer => {
    const data: Buffer = Buffer.alloc(26);
    data.writeUInt32BE(sequence, 0);
    data.writeUInt32BE(16, 4);
    data.writeUInt32BE(16, 8);
    data.writeUInt16BE(1, 20);
    data.writeUInt16BE(10, 22);
    return pngChunk("fcTL", data);
  };
  const imageData: Buffer[] = [];
  let offset: number = 8;
  while (offset < png.length) {
    const length: number = png.readUInt32BE(offset);
    const type: string = png.toString("ascii", offset + 4, offset + 8);
    const chunk: Buffer = png.subarray(offset, offset + length + 12);
    if (type === "IHDR") {
      chunks.push(chunk, pngChunk("acTL", animationControl), frameControl(0));
    } else if (type === "IDAT") {
      chunks.push(chunk);
      imageData.push(png.subarray(offset + 8, offset + 8 + length));
    } else if (type !== "IEND") {
      chunks.push(chunk);
    }
    offset += length + 12;
  }
  const sequence: Buffer = Buffer.alloc(4);
  sequence.writeUInt32BE(2);
  chunks.push(
    frameControl(1),
    pngChunk("fdAT", Buffer.concat([sequence, ...imageData])),
    pngChunk("IEND", Buffer.alloc(0)),
  );
  return Buffer.concat(chunks);
};

const run = async (): Promise<void> => {
  const jpeg: Buffer = await image(1024, 512).jpeg().toBuffer();
  const png: Buffer = await image(120, 240, true).png().toBuffer();
  const webp: Buffer = await image(768, 1536).webp().toBuffer();
  await checkOutput(jpeg, "image/jpeg", 512, 256);
  const alphaOutput: NormalizedAvatarImage = await checkOutput(
    png,
    "image/png",
    120,
    240,
  );
  assert(
    (await sharp(alphaOutput.bytes).metadata()).hasAlpha,
    "Transparency must be preserved",
  );
  await checkOutput(webp, "image/webp", 256, 512);
  await checkOutput(await image(1, 1).png().toBuffer(), "image/png", 1, 1);
  await checkOutput(
    await image(512, 512).jpeg().toBuffer(),
    "image/jpeg",
    512,
    512,
  );

  const oriented: Buffer = await image(80, 40)
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  await checkOutput(oriented, "image/jpeg", 40, 80);
  const mirrored: Buffer = await image(80, 40)
    .composite([
      {
        input: await sharp({
          create: { width: 40, height: 40, channels: 3, background: "#0000ff" },
        })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .withMetadata({ orientation: 2 })
    .jpeg()
    .toBuffer();
  const flipped: NormalizedAvatarImage = await checkOutput(
    mirrored,
    "image/jpeg",
    80,
    40,
  );
  const sample: Buffer = await sharp(flipped.bytes)
    .extract({ left: 70, top: 20, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert(
    sample[2] > 200 && sample[0] < 30,
    "EXIF mirrored orientation must be applied",
  );

  await reject(Buffer.alloc(0), "image/png");
  await reject(Buffer.alloc(5_000_001), "image/png", 413);
  await reject(Buffer.from("not an image"), "image/png");
  await reject(
    Buffer.from(
      "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>",
    ),
    "image/png",
  );
  await reject(await image(16, 16).gif().toBuffer(), "image/png");
  await reject(jpeg, "image/png");
  await reject(png, "image/webp");
  await reject(webp, "image/jpeg");
  await reject(jpeg.subarray(0, Math.floor(jpeg.length / 2)), "image/jpeg");
  await reject(png.subarray(0, png.length - 8), "image/png");
  await reject(webp.subarray(0, webp.length - 8), "image/webp");
  const corruptPng: Buffer = Buffer.from(png);
  let chunkOffset: number = 8;
  while (
    corruptPng.toString("ascii", chunkOffset + 4, chunkOffset + 8) !== "IDAT"
  ) {
    chunkOffset += corruptPng.readUInt32BE(chunkOffset) + 12;
  }
  corruptPng.fill(
    0,
    chunkOffset + 8,
    chunkOffset + 8 + corruptPng.readUInt32BE(chunkOffset),
  );
  await reject(corruptPng, "image/png");

  const overSide: Buffer = await image(8193, 1).png().toBuffer();
  await reject(overSide, "image/png");
  const overPixels: Buffer = await image(5000, 4001).png().toBuffer();
  assert(
    overPixels.length < 5_000_000,
    "Pixel limit fixture must fit the byte bound",
  );
  await reject(overPixels, "image/png");
  await checkOutput(
    await image(5000, 4000).png().toBuffer(),
    "image/png",
    512,
    410,
  );
  await checkOutput(
    await image(8192, 16).png().toBuffer(),
    "image/png",
    512,
    1,
  );

  const apng: Buffer = animatedPng(await image(16, 16).png().toBuffer());
  await reject(apng, "image/png");
  const frameOne: Buffer = await image(16, 16, true).raw().toBuffer();
  const frameTwo: Buffer = await sharp({
    create: { width: 16, height: 16, channels: 4, background: "#00ff00" },
  })
    .raw()
    .toBuffer();
  const animation: Buffer = await sharp(Buffer.concat([frameOne, frameTwo]), {
    raw: {
      width: 16,
      height: 32,
      pageHeight: 16,
      channels: 4,
    },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal(
    (await sharp(animation).metadata()).pages,
    2,
    "Fixture must contain two WebP frames",
  );
  await reject(animation, "image/webp");

  const first = getAvatarImageService().normalize(jpeg, "image/jpeg");
  const second = getAvatarImageService().normalize(png, "image/png");
  const busy = await getAvatarImageService().normalize(webp, "image/webp");
  assert(
    !busy.success && busy.errors[0]?.status === 503,
    "Concurrency limit must be shared across service factories without queueing",
  );
  requireData(await first);
  requireData(await second);
  await checkOutput(jpeg, "image/jpeg", 512, 256);
  console.log("Avatar image smoke checks passed.");
};

void run().catch((error: unknown): void => {
  console.error(
    error instanceof Error ? error.message : "Avatar image smoke failed",
  );
  process.exitCode = 1;
});
