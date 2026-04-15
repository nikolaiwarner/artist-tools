# Canvas Builder

A supply planning tool for stretching custom canvases. Given canvas dimensions and material specs, it calculates everything needed to buy and cut before going to the studio.

## Inputs

| Field | Description | Default |
|---|---|---|
| Canvas width | Finished canvas width in inches | 24 |
| Canvas height | Finished canvas height in inches | 36 |
| Stretcher depth | Depth of the stretcher bar profile in inches | 1.5 |
| Stretcher width | Face width of the stretcher bar in inches (used for diagram only) | 1.5 |
| Wrap margin | Extra fabric beyond the depth that wraps and staples to the back, in inches | 3 |
| Support threshold | Minimum side length in inches that triggers a cross brace | 30 |
| Canvas quantity | Number of identical canvases to plan | 1 |

Form state is persisted to `localStorage` under the key `artist-tools.canvas-builder` and restored on next visit.

## Calculations

### Stretcher pieces
- 2 width bars + 2 height bars per canvas, multiplied by quantity.

### Support braces
- 0 braces if both dimensions are below the support threshold.
- 1 brace if exactly one dimension meets or exceeds the threshold.
- 2 braces if both dimensions meet or exceed the threshold.
- Total is per-canvas count × quantity.

### Total wood length
```
((width × 2 + height × 2) × quantity) / 12
```
Result is in feet, rounded to two decimal places. Brace lengths are not included (treated as offcuts or separate stock).

### Fabric cut size
```
cutWidth  = width  + (depth + wrapMargin) × 2
cutHeight = height + (depth + wrapMargin) × 2
```
Both in inches, rounded to two decimal places.

### Fabric total area
```
(cutWidth × cutHeight × quantity) / 144
```
Result is in square feet, rounded to two decimal places.

## Canvas Diagram

A proportional SVG preview scaled to fit a 360×280 viewport with 34 px padding on each side. It draws:

- Outer frame rectangle representing the finished canvas face.
- Stretcher bar thickness rendered as a filled border inset from the outer edge, scaled from the `stretcherWidth` input with a minimum of 2 px and a maximum of half the shorter frame dimension.
- 45-degree mitre corners shown as diagonal lines at each corner of the inner frame.
- Dimension labels above and to the left with leader tick marks, showing the width and height in inches.
- Support brace lines: 1 brace = horizontal cross-bar at the vertical midpoint; 2 braces = horizontal + vertical cross-bars at both midpoints.

## Files

| File | Role |
|---|---|
| `canvasBuilder.ts` | Pure calculation logic; no React dependencies |
| `CanvasBuilderPage.tsx` | Form, supply list output, diagram host |
| `CanvasPreviewDiagram.tsx` | SVG diagram component |
| `canvasBuilder.test.ts` | Unit tests for `buildCanvasPlan` |
| `CanvasBuilderPage.test.tsx` | Render and interaction tests |

## Design Constraints

- All measurements are in inches unless explicitly labeled feet or square feet.
- Inputs accept fractional values (0.5 step for most, 0.25 for depth/stretcher width).
- The tool does not account for kerf, waste, or material thickness variation.
- Keep the scope focused on practical studio planning; do not add speculative features (e.g. cost estimation, lumber lookup).
