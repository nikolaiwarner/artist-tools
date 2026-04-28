import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pipelineMock = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: pipelineMock,
}));

beforeEach(() => {
  pipelineMock.mockReset();
  vi.resetModules();

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const imageData = {
      data: new Uint8ClampedArray(16).fill(255),
      width: 2,
      height: 2,
      colorSpace: 'srgb',
    } as ImageData;

    return {
      createImageData: () => imageData,
      getImageData: () => imageData,
      putImageData: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D;
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,test-mask');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backgroundMask', () => {
  it('falls back to another segmentation model when the primary is unsupported', async () => {
    const segmenter = vi.fn().mockResolvedValue({
      toCanvas: () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        return canvas;
      },
    });

    pipelineMock
      .mockRejectedValueOnce(new Error('Unsupported model type'))
      .mockResolvedValueOnce(segmenter);

    const { generateMaskDataUrlFromImage } = await import('./backgroundMask');
    const result = await generateMaskDataUrlFromImage('data:image/png;base64,abc');

    expect(result.startsWith('data:image/png')).toBe(true);
    expect(pipelineMock).toHaveBeenNthCalledWith(
      1,
      'image-segmentation',
      'Xenova/segformer-b0-finetuned-ade-512-512',
    );
    expect(pipelineMock).toHaveBeenNthCalledWith(
      2,
      'image-segmentation',
      'Xenova/segformer-b2-finetuned-ade-512-512',
    );
  });

  it('prefers a focused subject subset when choosing segmentation items', async () => {
    const { pickSegmentationItemsForMask } = await import('./backgroundMask');

    const selected = pickSegmentationItemsForMask([
      { label: 'background', score: 0.99 },
      { label: 'person', score: 0.91 },
      { label: 'person accessory', score: 0.89 },
      { label: 'chair', score: 0.87 },
      { label: 'wall', score: 0.8 },
    ]);

    expect(selected).toEqual([
      { label: 'person', score: 0.91 },
      { label: 'person accessory', score: 0.89 },
    ]);
  });
});
