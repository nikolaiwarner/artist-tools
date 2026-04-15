# Camera Tonal Study

A real-time tonal study tool for painters. It strips a live camera feed or uploaded image down to flat value zones so you can read the composition without getting distracted by color and detail.

## Inputs

The tool accepts one of two sources at a time:

- **Camera** — live feed from the device camera via `getUserMedia`.
- **Image upload** — a still image file selected from disk.

## Controls

### Camera controls
| Control | Behavior |
|---|---|
| Start camera | Requests `getUserMedia` with the current facing mode and begins the render loop. |
| Stop camera | Stops the media stream and returns to the idle state. |
| Flip camera | Toggles between `environment` (rear) and `user` (front) facing mode and restarts the stream. Only shown while camera is active. |
| Pause / Resume | Freezes the render loop on the current frame. Stage and color mode toggles remain active on the frozen frame. |

### Image upload
- Available at all times via a file input.
- Activating an upload stops any live camera stream and switches to image mode.
- Blob URLs created for uploads are revoked when the component unmounts or a new source is loaded.

### Value stage toggle
Cycles through five posterization stages in order:

| Stage | Label | Behavior |
|---|---|---|
| `grayscale` | Original | In grayscale mode: converts to grayscale with no posterization. In color mode: passes through the original colors unchanged. |
| `poster-2` | 2 Values | Quantizes to 2 tonal levels. |
| `poster-3` | 3 Values | Quantizes to 3 tonal levels. |
| `poster-4` | 4 Values | Quantizes to 4 tonal levels. |
| `poster-5` | 5 Values | Quantizes to 5 tonal levels. |

### Color mode toggle
- **Grayscale** — all posterization is applied to luminance only; output is gray pixels.
- **Color** — posterization quantizes each RGB channel independently, preserving hue relationships at the selected number of levels. In the "Original" stage, the source image passes through without modification.

### Save / Export
- Downloads the current stage canvas output as a PNG.
- Works in all states: camera live, camera paused, or image mode.

## Rendering Pipeline

Each frame (or on any state change):

1. Draw the source (video frame or image) onto a hidden `sourceCanvas` at its native resolution.
2. Read `ImageData` from `sourceCanvas`.
3. Apply `applyPosterStageToImageData(imageData, activeStage, renderMode)` to produce transformed pixels.
4. Write the result to the visible `stageCanvas`.

The live camera path runs inside a `requestAnimationFrame` loop. The loop is cancelled when the camera is paused, stopped, or the component unmounts. Stage and color changes while paused or in image mode trigger a single re-render instead of resuming the loop.

## Pixel Transformation

### Grayscale conversion (ITU-R BT.709)
```
gray = round(R × 0.2126 + G × 0.7152 + B × 0.0722)
```

### Posterization
```
normalized = clamp(value, 0–255) / 255
quantized  = round(normalized × (levels − 1))
output     = round((quantized / (levels − 1)) × 255)
```
`levels` is clamped to a minimum of 2. Applied per-channel in color mode, or to the grayscale value in grayscale mode.

## Preview Sizing

The visible canvas preserves the aspect ratio of the source:
- Default aspect ratio is `3 / 4` before a source is loaded.
- Updates to the source's intrinsic width/height ratio once a camera stream or image is ready.
- Sized to fit the viewport on mobile without scrolling.

## Files

| File | Role |
|---|---|
| `posterize.ts` | Pure pixel transformation logic; no React dependencies |
| `PosterizeViewerPage.tsx` | Camera/image orchestration, render loop, UI controls |
| `posterize.test.ts` | Unit tests for transformation functions |
| `PosterizeViewerPage.test.tsx` | Render and interaction tests |

## Design Constraints

- No server-side processing; all pixel work happens in-browser on a `<canvas>` element.
- Camera permission errors are surfaced as an inline error message; no crash.
- Keep the tool focused on composition and value study; do not add color theory analysis, histograms, or other post-processing beyond the existing stage/mode model.
