import { describe, expect, it } from 'vitest';

import { buildCanvasPlan } from './canvasBuilder';

describe('buildCanvasPlan', () => {
  it('creates a supply list for a single medium canvas', () => {
    const plan = buildCanvasPlan({
      width: 24,
      height: 36,
      depth: 1.5,
      stretcherWidth: 1.5,
      quantity: 1,
      wrapMargin: 3,
      supportThreshold: 30
    });

    expect(plan.stretcherPieces).toEqual([
      { label: '24 in width bars', quantity: 2 },
      { label: '36 in height bars', quantity: 2 }
    ]);
    expect(plan.supportBraces).toBe(1);
    expect(plan.fabric.cutSize.width).toBeCloseTo(33);
    expect(plan.fabric.cutSize.height).toBeCloseTo(45);
    expect(plan.fabric.totalSquareFeet).toBeCloseTo(10.31, 2);
  });

  it('scales materials for multiple large canvases', () => {
    const plan = buildCanvasPlan({
      width: 48,
      height: 60,
      depth: 2,
      stretcherWidth: 1.5,
      quantity: 2,
      wrapMargin: 4,
      supportThreshold: 30
    });

    expect(plan.stretcherPieces).toEqual([
      { label: '48 in width bars', quantity: 4 },
      { label: '60 in height bars', quantity: 4 }
    ]);
    expect(plan.supportBraces).toBe(4);
    expect(plan.fabric.totalSquareFeet).toBeCloseTo(60, 2);
    expect(plan.totalWoodLengthFeet).toBeCloseTo(36, 2);
  });
});