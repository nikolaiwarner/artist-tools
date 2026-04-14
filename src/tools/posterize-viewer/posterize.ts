export type PosterStage = {
  key: string;
  label: string;
  levels?: number;
};

export type PosterRenderMode = 'grayscale' | 'color';

const STAGES: PosterStage[] = [
  { key: 'grayscale', label: 'Original' },
  { key: 'poster-2', label: '2 Values', levels: 2 },
  { key: 'poster-3', label: '3 Values', levels: 3 },
  { key: 'poster-4', label: '4 Values', levels: 4 },
  { key: 'poster-5', label: '5 Values', levels: 5 }
];

export function buildPosterStages() {
  return STAGES;
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

export function applyPosterStageToImageData(source: ImageData, stage: PosterStage, mode: PosterRenderMode = 'grayscale') {
  const pixels = new Uint8ClampedArray(source.data);

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const grayscale = toGrayscaleValue(red, green, blue);

    if (!stage.levels || stage.key === 'grayscale') {
      if (mode === 'color') {
        continue;
      }

      pixels[index] = grayscale;
      pixels[index + 1] = grayscale;
      pixels[index + 2] = grayscale;
      pixels[index + 3] = pixels[index + 3];
      continue;
    }

    if (mode === 'color') {
      pixels[index] = posterizeChannel(red, stage.levels);
      pixels[index + 1] = posterizeChannel(green, stage.levels);
      pixels[index + 2] = posterizeChannel(blue, stage.levels);
      continue;
    }

    const output = posterizeChannel(grayscale, stage.levels);
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
    colorSpace: 'srgb'
  } as ImageData;
}

function clampByte(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, value));
}
