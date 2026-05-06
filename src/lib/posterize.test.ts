import { describe, expect, it } from 'vitest';

import { applyPosterizeToImageData, posterizeChannel, toGrayscaleValue } from './posterize';

describe('shared posterize utilities', () => {
  it('converts rgb values to grayscale luminance', () => {
    expect(toGrayscaleValue(255, 0, 0)).toBe(54);
    expect(toGrayscaleValue(0, 255, 0)).toBe(182);
    expect(toGrayscaleValue(0, 0, 255)).toBe(18);
  });

  it('posterizes a channel into fixed levels', () => {
    expect(posterizeChannel(50, 2)).toBe(0);
    expect(posterizeChannel(200, 2)).toBe(255);
    expect(posterizeChannel(120, 5)).toBe(128);
  });

  it('applies grayscale and level posterization', () => {
    const input = {
      data: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as ImageData;

    const grayscale = applyPosterizeToImageData(input, { mode: 'grayscale' });
    expect(Array.from(grayscale.data)).toEqual([54, 54, 54, 255]);

    const grayscalePosterized = applyPosterizeToImageData(input, { mode: 'grayscale', levels: 3 });
    expect(Array.from(grayscalePosterized.data)).toEqual([0, 0, 0, 255]);

    const colorPosterized = applyPosterizeToImageData(
      {
        data: new Uint8ClampedArray([120, 200, 10, 255]),
        width: 1,
        height: 1,
        colorSpace: 'srgb',
      } as ImageData,
      { mode: 'color', levels: 3 }
    );
    expect(Array.from(colorPosterized.data)).toEqual([128, 255, 0, 255]);
  });
});
