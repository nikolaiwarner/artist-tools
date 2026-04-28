import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { generateMaskDataUrlFromImage } from './backgroundMask';
import { updateProject, updateThumbnail } from './referenceBoard';

const canvasStageMocks = vi.hoisted(() => {
  const fakeStage = {
    _x: 0,
    _y: 0,
    _scaleX: 1,
    _scaleY: 1,
    _width: 1200,
    _height: 800,
    x() { return this._x; },
    y() { return this._y; },
    scaleX() { return this._scaleX; },
    scaleY() { return this._scaleY; },
    width() { return this._width; },
    height() { return this._height; },
    setAttrs(attrs: Partial<{ x: number; y: number; scaleX: number; scaleY: number; width: number; height: number }>) {
      if (attrs.x !== undefined) this._x = attrs.x;
      if (attrs.y !== undefined) this._y = attrs.y;
      if (attrs.scaleX !== undefined) this._scaleX = attrs.scaleX;
      if (attrs.scaleY !== undefined) this._scaleY = attrs.scaleY;
      if (attrs.width !== undefined) this._width = attrs.width;
      if (attrs.height !== undefined) this._height = attrs.height;
    },
    batchDraw() { },
    toCanvas() {
      return document.createElement('canvas');
    },
  };

  return {
    attachStageRef: false,
    fakeStage,
    reset() {
      this.attachStageRef = false;
      fakeStage._x = 0;
      fakeStage._y = 0;
      fakeStage._scaleX = 1;
      fakeStage._scaleY = 1;
      fakeStage._width = 1200;
      fakeStage._height = 800;
    },
  };
});

vi.mock('./components/CanvasStage', () => ({
  CanvasStage: ({ children, stageRef, onBackgroundClick }: {
    children?: React.ReactNode;
    stageRef?: { current: unknown };
    onBackgroundClick?: () => void;
  }) => {
    if (stageRef && canvasStageMocks.attachStageRef) {
      stageRef.current = canvasStageMocks.fakeStage as never;
    }

    return (
      <div data-testid="konva-stage" onClick={onBackgroundClick}>
        {children}
      </div>
    );
  },
}));

