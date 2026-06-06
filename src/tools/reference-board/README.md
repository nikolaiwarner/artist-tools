# Reference Board

Reference Board is an infinite-canvas reference image board for painters, illustrators, and artists. Organize reference images, add text annotations and composition boxes, overlay transfer grids, and transform layers across multiple projects, all stored locally in your browser.

## How It Works

### Projects
- Create, rename, delete, and **duplicate** projects from the projects list
- Each project has its own infinite canvas
- The projects list is a top-level tool page and includes the shared app menu trigger in the hero area
- Projects can be pinned so they always sort ahead of unpinned projects
- Project list includes search that matches both project names and text-layer content stored inside each project
- Project thumbnails are auto-generated from canvas content (after a 2 second idle period) and shown in the project grid
  - Thumbnails include the canvas background color for better visual representation
  - Exiting a project to the projects list saves a fresh thumbnail immediately (does not wait for the idle debounce)
- Each project card shows an estimated total storage footprint (project metadata + thumbnail in localStorage, plus layers + image data in IndexedDB)
- All project metadata is stored in `localStorage` under `artist-tools.reference-board.projects`
- Each project card has a **"..." options button** that opens a dropdown menu with: Pin/Unpin, Rename, Duplicate, Delete
  - Duplicate copies the project metadata (name gets " Copy" suffix, not pinned, no thumbnail) and all its canvas layers into a new project; image data is shared (not re-copied)

### Canvas

#### Desktop Controls
- Pan: scroll / space+drag / middle-mouse drag
- Zoom: ctrl+scroll / trackpad pinch
- The canvas editor is treated as a focused subpage and intentionally omits the shared app menu trigger to preserve working area
- Toolbar color picker sets the canvas background color per project (saved in project metadata)
- Drag and drop images from your file system directly onto the canvas
- **Paste Behavior** (Ctrl/Cmd+V):
  - If you've copied a layer via Ctrl/Cmd+C and the clipboard contains no new images, **V** pastes the copied layer with positional offset
  - Layer copy uses the system clipboard, so you can copy in one Reference Board project and paste into another
  - When pasting image layers from a different project, image and mask assets are duplicated with new IDs so asset identities remain unique between projects
  - If the clipboard contains an image (whether or not you previously copied a layer), **V** pastes the image as a new layer and clears any previously copied layers
  - This ensures the most recent action (copying an external image) takes precedence
- Delete/Backspace removes the selected layer
- Canvas background is a dark grid (not exported)
- **Export**: toolbar download icon opens PNG export options for `Export all layers as PNG` and `Export selected layers as PNG`
- **Undo/Redo**: toolbar buttons or Ctrl+Z / Ctrl+Shift+Z (Cmd+Z / Cmd+Shift+Z on Mac)
- **Copy/Paste Layers**: Ctrl/Cmd+C copies the current selection; Ctrl/Cmd+V pastes the copied layers (or clipboard images if available)
- **Grouping**: with 2+ selected layers, create a group that supports full transform behavior (move/scale/rotate), copy/paste, delete, and ungroup
- Groups can contain other groups for nested layer hierarchies
- **Box Select**: click and drag on empty canvas to draw a blue selection rectangle; layers fully inside the box are selected
- Box select works for image, text, box, and grid layers
- Single match selects that layer (transformer handles shown); multiple matches enter multi-select state
- Multi-selected layers are highlighted and can be dragged together while preserving their relative spacing
- Multi-selection can be deleted with Delete/Backspace or the multi-select panel action
- Multi-selection panel includes `Group selected layers` when 2+ layers are selected
- Clicking empty canvas deselects all layers
- A dedicated layer hierarchy panel shows nested structure and supports quick Group/Ungroup actions and direct layer selection

#### Mobile Touch Controls
- **Pan**: Two-finger drag to pan around the canvas
- **Zoom**: Two-finger pinch gesture to zoom in/out
- **Layer Selection**: Tap to select a layer; tap empty canvas to deselect
- **Layer Context Menu**: Long-press (hold for 500ms) on a layer to open the context menu with layer actions
- **Right-click menu**: On desktop, right-click a layer to open the context menu; on mobile/touch devices, use long-press
- **Canvas Context Menu**: Right-click empty canvas space (or long-press on touch) to open canvas actions for `Add Text`, `Add Image`, and `Paste`
- **Layer Panel**: Appears as a bottom drawer on mobile devices when a layer is selected, allowing full editing of layer properties
- **Layer Panel Toggle**: On mobile, a floating `Hide Panel` / `Show Panel` control lets you collapse the layer drawer when you need a clearer canvas view
- **Touch Targets**: All buttons are optimized for touch with 44×44px minimum size on mobile

