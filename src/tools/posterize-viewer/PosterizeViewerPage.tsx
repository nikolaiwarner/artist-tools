import { type ChangeEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, Download, ImagePlus, Layers3, Palette, Pause, Play, RefreshCcw, Send } from 'lucide-react';

import { AppMenuButton } from '../../components/AppMenuButton';
import { SendToReferenceBoardDialog } from '../../components/SendToReferenceBoardDialog';
import { useSyncedLocalStorage } from '../../sync/useSyncedLocalStorage';
import { useSendToReferenceBoardDialog } from '../../hooks/useSendToReferenceBoardDialog';
import { applyPosterStageToImageData, buildPosterStages, type PosterRenderMode, type PosterStage } from './posterize';

type CameraStatus = 'camera-off' | 'camera-active' | 'image-mode' | 'camera-error';
type CameraFacingMode = 'environment' | 'user';
type PosterizeViewerSettings = {
  cameraFacingMode: CameraFacingMode;
  activeStageIndex: number;
  renderMode: PosterRenderMode;
};

type PosterToast = {
  tone: 'success' | 'error';
  message: string;
};

const DEFAULT_SOURCE_ASPECT_RATIO = '3 / 4';
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
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('camera-off');
  const [cameraPaused, setCameraPaused] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sourceAspectRatio, setSourceAspectRatio] = useState(DEFAULT_SOURCE_ASPECT_RATIO);
  const [toast, setToast] = useState<PosterToast | null>(null);

  const { state: sendState, handlers: sendHandlers } = useSendToReferenceBoardDialog();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const activeStage = stages[settings.activeStageIndex] ?? stages[0];

  useEffect(() => {
    return () => {
      cancelAnimationLoop(animationFrameRef.current);
      stopStream(streamRef.current);
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    if (cameraStatus !== 'camera-active' || cameraPaused) {
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
  }, [cameraStatus, cameraPaused, activeStage, settings.renderMode]);

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
    if (cameraStatus === 'camera-active' && cameraPaused) {
      renderFrameFromVideo(videoRef.current, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
      return;
    }

    if (cameraStatus === 'image-mode') {
      renderFrameFromImage(imageRef.current, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
    }
  }, [cameraStatus, cameraPaused, activeStage, settings.renderMode]);

  async function handleStartCamera(nextFacingMode = settings.cameraFacingMode) {
    const mediaDevices = navigator.mediaDevices;

    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      setErrorMessage('Camera API is not available in this browser context.');
      setCameraStatus('camera-error');
      return;
    }

    try {
      cancelAnimationLoop(animationFrameRef.current);
      stopStream(streamRef.current);
      streamRef.current = null;

      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacingMode }
        }
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        const streamTarget = video as HTMLVideoElement & { srcObject: MediaStream | null };
        streamTarget.srcObject = stream;
        void playVideo(video);
      }

      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
      }

      setSettings((current) => ({ ...current, cameraFacingMode: nextFacingMode }));
      setCameraPaused(false);
      setErrorMessage(null);
      setCameraStatus('camera-active');
    } catch {
      setErrorMessage('Unable to access camera. Check browser permission settings.');
      setCameraStatus('camera-error');
    }
  }

  function handleStopCamera() {
    cancelAnimationLoop(animationFrameRef.current);
    animationFrameRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      const streamTarget = video as HTMLVideoElement & { srcObject: MediaStream | null };
      streamTarget.srcObject = null;
    }

    setCameraPaused(false);
    setSourceAspectRatio(DEFAULT_SOURCE_ASPECT_RATIO);
    setCameraStatus('camera-off');
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    handleStopCamera();

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    const nextImageUrl = URL.createObjectURL(file);
    setImageUrl(nextImageUrl);
    setSourceAspectRatio(DEFAULT_SOURCE_ASPECT_RATIO);
    setErrorMessage(null);
    setCameraStatus('image-mode');
  }

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    setSourceAspectRatio(buildAspectRatioValue(image.naturalWidth, image.naturalHeight));
    renderFrameFromImage(image, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
  }

  function handleVideoMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    setSourceAspectRatio(buildAspectRatioValue(video.videoWidth, video.videoHeight));
    video.setAttribute('width', String(video.videoWidth));
    video.setAttribute('height', String(video.videoHeight));
    renderFrameFromVideo(video, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
  }

  async function handleCameraToggle() {
    if (cameraStatus === 'camera-active') {
      handleStopCamera();
      return;
    }

    await handleStartCamera();
  }

  async function handleSwitchCamera() {
    const nextFacingMode = settings.cameraFacingMode === 'environment' ? 'user' : 'environment';
    setSettings((current) => ({ ...current, cameraFacingMode: nextFacingMode }));

    if (cameraStatus !== 'camera-active') {
      return;
    }

    await handleStartCamera(nextFacingMode);
  }

  async function handlePauseToggle() {
    if (cameraStatus !== 'camera-active') {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (cameraPaused) {
      void playVideo(video);
      setCameraPaused(false);
      return;
    }

    renderFrameFromVideo(video, sourceCanvasRef.current, stageCanvasRef.current, activeStage, settings.renderMode);
    video.pause();
    setCameraPaused(true);
  }

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
          <div className="poster-controls">
            <button
              type="button"
              className={`icon-button${cameraStatus === 'camera-active' ? ' icon-button-active' : ''}`}
              aria-label="Toggle camera"
              aria-pressed={cameraStatus === 'camera-active'}
              title="Toggle camera"
              onClick={handleCameraToggle}
            >
              {cameraStatus === 'camera-active' ? (
                <CameraOff size={18} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Camera size={18} strokeWidth={2} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className="icon-button"
              aria-label="Switch front or back camera"
              title={`Switch to ${settings.cameraFacingMode === 'environment' ? 'front' : 'back'} camera`}
              onClick={() => {
                void handleSwitchCamera();
              }}
            >
              <RefreshCcw size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`icon-button${cameraPaused ? ' icon-button-active' : ''}`}
              aria-label={cameraPaused ? 'Resume live camera' : 'Pause current frame'}
              aria-pressed={cameraPaused}
              title={cameraPaused ? 'Resume live camera' : 'Pause current frame'}
              disabled={cameraStatus !== 'camera-active'}
              onClick={() => {
                void handlePauseToggle();
              }}
            >
              {cameraPaused ? <Play size={18} strokeWidth={2} aria-hidden="true" /> : <Pause size={18} strokeWidth={2} aria-hidden="true" />}
            </button>

            <label className="poster-file-input">
              <span className="sr-only">Upload source image</span>
              <ImagePlus size={18} strokeWidth={2} aria-hidden="true" />
              <input type="file" accept="image/*" aria-label="Upload source image" onChange={handleImageUpload} />
            </label>

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
          </div>

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

          {errorMessage ? <p className="poster-error">{errorMessage}</p> : null}

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

          <div className="poster-source-panel">
            <div className="poster-source-frame" style={{ aspectRatio: sourceAspectRatio }}>
              {imageUrl ? (
                <img ref={imageRef} src={imageUrl} alt="Uploaded source" className="poster-source poster-source-image" onLoad={handleImageLoad} />
              ) : (
                <video
                  ref={videoRef}
                  className="poster-source poster-source-video"
                  muted
                  autoPlay
                  playsInline
                  onLoadedMetadata={handleVideoMetadata}
                />
              )}
            </div>
          </div>

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

function buildAspectRatioValue(width: number, height: number) {
  if (!width || !height) {
    return DEFAULT_SOURCE_ASPECT_RATIO;
  }

  return `${width} / ${height}`;
}

function playVideo(video: HTMLVideoElement) {
  try {
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
      return playResult.catch(() => {
        // Ignore autoplay errors; user can still interact to resume playback.
      });
    }

    return playResult;
  } catch {
    // Ignore missing play implementations in tests or constrained environments.
    return undefined;
  }
}

function stopStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}
