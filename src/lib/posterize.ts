export type PosterRenderMode = 'grayscale' | 'color';

export interface PosterizeOptions {
  mode?: PosterRenderMode;
  levels?: number;
}

export function toGrayscaleValue(red: number, green: number, blue: number) {
  return Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
}

export function posterizeChannel(value: number, levels: number) {
  const safeLevels = Math.max(2, Math.round(levels));
  const normalized = clampByte(value) / 255;
  const quantized = Math.round(normalized * (safeLevels - 1));

  return Math.round((quantized / (safeLevels - 1)) * 255);
}

export function applyPosterizeToImageData(source: ImageData, options: PosterizeOptions = {}) {
  const mode = options.mode ?? 'grayscale';
  const levels = options.levels && options.levels >= 2 ? Math.round(options.levels) : undefined;
  const pixels = new Uint8ClampedArray(source.data);

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    if (mode === 'color') {
      if (!levels) {
        continue;
      }

      pixels[index] = posterizeChannel(red, levels);
      pixels[index + 1] = posterizeChannel(green, levels);
      pixels[index + 2] = posterizeChannel(blue, levels);
      continue;
    }

    const grayscale = toGrayscaleValue(red, green, blue);
    const output = levels ? posterizeChannel(grayscale, levels) : grayscale;
    pixels[index] = output;
    pixels[index + 1] = output;
    pixels[index + 2] = output;
  }

  return createImageData(pixels, source.width, source.height);
}

function createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData === 'function') {
    return new ImageData(Uint8ClampedArray.from(data), width, height);
  }

  return {
    data,
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

function clampByte(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, value));
}
