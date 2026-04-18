export type ArtPricingInput = {
  time: number;
  width: number;
  height: number;
  complexity: number;
  materials: number;
  hourlyRate: number;
  areaRate: number;
  timeWeight: number;
  minPrice: number;
  galleryCommission: number;
};

export type ArtPricingResult = {
  timeCost: number;
  areaCost: number;
  blendedCost: number;
  rawPrice: number;
  galleryAmount: number;
  finalPrice: number;
};

export type ReverseInput = {
  targetPrice: number;
  estimatedTime: number;
  /** Width divided by height. 1 = square. */
  aspectRatio: number;
};

export type ReverseResult = {
  width: number;
  height: number;
  area: number;
  verifiedPrice: number;
};

export type ReverseSettings = Pick<
  ArtPricingInput,
  'hourlyRate' | 'areaRate' | 'timeWeight' | 'complexity' | 'materials' | 'galleryCommission'
>;

export const defaultArtPricingInput: ArtPricingInput = {
  time: 2,
  width: 0,
  height: 0,
  complexity: 1,
  materials: 0,
  hourlyRate: 75,
  areaRate: 6,
  timeWeight: 0.5,
  minPrice: 100,
  galleryCommission: 0
};

export function calculatePrice(input: ArtPricingInput): ArtPricingResult {
  const time = sanitize(input.time);
  const width = sanitize(input.width);
  const height = sanitize(input.height);
  const complexity = Math.max(0, sanitize(input.complexity));
  const materials = sanitize(input.materials);
  const hourlyRate = sanitize(input.hourlyRate);
  const areaRate = sanitize(input.areaRate);
  const timeWeight = clamp(sanitize(input.timeWeight), 0, 1);
  const minPrice = sanitize(input.minPrice);
  const galleryCommission = clamp(sanitize(input.galleryCommission), 0, 100);

  const timeCost = roundToTwo(time * hourlyRate);
  const areaCost = roundToTwo(Math.sqrt(width * height) * areaRate);
  const blendedCost = roundToTwo(timeCost * timeWeight + areaCost * (1 - timeWeight));
  const rawPrice = roundToTwo(blendedCost * complexity + materials);
  const galleryAmount = roundToTwo(rawPrice * galleryCommission / 100);
  const priceWithCommission = roundToTwo(rawPrice + galleryAmount);
  const finalPrice = roundToTwo(Math.max(priceWithCommission, minPrice));

  return { timeCost, areaCost, blendedCost, rawPrice, galleryAmount, finalPrice };
}

export function calculateReversePrice(
  input: ReverseInput,
  settings: ReverseSettings
): ReverseResult {
  const targetPrice = sanitize(input.targetPrice);
  const estimatedTime = sanitize(input.estimatedTime);
  const aspectRatio = Math.max(0.001, sanitize(input.aspectRatio));
  const { hourlyRate, areaRate, timeWeight, complexity, materials, galleryCommission } = settings;

  if (targetPrice <= 0) {
    return { width: 0, height: 0, area: 0, verifiedPrice: 0 };
  }

  // Adjust target for commission: we want (rawPrice + rawPrice × commission/100) = target
  // => rawPrice = target / (1 + commission/100)
  const adjustedTarget =
    galleryCommission > 0
      ? targetPrice / (1 + galleryCommission / 100)
      : targetPrice;

  // rawPrice = (blendedCost × complexity) + materials
  // => blendedCost = (adjustedTarget - materials) / complexity
  const targetBlended = complexity > 0 ? (adjustedTarget - materials) / complexity : 0;

  // blendedCost = timeCost × timeWeight + areaCost × (1 - timeWeight)
  // timeCost (weighted portion) = estimatedTime × hourlyRate × timeWeight
  const weightedTimeCost = estimatedTime * hourlyRate * timeWeight;

  // areaCost (weighted portion) = √(width×height) × areaRate × (1 - timeWeight)
  // => targetWeightedAreaCost = targetBlended - weightedTimeCost
  const targetWeightedAreaCost = targetBlended - weightedTimeCost;

  if (targetWeightedAreaCost <= 0) {
    // Time cost alone exceeds budget — no valid size exists
    return { width: 0, height: 0, area: 0, verifiedPrice: 0 };
  }

  // targetWeightedAreaCost = √area × areaRate × (1 - timeWeight)
  // => √area = targetWeightedAreaCost / (areaRate × (1 - timeWeight))
  const areaWeight = 1 - timeWeight;
  if (areaWeight === 0) {
    return { width: 0, height: 0, area: 0, verifiedPrice: 0 };
  }

  const sqrtArea = targetWeightedAreaCost / (areaRate * areaWeight);
  // area = sqrtArea²; width/height = aspectRatio => area = width × (width / aspectRatio)
  // => width² = area × aspectRatio
  const area = sqrtArea * sqrtArea;
  const width = roundToTwo(Math.sqrt(area * aspectRatio));
  const height = roundToTwo(width / aspectRatio);

  // Verify by running forward calculation (no min price applied)
  const { finalPrice: verifiedPrice } = calculatePrice({
    time: estimatedTime,
    width,
    height,
    complexity,
    materials,
    hourlyRate,
    areaRate,
    timeWeight,
    minPrice: 0,
    galleryCommission
  });

  return {
    width,
    height,
    area: roundToTwo(width * height),
    verifiedPrice
  };
}

function sanitize(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
