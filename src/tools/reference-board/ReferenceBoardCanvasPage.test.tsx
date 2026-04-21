import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReferenceBoardCanvasPage } from './ReferenceBoardCanvasPage';
import {
  deleteImage,
  deleteLayer,
  deleteProjectData,
  loadImage,
  loadLayersForProject,
  saveImage,
  saveLayer,
} from './db';
import { updateProject } from './referenceBoard';

vi.mock('react-konva', () => ({
  Stage: ({ children, onClick, onDblClick }: { children: React.ReactNode; onClick?: () => void; onDblClick?: () => void }) => (
    <div data-testid="konva-stage" onClick={onClick} onDoubleClick={onDblClick}>{children}</div>
  ),
  Layer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Image: ({ onClick }: { onClick?: (e: { evt: { shiftKey: boolean } }) => void }) => (
    <div data-testid="konva-image" onClick={(e) => { e.stopPropagation(); onClick?.({ evt: { shiftKey: !!e.shiftKey } }); }} />
  ),
  Text: ({ onClick, onDblClick }: { onClick?: (e: { evt: { shiftKey: boolean } }) => void; onDblClick?: () => void }) => (
    <div
      data-testid="konva-text"
      onClick={(e) => { e.stopPropagation(); onClick?.({ evt: { shiftKey: false } }); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDblClick?.(); }}
    />
  ),
  Transformer: () => <div />,
  Rect: () => <div />,
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
}));

vi.mock('use-image', () => ({
  default: () => [null, 'loaded'],
}));

vi.mock('./db', () => ({
  loadLayersForProject: vi.fn().mockResolvedValue([]),
  loadImage: vi.fn().mockResolvedValue(undefined),
  saveLayer: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  deleteLayer: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  deleteProjectData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./referenceBoard', async (importOriginal) => {
  const original = await importOriginal<typeof import('./referenceBoard')>();
  return {
    ...original,
    getProject: vi.fn().mockReturnValue({
      id: 'proj-1',
      name: 'Test Project',
      createdAt: 1000,
      updatedAt: 2000,
      viewport: { x: 0, y: 0, scale: 1 },
      canvasBackgroundColor: '#1f1f1f',
    }),
    updateViewport: vi.fn(),
    updateThumbnail: vi.fn(),
    updateProject: vi.fn(),
  };
});

const makeStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', {
    localStorage: makeStorage(),
    crypto: { randomUUID: () => `test-${Math.random()}` },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    innerWidth: 1024,
    innerHeight: 768,
    confirm: vi.fn().mockReturnValue(true),
    prompt: vi.fn(),
  });
});

