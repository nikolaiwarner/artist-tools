import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Layers3, Palette, Send } from 'lucide-react';

import { AppMenuButton } from '../../components/AppMenuButton';
import { CameraSourcePanel, type CameraFacingMode, type CameraSourceState } from '../../components/CameraSourcePanel';
import { SendToReferenceBoardDialog } from '../../components/SendToReferenceBoardDialog';
import { useSyncedLocalStorage } from '../../sync/useSyncedLocalStorage';
import { useSendToReferenceBoardDialog } from '../../hooks/useSendToReferenceBoardDialog';
import { applyPosterStageToImageData, buildPosterStages, type PosterRenderMode, type PosterStage } from './posterize';

type PosterizeViewerSettings = {
  cameraFacingMode: CameraFacingMode;
  activeStageIndex: number;
  renderMode: PosterRenderMode;
};

type PosterToast = {
  tone: 'success' | 'error';
  message: string;
};

const STORAGE_KEY = 'artist-tools.posterize-viewer.settings';
const DEFAULT_SETTINGS: PosterizeViewerSettings = {
  cameraFacingMode: 'environment',
  activeStageIndex: 0,
  renderMode: 'grayscale',
};

function parseSettings(raw: string): PosterizeViewerSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<PosterizeViewerSettings>;
    return {
      cameraFacingMode: parsed.cameraFacingMode === 'user' ? 'user' : 'environment',
      activeStageIndex:
        typeof parsed.activeStageIndex === 'number' && Number.isFinite(parsed.activeStageIndex)
          ? Math.max(0, Math.floor(parsed.activeStageIndex))
          : 0,
      renderMode: parsed.renderMode === 'color' ? 'color' : 'grayscale',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function PosterizeViewerPage() {
  const stages = useMemo(() => buildPosterStages(), []);
  const [settings, setSettings] = useSyncedLocalStorage<PosterizeViewerSettings>(
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    parseSettings
  );
  const [sourceState, setSourceState] = useState<CameraSourceState>({
    cameraStatus: 'camera-off',
    cameraPaused: false,
    errorMessage: null,
    sourceAspectRatio: '3 / 4',
  });
  const [toast, setToast] = useState<PosterToast | null>(null);

  const { state: sendState, handlers: sendHandlers } = useSendToReferenceBoardDialog();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const activeStage = stages[settings.activeStageIndex] ?? stages[0];

  useEffect(() => {
    return () => {
      cancelAnimationLoop(animationFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (sourceState.cameraStatus !== 'camera-active' || sourceState.cameraPaused) {
      cancelAnimationLoop(animationFrameRef.current);
      animationFrameRef.current = null;
      return;
    }

    const drawFrame = () => {
      renderFrameFromVideo(videoRef.current, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
      animationFrameRef.current = window.requestAnimationFrame(drawFrame);
    };

    animationFrameRef.current = window.requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationLoop(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [sourceState.cameraStatus, sourceState.cameraPaused, activeStage, settings.renderMode]);

  useEffect(() => {
    if (sendState.sendError) {
      setToast({ tone: 'error', message: sendState.sendError });
      return;
    }

    if (sendState.sendStatus) {
      setToast({ tone: 'success', message: sendState.sendStatus });
    }
  }, [sendState.sendError, sendState.sendStatus]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  useEffect(() => {
    if (sourceState.cameraStatus === 'camera-active' && sourceState.cameraPaused) {
      renderFrameFromVideo(videoRef.current, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
      return;
    }

    if (sourceState.cameraStatus === 'image-mode') {
      renderFrameFromImage(imageRef.current, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
    }
  }, [sourceState.cameraStatus, sourceState.cameraPaused, activeStage, settings.renderMode]);

  function handleStageToggle() {
    setSettings((current) => ({
      ...current,
      activeStageIndex: (current.activeStageIndex + 1) % stages.length,
    }));
  }

  function handleModeToggle() {
    setSettings((current) => ({
      ...current,
      renderMode: current.renderMode === 'grayscale' ? 'color' : 'grayscale',
    }));
  }

  function handleSaveCurrentImage() {
    const stageCanvas = stageCanvasRef.current;
    if (!stageCanvas) {
      return;
    }

    const link = document.createElement('a');
    link.href = stageCanvas.toDataURL('image/png');
    link.download = `${activeStage.key}-${settings.renderMode}.png`;
    link.click();
  }

  async function handleConfirmSend() {
    await sendHandlers.performSend(stageCanvasRef.current!, buildId);
  }

  return (
    <section className="tool-layout poster-tool-layout">
      <div className="tool-hero">
        <div className="tool-hero-head">
          <AppMenuButton />
          <div className="tool-hero-copy">
            <h1>Value Study</h1>
            <p>View live camera feed or an uploaded image as grayscale or full color, plus 2-5 value posterized studies.</p>
          </div>
        </div>
      </div>

      <div className="poster-tool-grid">
        <section className="builder-panel poster-source-workbench">
          <h2>Source</h2>
          <CameraSourcePanel
            facingMode={settings.cameraFacingMode}
            onFacingModeChange={(nextFacingMode) => {
              setSettings((current) => ({ ...current, cameraFacingMode: nextFacingMode }));
            }}
            onStateChange={setSourceState}
            onVideoMetadata={(video) => {
              renderFrameFromVideo(video, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
            }}
            onImageLoad={(image) => {
              renderFrameFromImage(image, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
            }}
            videoRef={videoRef}
            imageRef={imageRef}
          >
            <button type="button" className="icon-button" aria-label="Next value stage" title="Next value stage" onClick={handleStageToggle}>
              <Layers3 size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`icon-button${settings.renderMode === 'color' ? ' icon-button-active' : ''}`}
              aria-label="Toggle grayscale or color"
              aria-pressed={settings.renderMode === 'color'}
              title="Toggle grayscale or color"
              onClick={handleModeToggle}
            >
              <Palette size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            <button type="button" className="icon-button" aria-label="Save current image" title="Save current image" onClick={handleSaveCurrentImage}>
              <Download size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="icon-button"
              aria-label="Send to Reference Board"
              title="Send to Reference Board"
              disabled={sendState.sendingToBoard}
              onClick={sendHandlers.openDialog}
            >
              <Send size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </CameraSourcePanel>

          <div className="poster-toast-stack" aria-live="polite" aria-atomic="true">
            {toast ? (
              <p
                className={`poster-toast ${toast.tone === 'error' ? 'poster-toast-error' : 'poster-toast-success'}`}
                role={toast.tone === 'error' ? 'alert' : 'status'}
              >
                {toast.message}
              </p>
            ) : null}
          </div>
          {sendState.showDialog && (
            <SendToReferenceBoardDialog
              projects={sendState.dialogProjects}
              selectedProjectId={sendState.selectedProjectId}
              newProjectName={sendState.newProjectName}
              onSelectProject={sendHandlers.selectProject}
              onNewProjectNameChange={sendHandlers.updateNewProjectName}
              onCancel={sendHandlers.closeDialog}
              onConfirm={() => {
                void handleConfirmSend();
              }}
              canConfirm={Boolean(sendState.selectedProjectId || sendState.newProjectName.trim())}
            />
          )}

          <canvas ref={sourceCanvasRef} className="poster-hidden-canvas" aria-hidden="true" />
        </section>

        <section className="builder-panel results-panel poster-results-panel" aria-live="polite">
          <h2>Value study</h2>
          <article
            className="poster-stage-card poster-stage-single poster-stage-trigger"
            role="button"
            tabIndex={0}
            aria-label="Study preview"
            onClick={handleStageToggle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleStageToggle();
              }
            }}
          >
            <h3>{activeStage.label}</h3>
            <canvas ref={stageCanvasRef} className="poster-stage-canvas" aria-label={`${activeStage.label} preview`} />
          </article>
        </section>
      </div>
    </section>
  );
}

function buildId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `poster-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function renderFrameFromVideo(
  video: HTMLVideoElement | null,
  sourceCanvas: HTMLCanvasElement | null,
  stageCanvas: HTMLCanvasElement | null,
  stage: PosterStage,
  mode: PosterRenderMode
) {
  if (!video || !sourceCanvas || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) {
    return;
  }

  sourceCanvas.width = video.videoWidth;
  sourceCanvas.height = video.videoHeight;

  sourceContext.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
  renderStage(sourceContext, sourceCanvas.width, sourceCanvas.height, stageCanvas, stage, mode);
}

function renderFrameFromImage(
  image: HTMLImageElement | null,
  sourceCanvas: HTMLCanvasElement | null,
  stageCanvas: HTMLCanvasElement | null,
  stage: PosterStage,
  mode: PosterRenderMode
) {
  if (!image || !sourceCanvas || !image.naturalWidth || !image.naturalHeight) {
    return;
  }

  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) {
    return;
  }

  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;

  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  renderStage(sourceContext, sourceCanvas.width, sourceCanvas.height, stageCanvas, stage, mode);
}

function renderStage(
  sourceContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  stageCanvas: HTMLCanvasElement | null,
  stage: PosterStage,
  mode: PosterRenderMode
) {
  if (!stageCanvas) {
    return;
  }

  const sourceData = sourceContext.getImageData(0, 0, width, height);
  const stageContext = stageCanvas.getContext('2d');
  if (!stageContext) {
    return;
  }

  stageCanvas.width = width;
  stageCanvas.height = height;

  const renderedData = applyPosterStageToImageData(sourceData, stage, mode);
  stageContext.putImageData(renderedData, 0, 0);
}

function cancelAnimationLoop(frameId: number | null) {
  if (frameId === null) {
    return;
  }

  window.cancelAnimationFrame(frameId);
}
