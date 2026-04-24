import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  loadLayersForProject: vi.fn(),
  saveImage: vi.fn(),
  saveLayer: vi.fn(),
}));

vi.mock('./referenceBoard', () => ({
  createProject: mocks.createProject,
}));

vi.mock('./db', () => ({
  loadLayersForProject: mocks.loadLayersForProject,
  saveImage: mocks.saveImage,
  saveLayer: mocks.saveLayer,
}));

import type { ProjectMeta } from './types';
import { appendCanvasImageToProject, resolveReferenceBoardDestination } from './sendToReferenceBoard';

function makeProject(id: string, name: string): ProjectMeta {
  return {
    id,
    name,
    createdAt: 1,
    updatedAt: 1,
    viewport: { x: 0, y: 0, scale: 1 },
  };
}

describe('resolveReferenceBoardDestination', () => {
  beforeEach(() => {
    mocks.createProject.mockReset();
    mocks.createProject.mockReturnValue(makeProject('created-id', 'Created Project'));
  });

  it('returns the selected existing project when selected id exists', () => {
    const projects = [makeProject('p1', 'Daily Studies')];

    const destination = resolveReferenceBoardDestination({
      projects,
      selectedProjectId: 'p1',
      newProjectName: ' Mood Board ',
    });

    expect(destination).toEqual(projects[0]);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('creates and returns a new project when no project is selected and a name is provided', () => {
    const destination = resolveReferenceBoardDestination({
      projects: [makeProject('p1', 'Daily Studies')],
      selectedProjectId: null,
      newProjectName: ' Mood Board ',
    });

    expect(mocks.createProject).toHaveBeenCalledWith('Mood Board');
    expect(destination).toEqual(makeProject('created-id', 'Created Project'));
  });

  it('returns null when no project is selected and new name is empty', () => {
    const destination = resolveReferenceBoardDestination({
      projects: [makeProject('p1', 'Daily Studies')],
      selectedProjectId: null,
      newProjectName: '   ',
    });

    expect(destination).toBeNull();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});

describe('appendCanvasImageToProject', () => {
  beforeEach(() => {
    mocks.loadLayersForProject.mockReset();
    mocks.saveImage.mockReset();
    mocks.saveLayer.mockReset();
  });

  it('saves image and layer with next z-index', async () => {
    const project = makeProject('p1', 'Daily Studies');
    const stageCanvas = {
      width: 320,
      height: 180,
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,abc'),
    } as unknown as HTMLCanvasElement;

    mocks.loadLayersForProject.mockResolvedValue([{ id: 'l1', zIndex: 4 }]);

    let idCounter = 0;
    const createId = () => `id-${++idCounter}`;

    const result = await appendCanvasImageToProject({
      project,
      stageCanvas,
      createId,
    });

    expect(mocks.loadLayersForProject).toHaveBeenCalledWith('p1');
    expect(mocks.saveImage).toHaveBeenCalledWith('id-1', 'data:image/png;base64,abc');
    expect(mocks.saveLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'id-2',
      projectId: 'p1',
      type: 'image',
      imageId: 'id-1',
      width: 320,
      height: 180,
      zIndex: 5,
    }));
    expect(result.project).toEqual(project);
  });

  it('throws when canvas is not ready', async () => {
    const project = makeProject('p1', 'Daily Studies');
    const stageCanvas = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(),
    } as unknown as HTMLCanvasElement;

    await expect(appendCanvasImageToProject({
      project,
      stageCanvas,
      createId: () => 'id',
    })).rejects.toThrow('No study image is ready yet.');
  });
});
