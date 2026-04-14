import { describe, expect, it } from 'vitest';

import {
  applyPosterStageToImageData,
  buildPosterStages,
  posterizeChannel,
  toGrayscaleValue
} from './posterize';

describe('posterize utilities', () => {
  it('converts rgb values to grayscale luminance', () => {
    expect(toGrayscaleValue(255, 0, 0)).toBe(54);
    expect(toGrayscaleValue(0, 255, 0)).toBe(182);
    expect(toGrayscaleValue(0, 0, 255)).toBe(18);
  });

  it('quantizes a channel into a fixed number of levels', () => {
    expect(posterizeChannel(50, 2)).toBe(0);
    expect(posterizeChannel(200, 2)).toBe(255);
    expect(posterizeChannel(120, 5)).toBe(128);
  });

  it('builds grayscale and posterized stage definitions', () => {
    expect(buildPosterStages()).toEqual([
      { key: 'grayscale', label: 'Original' },
      { key: 'poster-2', label: '2 Values', levels: 2 },
      { key: 'poster-3', label: '3 Values', levels: 3 },
      { key: 'poster-4', label: '4 Values', levels: 4 },
      { key: 'poster-5', label: '5 Values', levels: 5 }
    ]);
  });

  it('applies grayscale and posterized stages to image data', () => {
    const input = {
      data: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb'
    } as ImageData;

    const fullColor = applyPosterStageToImageData(input, { key: 'grayscale', label: 'Original' }, 'color');
    expect(Array.from(fullColor.data)).toEqual([255, 0, 0, 255]);

    const grayscale = applyPosterStageToImageData(input, { key: 'grayscale', label: 'Original' });
    expect(Array.from(grayscale.data)).toEqual([54, 54, 54, 255]);

    const posterized = applyPosterStageToImageData(input, {
      key: 'poster-3',
      label: '3 Values',
      levels: 3
    });
    expect(Array.from(posterized.data)).toEqual([0, 0, 0, 255]);

    const colorPosterized = applyPosterStageToImageData(
      {
        data: new Uint8ClampedArray([120, 200, 10, 255]),
        width: 1,
        height: 1,
        colorSpace: 'srgb'
      } as ImageData,
      {
        key: 'poster-3',
        label: '3 Values',
        levels: 3
      },
      'color'
    );
    expect(Array.from(colorPosterized.data)).toEqual([128, 255, 0, 255]);
  });
});
