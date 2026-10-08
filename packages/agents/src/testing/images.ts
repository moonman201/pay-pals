/**
 * Synthetic PNG images for tests: a textured picture, the same picture
 * re-saved brighter and larger (a near duplicate), and a different picture.
 */
import { PNG } from "pngjs";

type Pixel = (x: number, y: number) => number;

function render(width: number, height: number, grey: Pixel): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = Math.max(0, Math.min(255, Math.round(grey(x, y))));
      const i = (y * width + x) * 4;
      png.data[i] = v;
      png.data[i + 1] = v;
      png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const textureA = (x: number, y: number) => 128 + 110 * Math.sin(x / 6) * Math.cos(y / 9) + 10 * Math.sin((x + y) / 3);
const textureC = (x: number, y: number) => 128 + 110 * Math.sin(y / 4) * Math.cos(x / 13) - 10 * Math.cos((x - y) / 5);

/** 96 by 72 picture. */
export const pictureA = (): Buffer => render(96, 72, textureA);
/** The same picture at 1.5 times the size and 18 levels brighter. */
export const pictureANearDuplicate = (): Buffer => render(144, 108, (x, y) => textureA(x / 1.5, y / 1.5) + 18);
/** A different picture, same size as A. */
export const pictureC = (): Buffer => render(96, 72, textureC);

export const asFetched = (bytes: Buffer) => ({ data: bytes.toString("base64"), mediaType: "image/png" as const });
