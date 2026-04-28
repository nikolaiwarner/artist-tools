export type ArtPricingInput = {
  time: number;
  width: number;
  height: number;
  complexity: number;
  materials: number;
  hourlyRate: number;
  areaRate: number;
  areaExponent: number;
  timeWeight: number;
  overheadFixed: number;
  minPrice: number;
  galleryCommission: number;
  commissionMode: 'add-on' | 'included';
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
  | 'hourlyRate'
  | 'areaRate'
  | 'areaExponent'
  | 'timeWeight'
  | 'complexity'
  | 'materials'
  | 'overheadFixed'
  | 'galleryCommission'
  | 'commissionMode'
>;

export const defaultArtPricingInput: ArtPricingInput = {
  time: 2,
  width: 0,
  height: 0,
  complexity: 1,
  materials: 0,
  hourlyRate: 45,
  areaRate: 4,
  areaExponent: 0.75,
  timeWeight: 0.6,
  overheadFixed: 20,
  minPrice: 150,
  galleryCommission: 50,
  commissionMode: 'included'
};

export function calculatePrice(input: ArtPricingInput): ArtPricingResult {
  const time = sanitize(input.time);
  const width = sanitize(input.width);
  const height = sanitize(input.height);
  const complexity = Math.max(0, sanitize(input.complexity));
  const materials = sanitize(input.materials);
  const hourlyRate = sanitize(input.hourlyRate);
  const areaRate = sanitize(input.areaRate);
  const areaExponent = clamp(sanitize(input.areaExponent), 0.5, 1);
  const timeWeight = clamp(sanitize(input.timeWeight), 0, 1);
  const overheadFixed = sanitize(input.overheadFixed);
  const minPrice = sanitize(input.minPrice);
  const galleryCommission = clamp(sanitize(input.galleryCommission), 0, 100);
  const commissionMode = input.commissionMode === 'included' ? 'included' : 'add-on';

  const timeCost = roundToTwo(time * hourlyRate);
  const area = width * height;
  const areaCost = roundToTwo(Math.pow(area, areaExponent) * areaRate);
  const blendedCost = roundToTwo(timeCost * timeWeight + areaCost * (1 - timeWeight));
  const rawPrice = roundToTwo(blendedCost * complexity + materials + overheadFixed);
  const galleryAmount = roundToTwo(rawPrice * galleryCommission / 100);
  const priceWithCommission =
    commissionMode === 'add-on'
      ? roundToTwo(rawPrice + galleryAmount)
      : rawPrice;
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
  const {
    hourlyRate,
    areaRate,
    areaExponent,
    timeWeight,
    complexity,
    materials,
    overheadFixed,
    galleryCommission,
    commissionMode
  } = settings;

  if (targetPrice <= 0) {
    return { width: 0, height: 0, area: 0, verifiedPrice: 0 };
  }

  // In add-on mode, final includes commission. In included mode, final equals raw.
  const adjustedTarget =
    commissionMode === 'add-on' && galleryCommission > 0
      ? targetPrice / (1 + galleryCommission / 100)
      : targetPrice;

  // rawPrice = (blendedCost × complexity) + materials + overheadFixed
  // => blendedCost = (adjustedTarget - materials - overheadFixed) / complexity
  const targetBlended =
    complexity > 0
      ? (adjustedTarget - materials - overheadFixed) / complexity
      : 0;

  // blendedCost = timeCost × timeWeight + areaCost × (1 - timeWeight)
  // timeCost (weighted portion) = estimatedTime × hourlyRate × timeWeight
  const weightedTimeCost = estimatedTime * hourlyRate * timeWeight;

  // areaCost (weighted portion) = (area^areaExponent) × areaRate × (1 - timeWeight)
  // => targetWeightedAreaCost = targetBlended - weightedTimeCost
  const targetWeightedAreaCost = targetBlended - weightedTimeCost;

  if (targetWeightedAreaCost <= 0) {
    // Time cost alone exceeds budget — no valid size exists
    return { width: 0, height: 0, area: 0, verifiedPrice: 0 };
  }

  // targetWeightedAreaCost = (area^areaExponent) × areaRate × (1 - timeWeight)
  // => area^areaExponent = targetWeightedAreaCost / (areaRate × (1 - timeWeight))
  const areaWeight = 1 - timeWeight;
  if (areaWeight === 0 || areaRate <= 0 || areaExponent <= 0) {
    return { width: 0, height: 0, area: 0, verifiedPrice: 0 };
  }

  const scaledArea = targetWeightedAreaCost / (areaRate * areaWeight);
  const area = Math.pow(scaledArea, 1 / areaExponent);
  // width/height = aspectRatio => area = width × (width / aspectRatio)
  // => width² = area × aspectRatio
  const width = roundToTwo(Math.sqrt(area * aspectRatio));
  const height = roundToTwo(width / aspectRatio);

  // Verify by running forward calculation (no min price applied)
  const { finalPrice: verifiedPrice } = calculatePrice({
    time: estimatedTime,
    width,
    height,
    complexity,
    materials,
    areaExponent,
    hourlyRate,
    areaRate,
    timeWeight,
    overheadFixed,
    minPrice: 0,
    galleryCommission,
    commissionMode
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
