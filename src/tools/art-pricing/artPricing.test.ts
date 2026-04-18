import { describe, expect, it } from 'vitest';

import {
  calculatePrice,
  calculateReversePrice,
  defaultArtPricingInput
} from './artPricing';

describe('calculatePrice', () => {
  it('calculates a basic price with no extras', () => {
    const result = calculatePrice({
      time: 2,
      width: 10,
      height: 10,
      complexity: 1,
      materials: 0,
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      minPrice: 100,
      galleryCommission: 0
    });

    // timeCost = 2 × 75 = 150
    // areaCost = √(10×10) × 6 = 10 × 6 = 60
    // blendedCost = 150×0.5 + 60×0.5 = 75 + 30 = 105
    // rawPrice = 105 × 1 + 0 = 105
    // finalPrice = max(105, 100) = 105
    expect(result.timeCost).toBeCloseTo(150);
    expect(result.areaCost).toBeCloseTo(60);
    expect(result.blendedCost).toBeCloseTo(105);
    expect(result.rawPrice).toBeCloseTo(105);
    expect(result.galleryAmount).toBeCloseTo(0);
    expect(result.finalPrice).toBeCloseTo(105);
  });

  it('applies the minimum price floor when calculated is below minimum', () => {
    const result = calculatePrice({
      time: 0.1,
      width: 4,
      height: 4,
      complexity: 1,
      materials: 0,
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      minPrice: 100,
      galleryCommission: 0
    });

    // timeCost = 0.1 × 75 = 7.5
    // areaCost = √16 × 6 = 4 × 6 = 24
    // blendedCost = 7.5×0.5 + 24×0.5 = 3.75 + 12 = 15.75
    // rawPrice = 15.75 < 100
    expect(result.rawPrice).toBeLessThan(100);
    expect(result.finalPrice).toBeCloseTo(100);
  });

  it('applies gallery commission on top of raw price', () => {
    const result = calculatePrice({
      time: 2,
      width: 10,
      height: 10,
      complexity: 1,
      materials: 0,
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      minPrice: 0,
      galleryCommission: 50
    });

    // rawPrice = 105 (from basic test above)
    // galleryAmount = 105 × 0.5 = 52.5
    // finalPrice = 105 + 52.5 = 157.5
    expect(result.rawPrice).toBeCloseTo(105);
    expect(result.galleryAmount).toBeCloseTo(52.5);
    expect(result.finalPrice).toBeCloseTo(157.5);
  });

  it('scales the blended cost by the complexity multiplier', () => {
    const base = calculatePrice({
      time: 2,
      width: 10,
      height: 10,
      complexity: 1,
      materials: 0,
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      minPrice: 0,
      galleryCommission: 0
    });
    const complex = calculatePrice({
      time: 2,
      width: 10,
      height: 10,
      complexity: 2,
      materials: 0,
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      minPrice: 0,
      galleryCommission: 0
    });

    expect(complex.rawPrice).toBeCloseTo(base.blendedCost * 2);
  });

  it('adds materials after applying complexity multiplier', () => {
    const result = calculatePrice({
      time: 2,
      width: 10,
      height: 10,
      complexity: 2,
      materials: 25,
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      minPrice: 0,
      galleryCommission: 0
    });

    // blendedCost = 105, rawPrice = (105 × 2) + 25 = 235
    expect(result.rawPrice).toBeCloseTo(235);
  });

  it('handles zero dimensions gracefully (returns zeros, not NaN)', () => {
    const result = calculatePrice({
      ...defaultArtPricingInput,
      width: 0,
      height: 0,
      time: 0
    });

    expect(Number.isNaN(result.finalPrice)).toBe(false);
    expect(result.finalPrice).toBeGreaterThanOrEqual(0);
  });

  it('has sensible defaults', () => {
    expect(defaultArtPricingInput.hourlyRate).toBe(75);
    expect(defaultArtPricingInput.areaRate).toBe(6);
    expect(defaultArtPricingInput.timeWeight).toBe(0.5);
    expect(defaultArtPricingInput.minPrice).toBe(100);
    expect(defaultArtPricingInput.galleryCommission).toBe(0);
  });
});

describe('calculateReversePrice', () => {
  it('returns dimensions that produce the target price when verified', () => {
    const settings = {
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      complexity: 1,
      materials: 0,
      galleryCommission: 0
    };
    const result = calculateReversePrice(
      { targetPrice: 200, estimatedTime: 2, aspectRatio: 1 },
      settings
    );

    // Verified price should be close to targetPrice
    expect(result.verifiedPrice).toBeCloseTo(200, 0);
    // Square aspect ratio → width and height should be equal
    expect(result.width).toBeCloseTo(result.height, 1);
    expect(result.width).toBeGreaterThan(0);
  });

  it('adjusts for gallery commission in reverse calculation', () => {
    const settings = {
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      complexity: 1,
      materials: 0,
      galleryCommission: 50
    };
    const result = calculateReversePrice(
      { targetPrice: 300, estimatedTime: 2, aspectRatio: 1 },
      settings
    );

    // Verified price (with commission) should be close to target
    expect(result.verifiedPrice).toBeCloseTo(300, 0);
  });

  it('returns zero dimensions when target price is not achievable', () => {
    const settings = {
      hourlyRate: 75,
      areaRate: 6,
      timeWeight: 0.5,
      complexity: 1,
      materials: 0,
      galleryCommission: 0
    };
    // Target price lower than time cost alone
    const result = calculateReversePrice(
      { targetPrice: 10, estimatedTime: 10, aspectRatio: 1 },
      settings
    );

    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});
