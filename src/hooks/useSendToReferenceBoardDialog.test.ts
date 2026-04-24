import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSendToReferenceBoardDialog } from './useSendToReferenceBoardDialog';
import * as referenceBoard from '../tools/reference-board/referenceBoard';
import * as sendToReferenceBoard from '../tools/reference-board/sendToReferenceBoard';
import type { ProjectMeta } from '../tools/reference-board/types';

vi.mock('../tools/reference-board/referenceBoard');
vi.mock('../tools/reference-board/sendToReferenceBoard');

const mockProjects: ProjectMeta[] = [
  {
    id: 'proj1',
    name: 'Project 1',
    pinned: false,
    createdAt: 1000,
    updatedAt: 1000,
    viewport: { x: 0, y: 0, scale: 1 },
  },
  {
    id: 'proj2',
    name: 'Project 2',
    pinned: true,
    createdAt: 2000,
    updatedAt: 2000,
    viewport: { x: 0, y: 0, scale: 1 },
  },
];

const mockProject: ProjectMeta = {
  id: 'proj-new',
  name: 'New Project',
  pinned: false,
  createdAt: 3000,
  updatedAt: 3000,
  viewport: { x: 0, y: 0, scale: 1 },
};

describe('useSendToReferenceBoardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with closed dialog and empty state', () => {
    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    expect(result.current.state.showDialog).toBe(false);
    expect(result.current.state.dialogProjects).toEqual([]);
    expect(result.current.state.selectedProjectId).toBeNull();
    expect(result.current.state.newProjectName).toBe('');
    expect(result.current.state.sendStatus).toBeNull();
    expect(result.current.state.sendError).toBeNull();
    expect(result.current.state.sendingToBoard).toBe(false);
  });

  it('openDialog loads projects and sets initial selection', () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });

    expect(result.current.state.showDialog).toBe(true);
    expect(result.current.state.dialogProjects).toEqual(mockProjects);
    expect(result.current.state.selectedProjectId).toBe('proj1');
    expect(result.current.state.newProjectName).toBe('');
    expect(result.current.state.sendStatus).toBeNull();
    expect(result.current.state.sendError).toBeNull();
  });

  it('openDialog with no projects leaves selectedProjectId null', () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue([]);

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });

    expect(result.current.state.showDialog).toBe(true);
    expect(result.current.state.dialogProjects).toEqual([]);
    expect(result.current.state.selectedProjectId).toBeNull();
  });

  it('closeDialog hides the dialog', () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });
    expect(result.current.state.showDialog).toBe(true);

    act(() => {
      result.current.handlers.closeDialog();
    });
    expect(result.current.state.showDialog).toBe(false);
  });

  it('selectProject sets selection and clears newProjectName', () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
      result.current.handlers.updateNewProjectName('My New Project');
    });

    expect(result.current.state.selectedProjectId).toBeNull();
    expect(result.current.state.newProjectName).toBe('My New Project');

    act(() => {
      result.current.handlers.selectProject('proj2');
    });

    expect(result.current.state.selectedProjectId).toBe('proj2');
    expect(result.current.state.newProjectName).toBe('');
  });

  it('updateNewProjectName sets value and clears selectedProjectId when non-empty', () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });

    expect(result.current.state.selectedProjectId).toBe('proj1');

    act(() => {
      result.current.handlers.updateNewProjectName('New Project Name');
    });

    expect(result.current.state.newProjectName).toBe('New Project Name');
    expect(result.current.state.selectedProjectId).toBeNull();
  });

  it('updateNewProjectName with whitespace-only value does not clear selection', () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
      result.current.handlers.updateNewProjectName('   ');
    });

    expect(result.current.state.selectedProjectId).toBe('proj1');
  });

  it('performSend with no canvas shows error', async () => {
    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });

    const createId = () => 'test-id';

    await act(async () => {
      await result.current.handlers.performSend(null as any, createId);
    });

    expect(result.current.state.showDialog).toBe(false);
    expect(result.current.state.sendStatus).toBeNull();
    expect(result.current.state.sendError).toBe('No study image is ready yet.');
  });

  it('performSend sends image to resolved destination and updates status', async () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);
    vi.mocked(sendToReferenceBoard.resolveReferenceBoardDestination).mockReturnValue(mockProject);
    vi.mocked(sendToReferenceBoard.appendCanvasImageToProject).mockResolvedValue({
      project: mockProject,
      layer: { id: 'layer1', type: 'image', name: 'Layer 1' } as any,
      imageId: 'image-1',
    });

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
      result.current.handlers.selectProject('proj1');
    });

    const canvas = document.createElement('canvas');
    const createId = () => 'test-id';

    await act(async () => {
      await result.current.handlers.performSend(canvas, createId);
    });

    expect(result.current.state.showDialog).toBe(false);
    expect(result.current.state.sendingToBoard).toBe(false);
    expect(result.current.state.sendStatus).toBe('Sent to New Project.');
    expect(result.current.state.sendError).toBeNull();
  });

  it('performSend with creation error updates error state', async () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);
    vi.mocked(sendToReferenceBoard.resolveReferenceBoardDestination).mockReturnValue(mockProject);
    vi.mocked(sendToReferenceBoard.appendCanvasImageToProject).mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });

    const canvas = document.createElement('canvas');
    const createId = () => 'test-id';

    await act(async () => {
      await result.current.handlers.performSend(canvas, createId);
    });

    expect(result.current.state.showDialog).toBe(false);
    expect(result.current.state.sendingToBoard).toBe(false);
    expect(result.current.state.sendStatus).toBeNull();
    expect(result.current.state.sendError).toBe('Unable to send image to Reference Board. Try again.');
  });

  it('performSend sets sendingToBoard to true during operation', async () => {
    vi.mocked(referenceBoard.listProjects).mockReturnValue(mockProjects);
    vi.mocked(sendToReferenceBoard.resolveReferenceBoardDestination).mockReturnValue(mockProject);

    let resolveAppend: any;
    const appendPromise = new Promise((resolve) => {
      resolveAppend = resolve;
    });
    vi.mocked(sendToReferenceBoard.appendCanvasImageToProject).mockReturnValue(
      appendPromise as Promise<{ project: ProjectMeta; layer: any; imageId: string }>
    );

    const { result } = renderHook(() => useSendToReferenceBoardDialog());

    act(() => {
      result.current.handlers.openDialog();
    });

    const canvas = document.createElement('canvas');
    const createId = () => 'test-id';

    let sendPromise: Promise<void>;
    await act(async () => {
      sendPromise = result.current.handlers.performSend(canvas, createId);
    });

    // At this point, sendingToBoard should be true
    expect(result.current.state.sendingToBoard).toBe(true);

    await act(async () => {
      resolveAppend({ project: mockProject, layer: { id: 'layer1' } });
      await sendPromise;
    });

    expect(result.current.state.sendingToBoard).toBe(false);
  });
});
