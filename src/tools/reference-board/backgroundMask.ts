type CanvasLikeResult = {
  toCanvas: () => HTMLCanvasElement | Promise<HTMLCanvasElement>;
};

type SegmentationItem = {
  label?: string;
  score?: number;
  mask?: CanvasLikeResult;
};

type SegmentationPipelineResult = CanvasLikeResult | SegmentationItem[];

type SegmentationPipeline = (input: string) => Promise<SegmentationPipelineResult>;

const SEGMENTATION_MODEL_CANDIDATES = [
  // SegFormer semantic segmentation works reliably with the image-segmentation
  // pipeline in browser Transformers.js without ORT shape mismatch warnings.
  // b0 is the smallest/fastest; b2 is a larger fallback.
  'Xenova/segformer-b0-finetuned-ade-512-512',
  'Xenova/segformer-b2-finetuned-ade-512-512',
] as const;

const SUPPRESSED_WARNING_SNIPPETS = [
  'dtype not specified for "model"',
  '`label_ids_to_fuse` unset',
] as const;

let segmenterPromise: Promise<SegmentationPipeline> | null = null;

function warningMessageFromArgs(args: unknown[]): string {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

function shouldSuppressWarningMessage(message: string): boolean {
  return SUPPRESSED_WARNING_SNIPPETS.some((snippet) => message.includes(snippet));
}

async function withSuppressedKnownWarnings<T>(operation: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn;

  console.warn = (...args: unknown[]) => {
    const message = warningMessageFromArgs(args);
    if (shouldSuppressWarningMessage(message)) {
      return;
    }
    originalWarn(...args);
  };

  try {
    return await operation();
  } finally {
    console.warn = originalWarn;
  }
}

const BACKGROUND_LABELS = new Set([
  'background',
  'wall',
  'sky',
  'floor',
  'road',
  'field',
  'mountain',
  'sea',
]);

const PREFERRED_SUBJECT_LABELS = new Set([
  'person',
  'face',
  'head',
  'human',
  'portrait',
  'cat',
  'dog',
  'bird',
  'horse',
  'deer',
]);

function normalizeLabel(label: string | undefined): string {
  return (label ?? '').trim().toLowerCase();
}

function isBackgroundLabel(label: string | undefined): boolean {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  if (BACKGROUND_LABELS.has(normalized)) return true;
  return normalized.includes('background');
}

function isPreferredSubjectLabel(label: string | undefined): boolean {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  if (PREFERRED_SUBJECT_LABELS.has(normalized)) return true;
  for (const preferred of PREFERRED_SUBJECT_LABELS) {
    if (normalized.includes(preferred)) return true;
  }
  return false;
}

export function pickSegmentationItemsForMask(items: SegmentationItem[]): SegmentationItem[] {
  const scored = [...items].sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  if (scored.length === 0) return [];

  const nonBackground = scored.filter((item) => !isBackgroundLabel(item.label));
  const pool = nonBackground.length > 0 ? nonBackground : scored;
  const preferred = pool.filter((item) => isPreferredSubjectLabel(item.label));
  const basePool = preferred.length > 0 ? preferred : pool;

  const primary = basePool[0];
  const primaryScore = primary?.score ?? 0;
  const nearby = basePool.filter((item) => {
    const score = item.score ?? 0;
    return score >= Math.max(0, primaryScore - 0.05);
  });

  // Keep a small focused set so we retain a single subject and avoid masking the full scene.
  return nearby.slice(0, 3);
}

async function getBackgroundRemovalPipeline(): Promise<SegmentationPipeline> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      let lastError: unknown = null;
      for (const modelName of SEGMENTATION_MODEL_CANDIDATES) {
        try {
          // Do not force a dtype here: some segmentation repos do not publish every
          // quantized variant (e.g. q4f16), which can cause avoidable 404s.
          const segmenter = await withSuppressedKnownWarnings(
            () => pipeline('image-segmentation', modelName),
          );
          return segmenter as SegmentationPipeline;
        } catch (error) {
          lastError = error;
        }
      }

      const reason = lastError instanceof Error ? lastError.message : 'Unknown pipeline load error';
      throw new Error(`Unable to initialize image segmentation pipeline for mask detection: ${reason}`);
    })();
  }

  return segmenterPromise;
}

async function toCanvas(node: CanvasLikeResult | undefined): Promise<HTMLCanvasElement | null> {
  if (!node || typeof node.toCanvas !== 'function') {
    return null;
  }
  return Promise.resolve(node.toCanvas());
}

async function mergeMasks(items: SegmentationItem[]): Promise<HTMLCanvasElement> {
  const candidates = pickSegmentationItemsForMask(items);

  let outputCanvas: HTMLCanvasElement | null = null;
  let outputContext: CanvasRenderingContext2D | null = null;
  let outputData: ImageData | null = null;

  for (const item of candidates) {
    const sourceCanvas = await toCanvas(item.mask);
    if (!sourceCanvas) continue;

    if (!outputCanvas) {
      outputCanvas = document.createElement('canvas');
      outputCanvas.width = sourceCanvas.width;
      outputCanvas.height = sourceCanvas.height;
      outputContext = outputCanvas.getContext('2d');
      if (!outputContext) break;
      outputData = outputContext.createImageData(outputCanvas.width, outputCanvas.height);
    }

    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext || !outputData) continue;
    const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    for (let index = 0; index < sourceData.data.length; index += 4) {
      const red = sourceData.data[index];
      const green = sourceData.data[index + 1];
      const blue = sourceData.data[index + 2];
      const alpha = sourceData.data[index + 3];
      const luminance = Math.round((red + green + blue) / 3);
      const maskValue = Math.round((luminance / 255) * alpha);

      const current = outputData.data[index];
      if (maskValue <= current) continue;

      outputData.data[index] = maskValue;
      outputData.data[index + 1] = maskValue;
      outputData.data[index + 2] = maskValue;
      outputData.data[index + 3] = 255;
    }
  }

  if (!outputCanvas || !outputContext || !outputData) {
    throw new Error('Unable to generate a mask from segmentation output');
  }

  outputContext.putImageData(outputData, 0, 0);
  return outputCanvas;
}

function toGrayscaleMaskDataUrl(maskCanvas: HTMLCanvasElement): string {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = maskCanvas.width;
  outputCanvas.height = maskCanvas.height;
  const outputContext = outputCanvas.getContext('2d')!;
  outputContext.drawImage(maskCanvas, 0, 0);

  const imageData = outputContext.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const alpha = imageData.data[index + 3];
    const luminance = Math.round((red + green + blue) / 3);
    const maskValue = Math.round((luminance / 255) * alpha);

    imageData.data[index] = maskValue;
    imageData.data[index + 1] = maskValue;
    imageData.data[index + 2] = maskValue;
    imageData.data[index + 3] = 255;
  }

  outputContext.putImageData(imageData, 0, 0);
  return outputCanvas.toDataURL('image/png');
}

export async function generateMaskDataUrlFromImage(imageDataUrl: string): Promise<string> {
  const segmenter = await getBackgroundRemovalPipeline();
  const result = await withSuppressedKnownWarnings(() => segmenter(imageDataUrl));

  let maskCanvas: HTMLCanvasElement;
  if (Array.isArray(result)) {
    maskCanvas = await mergeMasks(result);
  } else {
    maskCanvas = await Promise.resolve(result.toCanvas());
  }

  return toGrayscaleMaskDataUrl(maskCanvas);
}