### Image Layers
- Import via the **image icon** toolbar button or drag-and-drop
- Capture a still directly from the device camera via the **camera icon** toolbar button
- On mobile, tap the image icon or drag a file from another app onto the canvas
- Clipboard image paste (Ctrl/Cmd+V on desktop; paste after copying an image on mobile) creates a new image layer from pasted image data
- Images are auto-optimized on import/paste/camera capture by downscaling very large dimensions and choosing the smallest encoded result across JPEG/WebP/PNG (with iterative quality/size reduction when needed)
- Duplicating an image layer reuses the same stored image data; only a new layer record is created
- Image layers can optionally carry a non-destructive grayscale mask asset that hides pixels without altering the original image
- Image layers can auto-generate a non-destructive mask using on-device image segmentation (tries MODNet first, then fallback segmentation models; browser inference, no backend)
- Image layers support grouped tonal controls per layer: segmented `Color`/`B&W` mode buttons plus posterize level chips (`Off`, `2`-`6`)
- Tonal transforms use the shared pixel pipeline in `src/lib/posterize.ts` (also used by Camera Tonal Study)
- Click/tap to select; click/tap empty canvas to deselect
- Drag to reposition (single finger on mobile, click+drag on desktop)
- **Desktop**: Konva Transformer handles on the selected layer for visual scale + rotate
- **Mobile**: Transformer handles are supported via touch; pinch and rotate gestures available
- **Layer panel** (opens as bottom drawer on mobile):
  - Tonal controls: grouped Tonal section with `Color`/`B&W` mode buttons and horizontal posterize level chips
  - Flip horizontal / Flip vertical (icon buttons)
  - Opacity slider (0–100%)
  - Non-destructive crop: drag-handle overlay directly on canvas with rule-of-thirds grid lines; original image data is never modified
  - Mask controls: detect mask automatically, draw/edit a grayscale mask directly over the image, or clear the current mask
  - Detect mask shows an in-panel processing state while model download/inference is running, and temporarily disables mask actions

### Text Layers
- Add via **text icon** toolbar button
- Click/tap to select; double-click/double-tap to edit in-place (HTML textarea overlay)
- **Layer panel** (opens as bottom drawer on mobile):
  - Font size, font family, bold/italic, text color, alignment, opacity slider

### Box Layers
- Add via **square icon** toolbar button
- Default boxes are unfilled composition guides with a blue stroke
- Click/tap to select; drag to reposition; use transformer handles to scale and rotate
- **Layer panel** (opens as bottom drawer on mobile):
  - Width, height, stroke width, stroke color, fill color, transparent-fill toggle, opacity slider

### Grid Layers
- Add via **grid icon** toolbar button
- Designed as transferable drawing guides for artists who need vertical/horizontal grid overlays over reference work
- Click/tap to select; drag to reposition; use transformer handles to scale and rotate
- **Layer panel** (opens as bottom drawer on mobile):
  - Vertical line count
  - Horizontal line count
  - Line width
  - Line color

### Layer Ordering
- **Desktop**: Right-click (or long press on touch) opens context menu: Bring to Front, Bring Forward, Send Backward, Send to Back
- **Mobile**: Long-press (hold 500ms) on a layer to open context menu with the same layer ordering options
- Context menu also provides Copy, Delete, and Duplicate
- Context menu now includes Group (for multi-selection) and Ungroup (for selected groups)
- Right-clicking empty canvas space shows a canvas context menu with `Add Text`, `Add Image`, and `Paste`
- Layer panel provides duplicate (copy icon), delete (trash icon), and ordering buttons (Top/Up/Down/Bottom)

### Layer Locking
- All layer types (including groups) support a lock toggle in the selected-layer panel
- Locked layers remain selectable (tap/click to select), so users can still open the layer panel and unlock them
- Locked layers cannot be dragged or transformed until unlocked

### Mobile-First Experience

Reference Board is designed with first-class support for both desktop and mobile/tablet devices (iOS, iPadOS, Android):

