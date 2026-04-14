import { render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: /next value stage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle grayscale or color/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save current image/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload source image/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: /original/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /2 values/i })).not.toBeInTheDocument();
  });

  it('uses one button to start and stop camera capture', async () => {
    const user = userEvent.setup();

    render(<PosterizeViewerPage />);

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));

    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(screen.getByRole('button', { name: /toggle camera/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /toggle camera/i }));

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /toggle camera/i })).toHaveAttribute('aria-pressed', 'false');
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
});
