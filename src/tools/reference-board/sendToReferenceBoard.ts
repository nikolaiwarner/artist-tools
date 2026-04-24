import { loadLayersForProject, saveImage, saveLayer } from './db';
import { createProject } from './referenceBoard';
import type { ImageLayer, ProjectMeta } from './types';

export type ResolveReferenceBoardDestinationParams = {
  projects: ProjectMeta[];
  selectedProjectId: string | null;
  newProjectName: string;
};

export type AppendCanvasImageToProjectParams = {
  project: ProjectMeta;
  stageCanvas: HTMLCanvasElement;
  createId?: () => string;
};

export function resolveReferenceBoardDestination(
  params: ResolveReferenceBoardDestinationParams
): ProjectMeta | null {
  const destinationProject = params.projects.find((project) => project.id === params.selectedProjectId) ?? null;
  if (destinationProject) {
    return destinationProject;
  }

  const trimmedName = params.newProjectName.trim();
  if (!trimmedName) {
    return null;
  }

  return createProject(trimmedName);
}

export async function appendCanvasImageToProject(
  params: AppendCanvasImageToProjectParams
): Promise<{ project: ProjectMeta; layer: ImageLayer; imageId: string }> {
  const { project, stageCanvas } = params;

  if (!stageCanvas.width || !stageCanvas.height) {
    throw new Error('No study image is ready yet.');
  }

  const existingLayers = await loadLayersForProject(project.id);
  const maxZIndex = existingLayers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);

  const createId = params.createId ?? buildId;
  const imageId = createId();
  const dataUrl = stageCanvas.toDataURL('image/png');

  const layer: ImageLayer = {
    id: createId(),
    projectId: project.id,
    type: 'image',
    imageId,
    x: 0,
    y: 0,
    width: stageCanvas.width,
    height: stageCanvas.height,
    rotation: 0,
    opacity: 1,
    zIndex: maxZIndex + 1,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
  };

  await saveImage(imageId, dataUrl);
  await saveLayer(layer);

  return {
    project,
    layer,
    imageId,
  };
}

function buildId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `ref-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}