vi.mock('react-konva', () => ({
  Stage: ({ children, onClick, onDblClick }: { children: React.ReactNode; onClick?: () => void; onDblClick?: () => void }) => (
    <div data-testid="konva-stage" onClick={onClick} onDoubleClick={onDblClick}>{children}</div>
  ),
  Layer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Image: ({ onClick, onContextMenu }: {
    onClick?: (e: { evt: { shiftKey: boolean } }) => void;
    onContextMenu?: (e: { evt: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void } }) => void;
  }) => (
    <div
      data-testid="konva-image"
      onClick={(e) => { e.stopPropagation(); onClick?.({ evt: { shiftKey: !!e.shiftKey } }); }}
      onContextMenu={(e) => {
        e.stopPropagation();
        onContextMenu?.({ evt: { clientX: e.clientX, clientY: e.clientY, preventDefault: () => { }, stopPropagation: () => { } } });
      }}
    />
  ),
  Text: ({ onClick, onDblClick }: { onClick?: (e: { evt: { shiftKey: boolean } }) => void; onDblClick?: () => void }) => (
    <div
      data-testid="konva-text"
      onClick={(e) => { e.stopPropagation(); onClick?.({ evt: { shiftKey: false } }); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDblClick?.(); }}
    />
  ),
  Transformer: () => <div />,
  Rect: ({ onClick }: { onClick?: (e: { evt: { shiftKey: boolean } }) => void }) => (
    <div
      data-testid="konva-rect"
      onClick={(e) => { e.stopPropagation(); onClick?.({ evt: { shiftKey: !!e.shiftKey } }); }}
    />
  ),
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

vi.mock('./backgroundMask', () => ({
  generateMaskDataUrlFromImage: vi.fn().mockResolvedValue('data:image/png;base64,detected-mask'),
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
  canvasStageMocks.reset();
  const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: clipboardWriteText,
    },
  });
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

afterEach(() => {
  vi.useRealTimers();
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

  it('captures an image from camera and imports it as a layer', async () => {
    const originalImage = globalThis.Image;
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const toDataUrlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,camera-capture');

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 720;
      naturalHeight = 1280;

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    const { container } = renderCanvas();

    fireEvent.click(await screen.findByRole('button', { name: /capture image from camera/i }));
    fireEvent.click(await screen.findByRole('button', { name: /toggle camera/i }));

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      value: 1280,
    });
    fireEvent.loadedMetadata(video as HTMLVideoElement);

    const captureButton = await screen.findByRole('button', { name: /capture photo/i });
    await vi.waitFor(() => {
      expect(captureButton).toBeEnabled();
    });
    fireEvent.click(captureButton);

    await vi.waitFor(() => {
      expect(saveImage).toHaveBeenCalled();
      expect(saveLayer).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'proj-1',
        type: 'image',
      }));
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'environment' },
      },
    });
    expect(stopTrack).toHaveBeenCalledTimes(1);

    vi.stubGlobal('Image', originalImage);
    playSpy.mockRestore();
    getContextSpy.mockRestore();
    toDataUrlSpy.mockRestore();
  });

  it('renders text button', async () => {
    renderCanvas();
    expect(await screen.findByTitle(/add text layer/i)).toBeInTheDocument();
  });

  it('renders box button', async () => {
    renderCanvas();
    expect(await screen.findByTitle(/add box layer/i)).toBeInTheDocument();
  });

  it('renders canvas stage', async () => {
    renderCanvas();
    expect(await screen.findByTestId('konva-stage')).toBeInTheDocument();
  });

  it('adds a box layer and persists it', async () => {
    renderCanvas();

    const addBoxButton = await screen.findByTitle(/add box layer/i);
    fireEvent.click(addBoxButton);

    expect(saveLayer).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      type: 'shape',
      shape: 'rectangle',
      width: 240,
      height: 160,
      stroke: '#4da3ff',
      strokeWidth: 4,
      fill: 'transparent',
    }));
    expect(await screen.findByTestId('konva-rect')).toBeInTheDocument();
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

  it('saves the latest thumbnail before exiting to the projects list', async () => {
    canvasStageMocks.attachStageRef = true;
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'shape-layer-1',
        projectId: 'proj-1',
        type: 'shape',
        shape: 'rectangle',
        x: 50,
        y: 60,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        width: 240,
        height: 160,
        stroke: '#4da3ff',
        strokeWidth: 4,
        fill: 'transparent',
        scaleX: 1,
        scaleY: 1,
      },
    ]);

    const canvasContextStub = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContextStub);
    const toDataUrlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,test-thumb');

    renderCanvas();

    await screen.findByTestId('konva-rect');

    expect(updateThumbnail).not.toHaveBeenCalled();

    const backButton = await screen.findByTitle(/back to projects/i);
    fireEvent.click(backButton);

    expect(updateThumbnail).toHaveBeenCalledTimes(1);
    expect(updateThumbnail).toHaveBeenCalledWith('proj-1', 'data:image/jpeg;base64,test-thumb');
    expect(await screen.findByTestId('projects-page')).toBeInTheDocument();

    getContextSpy.mockRestore();
    toDataUrlSpy.mockRestore();
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

  it('loads both base image and mask assets for a masked image layer', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        maskImageId: 'mask-1',
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
    vi.mocked(loadImage).mockImplementation(async (imageId: string) => `data:image/png;base64,${imageId}`);

    renderCanvas();

    await screen.findByTestId('konva-image');

    await vi.waitFor(() => {
      expect(loadImage).toHaveBeenCalledWith('img-1');
      expect(loadImage).toHaveBeenCalledWith('mask-1');
    });
  });

  it('clears a selected image mask from the layer panel', async () => {
    vi.mocked(loadLayersForProject).mockResolvedValueOnce([
      {
        id: 'img-layer-1',
        projectId: 'proj-1',
        type: 'image',
        imageId: 'img-1',
        maskImageId: 'mask-1',
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
    vi.mocked(loadImage).mockImplementation(async (imageId: string) => `data:image/png;base64,${imageId}`);

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const clearMaskButton = await screen.findByTitle(/clear image mask/i);
    fireEvent.click(clearMaskButton);

    expect(saveLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'img-layer-1',
      maskImageId: undefined,
    }));
  });

  it('detects and applies a mask to the selected image layer', async () => {
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
    vi.mocked(loadImage).mockResolvedValue('data:image/png;base64,base-image');

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const detectMaskButton = await screen.findByTitle(/detect image mask/i);
    fireEvent.click(detectMaskButton);

    await vi.waitFor(() => {
      expect(generateMaskDataUrlFromImage).toHaveBeenCalledWith('data:image/png;base64,base-image');
      expect(saveImage).toHaveBeenCalledWith(expect.any(String), 'data:image/png;base64,detected-mask');
      expect(saveLayer).toHaveBeenCalledWith(expect.objectContaining({
        id: 'img-layer-1',
        maskImageId: expect.any(String),
      }));
    });
  });

  it('shows a processing state while detecting a mask', async () => {
    let resolveDetection: ((value: string) => void) | undefined;

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
    vi.mocked(loadImage).mockResolvedValue('data:image/png;base64,base-image');
    vi.mocked(generateMaskDataUrlFromImage).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDetection = resolve;
      })
    );

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const detectMaskButton = await screen.findByTitle(/detect image mask/i);
    fireEvent.click(detectMaskButton);

    expect(await screen.findByRole('status')).toHaveTextContent(/detecting mask/i);
    expect(screen.getByTitle(/detecting image mask/i)).toBeDisabled();
    expect(screen.getByTitle(/draw image mask/i)).toBeDisabled();

    resolveDetection?.('data:image/png;base64,detected-mask');

    await vi.waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.getByTitle(/detect image mask/i)).not.toBeDisabled();
  });

  it('opens the mask drawing editor for a selected image layer', async () => {
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
    vi.mocked(loadImage).mockResolvedValue('data:image/png;base64,base-image');

    renderCanvas();

    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.click(imageNode);

    const drawMaskButton = await screen.findByTitle(/draw image mask/i);
    fireEvent.click(drawMaskButton);

    expect(await screen.findByRole('dialog', { name: /mask editor/i })).toBeInTheDocument();
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
        getData: () => '',
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

  it('writes copied layer payload to the clipboard on Cmd/Ctrl+C', async () => {
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

    const preventCopyDefault = vi.fn();
    const copyEvent = {
      key: 'c',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      preventDefault: preventCopyDefault,
    } as unknown as KeyboardEvent;

    keydownHandlers.forEach((handler) => handler(copyEvent));

    await vi.waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    const clipboardPayload = vi.mocked(globalThis.navigator.clipboard.writeText).mock.calls[0][0];
    const parsedPayload = JSON.parse(clipboardPayload) as { kind: string; sourceProjectId: string; layers: Array<{ id: string }> };
    expect(parsedPayload.kind).toBe('artist-tools/reference-board-layers');
    expect(parsedPayload.sourceProjectId).toBe('proj-1');
    expect(parsedPayload.layers).toHaveLength(1);
    expect(parsedPayload.layers[0].id).toBe('img-layer-1');
    expect(preventCopyDefault).toHaveBeenCalled();
  });

  it('pastes layers from clipboard JSON into another project and remaps image asset ids', async () => {
    renderCanvas('proj-2');

    const addEventListenerMock = vi.mocked(window.addEventListener);
    const pasteHandlers = addEventListenerMock.mock.calls
      .filter((call) => call[0] === 'paste')
      .map((call) => call[1] as (event: ClipboardEvent) => void);
    expect(pasteHandlers.length).toBeGreaterThan(0);

    vi.mocked(loadImage).mockImplementation(async (imageId: string) => {
      if (imageId === 'img-1') return 'data:image/jpeg;base64,source-image';
      if (imageId === 'mask-1') return 'data:image/png;base64,source-mask';
      return undefined;
    });

    const clipboardLayerPayload = JSON.stringify({
      kind: 'artist-tools/reference-board-layers',
      sourceProjectId: 'proj-1',
      layers: [
        {
          id: 'img-layer-1',
          projectId: 'proj-1',
          type: 'image',
          imageId: 'img-1',
          maskImageId: 'mask-1',
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
      ],
    });

    const preventDefault = vi.fn();
    const pasteEvent = {
      clipboardData: {
        items: [],
        getData: (type: string) => (type === 'text/plain' ? clipboardLayerPayload : ''),
      },
      preventDefault,
    } as unknown as ClipboardEvent;

    pasteHandlers[pasteHandlers.length - 1]?.(pasteEvent);

    await vi.waitFor(() => {
      expect(loadImage).toHaveBeenCalledWith('img-1');
      expect(loadImage).toHaveBeenCalledWith('mask-1');
      expect(saveImage).toHaveBeenCalledTimes(2);
    });

    const saveImageCalls = vi.mocked(saveImage).mock.calls;
    expect(saveImageCalls[0][0]).not.toBe('img-1');
    expect(saveImageCalls[1][0]).not.toBe('mask-1');

    const pastedImageAssetId = saveImageCalls.find((call) => call[1] === 'data:image/jpeg;base64,source-image')?.[0];
    const pastedMaskAssetId = saveImageCalls.find((call) => call[1] === 'data:image/png;base64,source-mask')?.[0];

    expect(saveLayer).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-2',
      type: 'image',
      imageId: pastedImageAssetId,
      maskImageId: pastedMaskAssetId,
    }));
    expect(preventDefault).toHaveBeenCalled();
  });

  it('shows Copy option in layer context menu and writes to clipboard on click', async () => {
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

    renderCanvas();
    const imageNode = await screen.findByTestId('konva-image');
    fireEvent.contextMenu(imageNode);

    const copyButton = await screen.findByText('Copy');
    expect(copyButton).toBeInTheDocument();

    fireEvent.mouseDown(copyButton);

    await vi.waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    const clipboardText = vi.mocked(globalThis.navigator.clipboard.writeText).mock.calls[0][0];
    const payload = JSON.parse(clipboardText) as { kind: string; layers: Array<{ id: string }> };
    expect(payload.kind).toBe('artist-tools/reference-board-layers');
    expect(payload.layers[0].id).toBe('img-layer-1');
  });

  it('shows Paste option in canvas context menu after copying a layer', async () => {
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

    renderCanvas();
    const imageNode = await screen.findByTestId('konva-image');

    // Select the layer first
    fireEvent.click(imageNode);

    // Copy via keyboard shortcut
    const addEventListenerMock = vi.mocked(window.addEventListener);
    const keydownHandlers = addEventListenerMock.mock.calls
      .filter((call) => call[0] === 'keydown')
      .map((call) => call[1] as (event: KeyboardEvent) => void);

    const copyEvent = {
      key: 'c',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    for (const handler of keydownHandlers) {
      handler(copyEvent);
    }

    await vi.waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    // Right-click on the canvas wrap to open the paste menu
    const canvasWrap = screen.getByTestId('canvas-wrap');
    fireEvent.contextMenu(canvasWrap);

    const pasteButton = await screen.findByText('Paste');
    expect(pasteButton).toBeInTheDocument();
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

    pasteHandlers[pasteHandlers.length - 1]?.(pasteEvent);

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
