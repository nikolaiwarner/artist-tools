import { type ChangeEvent, type MutableRefObject, type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ImagePlus, Pause, Play, RefreshCcw } from 'lucide-react';

export type CameraSourceStatus = 'camera-off' | 'camera-active' | 'image-mode' | 'camera-error';
export type CameraFacingMode = 'environment' | 'user';

export interface CameraSourceState {
  cameraStatus: CameraSourceStatus;
  cameraPaused: boolean;
  errorMessage: string | null;
  sourceAspectRatio: string;
}

interface CameraSourcePanelProps {
  facingMode: CameraFacingMode;
  onFacingModeChange: (mode: CameraFacingMode) => void;
  onStateChange?: (state: CameraSourceState) => void;
  onVideoMetadata?: (video: HTMLVideoElement) => void;
  onImageLoad?: (image: HTMLImageElement) => void;
  onCapture?: (dataUrl: string) => void;
  showUpload?: boolean;
  showCaptureButton?: boolean;
  captureButtonLabel?: string;
  uploadAriaLabel?: string;
  controlsClassName?: string;
  sourcePanelClassName?: string;
  sourceFrameClassName?: string;
  sourceClassName?: string;
  videoRef?: MutableRefObject<HTMLVideoElement | null>;
  imageRef?: MutableRefObject<HTMLImageElement | null>;
  children?: ReactNode;
}

const DEFAULT_SOURCE_ASPECT_RATIO = '3 / 4';

export function CameraSourcePanel({
  facingMode,
  onFacingModeChange,
  onStateChange,
  onVideoMetadata,
  onImageLoad,
  onCapture,
  showUpload = true,
  showCaptureButton = false,
  captureButtonLabel = 'Capture photo',
  uploadAriaLabel = 'Upload source image',
  controlsClassName = 'poster-controls',
  sourcePanelClassName = 'poster-source-panel',
  sourceFrameClassName = 'poster-source-frame',
  sourceClassName = 'poster-source',
  videoRef,
  imageRef,
  children,
}: CameraSourcePanelProps) {
  const [cameraStatus, setCameraStatus] = useState<CameraSourceStatus>('camera-off');
  const [cameraPaused, setCameraPaused] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sourceAspectRatio, setSourceAspectRatio] = useState(DEFAULT_SOURCE_ASPECT_RATIO);

  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const internalImageRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const resolvedVideoRef = videoRef ?? internalVideoRef;
  const resolvedImageRef = imageRef ?? internalImageRef;

  useEffect(() => {
    onStateChange?.({ cameraStatus, cameraPaused, errorMessage, sourceAspectRatio });
  }, [cameraStatus, cameraPaused, errorMessage, sourceAspectRatio, onStateChange]);

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  async function handleStartCamera(nextFacingMode = facingMode) {
    const mediaDevices = navigator.mediaDevices;

    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      setErrorMessage('Camera API is not available in this browser context.');
      setCameraStatus('camera-error');
      return;
    }

    try {
      stopStream(streamRef.current);
      streamRef.current = null;

      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacingMode },
        },
      });
      streamRef.current = stream;

      const video = resolvedVideoRef.current;
      if (video) {
        const streamTarget = video as HTMLVideoElement & { srcObject: MediaStream | null };
        streamTarget.srcObject = stream;
        void playVideo(video);
      }

      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
      }

      onFacingModeChange(nextFacingMode);
      setCameraPaused(false);
      setErrorMessage(null);
      setCameraStatus('camera-active');
    } catch {
      setErrorMessage('Unable to access camera. Check browser permission settings.');
      setCameraStatus('camera-error');
    }
  }

  function handleStopCamera() {
    stopStream(streamRef.current);
    streamRef.current = null;

    const video = resolvedVideoRef.current;
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

  function handleImageLoaded(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    setSourceAspectRatio(buildAspectRatioValue(image.naturalWidth, image.naturalHeight));
    onImageLoad?.(image);
  }

  function handleVideoLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    setSourceAspectRatio(buildAspectRatioValue(video.videoWidth, video.videoHeight));
    video.setAttribute('width', String(video.videoWidth));
    video.setAttribute('height', String(video.videoHeight));
    onVideoMetadata?.(video);
  }

  async function handleCameraToggle() {
    if (cameraStatus === 'camera-active') {
      handleStopCamera();
      return;
    }

    await handleStartCamera();
  }

  async function handleSwitchCamera() {
    const nextFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    onFacingModeChange(nextFacingMode);

    if (cameraStatus !== 'camera-active') {
      return;
    }

    await handleStartCamera(nextFacingMode);
  }

  async function handlePauseToggle() {
    if (cameraStatus !== 'camera-active') {
      return;
    }

    const video = resolvedVideoRef.current;
    if (!video) {
      return;
    }

    if (cameraPaused) {
      void playVideo(video);
      setCameraPaused(false);
      return;
    }

    video.pause();
    setCameraPaused(true);
  }

  function handleCapture() {
    if (!onCapture) {
      return;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    if (cameraStatus === 'camera-active') {
      const video = resolvedVideoRef.current;
      if (!video?.videoWidth || !video?.videoHeight) {
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      onCapture(canvas.toDataURL('image/png'));
      return;
    }

    if (cameraStatus === 'image-mode') {
      const image = resolvedImageRef.current;
      if (!image?.naturalWidth || !image?.naturalHeight) {
        return;
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      onCapture(canvas.toDataURL('image/png'));
    }
  }

  return (
    <>
      <div className={controlsClassName}>
        <button
          type="button"
          className={`icon-button${cameraStatus === 'camera-active' ? ' icon-button-active' : ''}`}
          aria-label="Toggle camera"
          aria-pressed={cameraStatus === 'camera-active'}
          title="Toggle camera"
          onClick={() => {
            void handleCameraToggle();
          }}
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
          title={`Switch to ${facingMode === 'environment' ? 'front' : 'back'} camera`}
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

        {showUpload ? (
          <label className="poster-file-input">
            <span className="sr-only">{uploadAriaLabel}</span>
            <ImagePlus size={18} strokeWidth={2} aria-hidden="true" />
            <input type="file" accept="image/*" aria-label={uploadAriaLabel} onChange={handleImageUpload} />
          </label>
        ) : null}

        {showCaptureButton ? (
          <button
            type="button"
            className="icon-button"
            aria-label={captureButtonLabel}
            title={captureButtonLabel}
            disabled={cameraStatus !== 'camera-active' && cameraStatus !== 'image-mode'}
            onClick={handleCapture}
          >
            <Camera size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}

        {children}
      </div>

      {errorMessage ? <p className="poster-error">{errorMessage}</p> : null}

      <div className={sourcePanelClassName}>
        <div className={sourceFrameClassName} style={{ aspectRatio: sourceAspectRatio }}>
          {imageUrl ? (
            <img
              ref={resolvedImageRef}
              src={imageUrl}
              alt="Uploaded source"
              className={`${sourceClassName} poster-source-image`}
              onLoad={handleImageLoaded}
            />
          ) : (
            <video
              ref={resolvedVideoRef}
              className={`${sourceClassName} poster-source-video`}
              muted
              autoPlay
              playsInline
              onLoadedMetadata={handleVideoLoadedMetadata}
            />
          )}
        </div>
      </div>
    </>
  );
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