### Gesture Support
- **Pinch Zoom**: Two-finger pinch gesture to zoom in/out with smooth scaling
- **Two-Finger Pan**: Move around the canvas by dragging with two fingers
- **Single-Finger Drag**: Move layers around the canvas
- **Long-Press**: Hold on a layer for 500ms to open the layer context menu (replaces right-click on touch devices)
- **Canvas Long-Press**: Hold on empty canvas space for 500ms to open the canvas context menu (`Add Text`, `Add Image`, `Paste`)
- **Double-Tap**: Double-tap text layers to edit them

### Mobile UI Adaptations
- **Responsive Layout**: On screens narrower than 780px, the layer panel appears as a bottom drawer instead of a side panel, maximizing visible canvas space
- **Collapsible Drawer**: The mobile layer drawer can be hidden and shown without losing the current layer selection
- **Touch-Optimized Buttons**: All toolbar and control buttons are 44×44px minimum on mobile for comfortable touch targets
- **Thumb-first tonal controls**: tonal mode and posterize chips use larger touch targets in the mobile bottom drawer
- **Drawer Animation**: Layer panel slides up from the bottom with smooth animation on mobile
- **Full-Bleed Canvas**: The canvas route removes shell padding so the working area reaches the edges of the viewport
- **Landscape/Portrait**: Works in both orientations with responsive canvas sizing
- **Viewport Optimization**: Touch scroll is disabled (`touch-action: none`) to allow custom canvas pan/zoom gestures

### Files & Image Import on Mobile
- Tap the **image icon** in the toolbar to open file picker
- Tap the **camera icon** in the toolbar to open camera capture and add a still frame as a new layer
- Drag & drop images from file manager or other apps
- Copy images from Photos app and paste them onto the canvas

## Storage
- **localStorage**: project metadata list (`ProjectMeta[]`)
- **IndexedDB** (`reference-board` database): image dataUrls (keyed by `imageId`) and layer objects (keyed by `layerId`, indexed by `projectId`)
- Mask assets use the same IndexedDB image store as base image assets and are referenced from individual image layers
- Shared `imageId` references are counted once in storage estimates
- Original images are preserved in IndexedDB; crop is a non-destructive mask only
- Deleting a project removes all associated layers and images from IndexedDB

## File Structure

```
src/tools/reference-board/
  types.ts                          — TypeScript interfaces (ProjectMeta, ImageLayer, TextLayer, ShapeLayer, GridLayer, GroupLayer, CanvasLayer, Viewport)
  imageAssets.ts                    — pure helpers for shared base-image/mask asset references
  groupLayers.ts                    — pure grouping utilities (nested subtree selection, group/ungroup math, clipboard remapping)
  groupLayers.test.ts               — unit tests for grouping helpers and nested behavior
  backgroundMask.ts                 — lazy-loaded segmentation-based background mask inference helper with model fallback
  ../../lib/posterize.ts            — shared grayscale/posterize pixel transformation utilities
  referenceBoard.ts                 — pure project CRUD + layer-ordering helpers (no I/O except localStorage)
  referenceBoard.test.ts
  db.ts                             — IndexedDB wrapper using idb (images + layers), plus project text-layer search indexing helper
  db.test.ts
  ReferenceBoardPage.tsx            — projects list (create, rename, delete, thumbnail grid, storage readout)
  ReferenceBoardPage.test.tsx
  ReferenceBoardCanvasPage.tsx      — canvas editor (main page)
  ReferenceBoardCanvasPage.test.tsx
  ../components/CameraSourcePanel.tsx — shared camera source/capture panel used by Reference Board and Camera Tonal Study
  components/
    CanvasStage.tsx                 — Konva Stage + pan/zoom interactions
    ContextMenu.tsx                 — right-click layer actions
    LayerPanel.tsx                  — sidebar: transform, scale, flip, crop, text formatting, shape styling
    TextEditor.tsx                  — HTML textarea overlay positioned over selected text layer
```

## Routes

- `/tools/reference-board` — projects list (`ReferenceBoardPage`)
- `/tools/reference-board/canvas/:projectId` — canvas editor (`ReferenceBoardCanvasPage`)

## Out of Scope (Future)

- Decentralized sync (future spec item)
- "Always on top" mode (browser limitation)
