export type CanvasPlanInput = {
  width: number;
  height: number;
  depth: number;
  stretcherWidth: number;
  quantity: number;
  wrapMargin: number;
  supportThreshold: number;
};

export type CanvasPlan = {
  stretcherPieces: Array<{ label: string; quantity: number }>;
  supportBraces: number;
  totalWoodLengthFeet: number;
  fabric: {
    cutSize: {
      width: number;
      height: number;
    };
    totalSquareFeet: number;
  };
};

export const defaultCanvasInput: CanvasPlanInput = {
  width: 24,
  height: 36,
  depth: 1.5,
  stretcherWidth: 1.5,
  quantity: 1,
  wrapMargin: 3,
  supportThreshold: 30
};

export function buildCanvasPlan(input: CanvasPlanInput): CanvasPlan {
  const width = sanitizePositiveNumber(input.width);
  const height = sanitizePositiveNumber(input.height);
  const depth = sanitizePositiveNumber(input.depth);
  const quantity = Math.max(1, Math.round(input.quantity));
  const wrapMargin = sanitizePositiveNumber(input.wrapMargin);
  const supportThreshold = sanitizePositiveNumber(input.supportThreshold);
  const wrapAllowance = (depth + wrapMargin) * 2;
  const cutWidth = roundToTwo(width + wrapAllowance);
  const cutHeight = roundToTwo(height + wrapAllowance);
  const supportBracesPerCanvas = getSupportBraces(width, height, supportThreshold);
  const totalWoodLengthFeet = roundToTwo(((width * 2 + height * 2) * quantity) / 12);
  const totalFabricSquareFeet = roundToTwo(((cutWidth * cutHeight) * quantity) / 144);

  return {
    stretcherPieces: [
      { label: `${formatNumber(width)} in width bars`, quantity: quantity * 2 },
      { label: `${formatNumber(height)} in height bars`, quantity: quantity * 2 }
    ],
    supportBraces: supportBracesPerCanvas * quantity,
    totalWoodLengthFeet,
    fabric: {
      cutSize: {
        width: cutWidth,
        height: cutHeight
      },
      totalSquareFeet: totalFabricSquareFeet
    }
  };
}

function getSupportBraces(width: number, height: number, supportThreshold: number) {
  if (width >= supportThreshold && height >= supportThreshold) {
    return 2;
  }

  if (width >= supportThreshold || height >= supportThreshold) {
    return 1;
  }

  return 0;
}

function sanitizePositiveNumber(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${roundToTwo(value)}`;
}