function renderCanvas(projectId = 'proj-1') {
  return render(
    <MemoryRouter initialEntries={[`/tools/reference-board/canvas/${projectId}`]}>
      <Routes>
        <Route path="/tools/reference-board/canvas/:projectId" element={<ReferenceBoardCanvasPage />} />
        <Route path="/tools/reference-board" element={<div data-testid="projects-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ReferenceBoardCanvasPage', () => {
  it('renders the project name in toolbar', async () => {
    renderCanvas();
    expect(await screen.findByText('Test Project')).toBeInTheDocument();
  });

  it('renders back button', async () => {
    renderCanvas();
    expect(await screen.findByTitle(/back to projects/i)).toBeInTheDocument();
  });

  it('renders image import button', async () => {
    renderCanvas();
    expect(await screen.findByTitle(/import images/i)).toBeInTheDocument();
  });

  it('renders text button', async () => {
    renderCanvas();
    expect(await screen.findByTitle(/add text layer/i)).toBeInTheDocument();
  });

  it('renders canvas stage', async () => {
    renderCanvas();
    expect(await screen.findByTestId('konva-stage')).toBeInTheDocument();
  });

  it('renders canvas background color picker in toolbar', async () => {
    renderCanvas();
    expect(await screen.findByLabelText(/canvas background color/i)).toBeInTheDocument();
  });

  it('persists canvas background color changes for the current project', async () => {
    renderCanvas();
    const colorInput = await screen.findByLabelText(/canvas background color/i);

    fireEvent.change(colorInput, { target: { value: '#223344' } });

    expect(updateProject).toHaveBeenCalledWith('proj-1', { canvasBackgroundColor: '#223344' });
  });

  it('duplicates image layer without writing a second image blob', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);
    vi.mocked(loadImage).mockResolvedValue('data:image/jpeg;base64,abc');

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const duplicateBtn = await screen.findByTitle(/duplicate layer/i);
    fireEvent.click(duplicateBtn);

    expect(saveImage).not.toHaveBeenCalled();
    expect(saveLayer).toHaveBeenCalled();
  });

  it('does not delete shared image data when deleting one referencing layer', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
      {
        id: 'img-layer-2',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        x: 160,
        y: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);
    vi.mocked(loadImage).mockResolvedValue('data:image/jpeg;base64,abc');

    renderCanvas();

    const images = await screen.findAllByTestId('konva-image');
    fireEvent.click(images[0]);

    const deleteBtn = await screen.findByTitle(/delete layer/i);
    fireEvent.click(deleteBtn);

    await vi.waitFor(() => {
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-1');
    });
    expect(deleteImage).not.toHaveBeenCalled();
    expect(deleteProjectData).not.toHaveBeenCalled();
  });

  it('re-persists image data when undoing deletion of a unique image layer', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);
    vi.mocked(loadImage).mockResolvedValue('data:image/jpeg;base64,abc');

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const deleteBtn = await screen.findByTitle(/delete layer/i);
    fireEvent.click(deleteBtn);

    const undoBtn = await screen.findByLabelText(/undo/i);
    fireEvent.click(undoBtn);

    await vi.waitFor(() => {
      expect(saveLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-layer-1' }));
      expect(saveImage).toHaveBeenCalledWith('img-1', 'data:image/jpeg;base64,abc');
    });
  });

  it('re-deletes image data when redoing deletion after undo of a unique image layer', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);
    vi.mocked(loadImage).mockResolvedValue('data:image/jpeg;base64,abc');

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const deleteBtn = await screen.findByTitle(/delete layer/i);
    fireEvent.click(deleteBtn);

    const undoBtn = await screen.findByLabelText(/undo/i);
    fireEvent.click(undoBtn);

    await vi.waitFor(() => {
      expect(saveImage).toHaveBeenCalledWith('img-1', 'data:image/jpeg;base64,abc');
    });

    const redoBtn = await screen.findByLabelText(/redo/i);
    fireEvent.click(redoBtn);

    await vi.waitFor(() => {
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-1');
      expect(deleteImage).toHaveBeenCalledWith('img-1');
    });
  });

  it('keeps shared image data intact across multi-delete undo/redo', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-unique',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-unique',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
      {
        id: 'img-layer-shared-a',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-shared',
        x: 160,
        y: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
      {
        id: 'img-layer-shared-b',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-shared',
        x: 220,
        y: 240,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);

    vi.mocked(loadImage).mockImplementation(async (imageId: string) => {
      if (imageId === 'img-unique') return 'data:image/jpeg;base64,unique';
      if (imageId === 'img-shared') return 'data:image/jpeg;base64,shared';
      return undefined;
    });

    renderCanvas();

    const images = await screen.findAllByTestId('konva-image');
    fireEvent.click(images[0]);
    fireEvent.click(images[1], { shiftKey: true });

    const deleteSelectedBtn = await screen.findByText(/delete selected layers/i);
    fireEvent.click(deleteSelectedBtn);

    await vi.waitFor(() => {
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-unique');
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-shared-a');
      expect(deleteImage).toHaveBeenCalledWith('img-unique');
    });
    expect(deleteImage).not.toHaveBeenCalledWith('img-shared');

    const undoBtn = await screen.findByLabelText(/undo/i);
    fireEvent.click(undoBtn);

    await vi.waitFor(() => {
      expect(saveImage).toHaveBeenCalledWith('img-unique', 'data:image/jpeg;base64,unique');
      expect(saveImage).toHaveBeenCalledWith('img-shared', 'data:image/jpeg;base64,shared');
    });

    vi.mocked(deleteLayer).mockClear();
    vi.mocked(deleteImage).mockClear();

    const redoBtn = await screen.findByLabelText(/redo/i);
    fireEvent.click(redoBtn);

    await vi.waitFor(() => {
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-unique');
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-shared-a');
      expect(deleteImage).toHaveBeenCalledWith('img-unique');
    });
    expect(deleteImage).not.toHaveBeenCalledWith('img-shared');
  });

  it('deletes multi-selected layers via Delete key and keeps shared image data', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-unique',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-unique',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
      {
        id: 'img-layer-shared-a',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-shared',
        x: 160,
        y: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
      {
        id: 'img-layer-shared-b',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-shared',
        x: 220,
        y: 240,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);

    vi.mocked(loadImage).mockImplementation(async (imageId: string) => {
      if (imageId === 'img-unique') return 'data:image/jpeg;base64,unique';
      if (imageId === 'img-shared') return 'data:image/jpeg;base64,shared';
      return undefined;
    });

    renderCanvas();

    const images = await screen.findAllByTestId('konva-image');
    fireEvent.click(images[0]);
    fireEvent.click(images[1], { shiftKey: true });

    const addEventListenerMock = vi.mocked(window.addEventListener);
    const keydownHandlers = addEventListenerMock.mock.calls
      .filter((call) => call[0] === 'keydown')
      .map((call) => call[1] as (event: KeyboardEvent) => void);
    expect(keydownHandlers.length).toBeGreaterThan(0);

    const preventDefault = vi.fn();
    const keyEvent = {
      key: 'Delete',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault,
    } as unknown as KeyboardEvent;
    keydownHandlers.forEach((handler) => handler(keyEvent));

    await vi.waitFor(() => {
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-unique');
      expect(deleteLayer).toHaveBeenCalledWith('img-layer-shared-a');
      expect(deleteImage).toHaveBeenCalledWith('img-unique');
    });
    expect(deleteImage).not.toHaveBeenCalledWith('img-shared');
    expect(preventDefault).toHaveBeenCalled();
  });

  it('copies and pastes selected layers with Cmd/Ctrl+C and Cmd/Ctrl+V', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        x: 100,
        y: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 300,
        height: 200,
        scaleX: 1,
        scaleY: 1,
        flipX: false,
        flipY: false,
      },
    ]);
    vi.mocked(loadImage).mockResolvedValue('data:image/jpeg;base64,abc');

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const addEventListenerMock = vi.mocked(window.addEventListener);
    const keydownHandlers = addEventListenerMock.mock.calls
      .filter((call) => call[0] === 'keydown')
      .map((call) => call[1] as (event: KeyboardEvent) => void);
    const pasteHandlers = addEventListenerMock.mock.calls
      .filter((call) => call[0] === 'paste')
      .map((call) => call[1] as (event: ClipboardEvent) => void);
    expect(keydownHandlers.length).toBeGreaterThan(0);
    expect(pasteHandlers.length).toBeGreaterThan(0);

    const preventCopyDefault = vi.fn();
    const preventPasteDefault = vi.fn();

    const copyEvent = {
      key: 'c',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      preventDefault: preventCopyDefault,
    } as unknown as KeyboardEvent;

    for (const handler of keydownHandlers) {
      handler(copyEvent);
      if (preventCopyDefault.mock.calls.length > 0) break;
    }

    // Trigger paste event (which now handles both copied layers and clipboard images)
    const pasteEvent = {
      clipboardData: {
        items: [],
      },
      preventDefault: preventPasteDefault,
    } as unknown as ClipboardEvent;

    for (const handler of pasteHandlers) {
      handler(pasteEvent);
    }

    await vi.waitFor(async () => {
      const images = await screen.findAllByTestId('konva-image');
      expect(images.length).toBeGreaterThan(1);
    });

    expect(saveLayer).toHaveBeenCalled();
    expect(saveImage).not.toHaveBeenCalled();
    expect(preventCopyDefault).toHaveBeenCalled();
  });

  it('adds a pasted clipboard image as a new image layer', async () => {
    const originalFileReader = globalThis.FileReader;
    const originalImage = globalThis.Image;
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const toDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,compressed');

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL() {
        this.result = 'data:image/png;base64,raw';
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 640;
      naturalHeight = 480;

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    renderCanvas();

    const addEventListenerMock = vi.mocked(window.addEventListener);
    const pasteHandlers = addEventListenerMock.mock.calls
      .filter((call) => call[0] === 'paste')
      .map((call) => call[1] as (event: ClipboardEvent) => void);
    expect(pasteHandlers.length).toBeGreaterThan(0);

    const file = new File(['abc'], 'clipboard.png', { type: 'image/png' });
    const preventDefault = vi.fn();

    const pasteEvent = {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
      preventDefault,
    } as unknown as ClipboardEvent;

    pasteHandlers.forEach((handler) => handler(pasteEvent));

    await vi.waitFor(() => {
      expect(saveImage).toHaveBeenCalled();
      expect(saveLayer).toHaveBeenCalled();
    });
    expect(preventDefault).toHaveBeenCalled();

    vi.stubGlobal('FileReader', originalFileReader);
    vi.stubGlobal('Image', originalImage);
    getContextSpy.mockRestore();
    toDataUrlSpy.mockRestore();
  });


});
