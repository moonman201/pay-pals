/**
 * Perceptual hashing (dHash) for reused-photo detection. Decodes JPEG and
 * PNG in pure JavaScript (jpeg-js, pngjs; no native code), shrinks the
 * picture to 9 by 8 grey cells and records whether each cell is brighter
 * than its right neighbour: 64 bits. Two photos of the same picture, even
 * re-saved, resized or slightly brightened, land within a few bits of each
 * other; different pictures land around 32 bits apart.
 */
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { ImageMediaType } from "./fetch-image";

export const HASH_BITS = 64;
/** Hamming distance at or under which two photos count as the same picture. */
export const NEAR_DUPLICATE_DISTANCE = 10;

interface GreyImage {
  width: number;
  height: number;
  grey: Float32Array;
}

function toGrey(width: number, height: number, rgba: Uint8Array | Buffer): GreyImage {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    grey[i] = 0.299 * rgba[o]! + 0.587 * rgba[o + 1]! + 0.114 * rgba[o + 2]!;
  }
  return { width, height, grey };
}

/** Decodes a JPEG or PNG to greyscale. Null for other formats or a broken file. */
export function decodeGrey(bytes: Buffer, mediaType: ImageMediaType): GreyImage | null {
  try {
    if (mediaType === "image/jpeg") {
      const decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256 });
      return toGrey(decoded.width, decoded.height, decoded.data);
    }
    if (mediaType === "image/png") {
      const decoded = PNG.sync.read(bytes);
      return toGrey(decoded.width, decoded.height, decoded.data);
    }
    return null;
  } catch {
    return null;
  }
}

/** Average grey level of each cell of a cols by rows grid laid over the image. */
function shrink(image: GreyImage, cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    const y0 = Math.floor((r * image.height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * image.height) / rows));
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor((c * image.width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * image.width) / cols));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          sum += image.grey[y * image.width + x]!;
          count += 1;
        }
      }
      out[r * cols + c] = sum / count;
    }
  }
  return out;
}

/** dHash as 16 hex characters. */
export function dHash(image: GreyImage): string {
  const cells = shrink(image, 9, 8);
  let bits = "";
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      bits += cells[r * 9 + c]! > cells[r * 9 + c + 1]! ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function imageHash(bytes: Buffer, mediaType: ImageMediaType): string | null {
  const image = decodeGrey(bytes, mediaType);
  return image && image.width > 0 && image.height > 0 ? dHash(image) : null;
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
