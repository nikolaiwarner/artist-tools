import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PosterizeViewerPage } from './PosterizeViewerPage';

describe('PosterizeViewerPage', () => {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn();
  let playSpy: { mockRestore: () => void };
  let anchorClickSpy: { mockRestore: () => void };
  let toDataUrlSpy: { mockRestore: () => void };

  beforeEach(() => {
    stopTrack.mockReset();
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }]
    });

    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    toDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    playSpy.mockRestore();
    anchorClickSpy.mockRestore();
    toDataUrlSpy.mockRestore();
  });

  it('renders icon controls and a single active stage', () => {
    render(<PosterizeViewerPage />);

    expect(screen.getByRole('heading', { level: 1, name: /value study/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch front or back camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pause current frame/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next value stage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle grayscale or color/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save current image/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload source image/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /source/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /2 values/i })).not.toBeInTheDocument();
  });

  it('uses one button to start and stop camera capture', async () => {
    const user = userEvent.setup();

    render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));

    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'environment' }
      }
    });
    expect(screen.getByRole('button', { name: /toggle camera/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /pause current frame/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /toggle camera/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /pause current frame/i })).toBeDisabled();
  });

  it('switches between back and front camera streams', async () => {
    const user = userEvent.setup();

    render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));
    await user.click(screen.getByRole('button', { name: /switch front or back camera/i }));

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      video: {
        facingMode: { ideal: 'user' }
      }
    });

    await user.click(screen.getByRole('button', { name: /switch front or back camera/i }));

    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(3, {
      video: {
        facingMode: { ideal: 'environment' }
      }
    });
  });

  it('cycles value stage, toggles color mode, and saves current output', async () => {
    const user = userEvent.setup();

    render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /next value stage/i }));
    expect(screen.getByRole('heading', { name: /2 values/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /toggle grayscale or color/i }));
    expect(screen.getByRole('button', { name: /toggle grayscale or color/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /next value stage/i }));
    await user.click(screen.getByRole('button', { name: /next value stage/i }));
    await user.click(screen.getByRole('button', { name: /next value stage/i }));
    await user.click(screen.getByRole('button', { name: /next value stage/i }));

    expect(screen.getByRole('heading', { name: /original/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save current image/i }));
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });

  it('cycles value stage when the study preview is tapped', async () => {
    const user = userEvent.setup();

    render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /study preview/i }));
    expect(screen.getByRole('heading', { name: /2 values/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /study preview/i }));
    expect(screen.getByRole('heading', { name: /3 values/i })).toBeInTheDocument();
  });

  it('pauses and resumes the current camera frame', async () => {
    const user = userEvent.setup();
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));
    await user.click(screen.getByRole('button', { name: /pause current frame/i }));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /resume live camera/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /resume live camera/i }));

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /pause current frame/i })).toHaveAttribute('aria-pressed', 'false');

    pauseSpy.mockRestore();
  });

  it('updates the camera preview frame to match the live aspect ratio', async () => {
    const user = userEvent.setup();
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));

    const video = container.querySelector('video');
    const sourceFrame = container.querySelector('.poster-source-frame');

    expect(video).not.toBeNull();
    expect(sourceFrame).not.toBeNull();

    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      value: 720
    });
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      value: 1280
    });

    fireEvent.loadedMetadata(video as HTMLVideoElement);

    expect(sourceFrame).toHaveStyle({ aspectRatio: '720 / 1280' });

    getContextSpy.mockRestore();
  });
});
