export type PosterStage = {
  key: string;
  label: string;
  levels?: number;
};

export {
  applyPosterizeToImageData,
  posterizeChannel,
  toGrayscaleValue,
  type PosterRenderMode,
} from '../../lib/posterize';
import { applyPosterizeToImageData, type PosterRenderMode } from '../../lib/posterize';

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

export function applyPosterStageToImageData(source: ImageData, stage: PosterStage, mode: PosterRenderMode = 'grayscale') {
  const levels = stage.key === 'grayscale' ? undefined : stage.levels;
  return applyPosterizeToImageData(source, { mode, levels });
}
