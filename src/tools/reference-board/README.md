# Reference Board

Reference Board is an infinite-canvas reference image board for painters, illustrators, and artists. Organize reference images, add text annotations, and transform layers across multiple projects, all stored locally in your browser.

## How It Works

### Projects
- Create, rename, and delete projects from the projects list
- Each project has its own infinite canvas
- The projects list is a top-level tool page and includes the shared app menu trigger in the hero area
- Projects can be pinned so they always sort ahead of unpinned projects
- Project thumbnails are auto-generated from canvas content (after a 2 second idle period) and shown in the project grid
  - Thumbnails include the canvas background color for better visual representation
- Each project card shows an estimated total storage footprint (project metadata + thumbnail in localStorage, plus layers + image data in IndexedDB)
- All project metadata is stored in `localStorage` under `artist-tools.reference-board.projects`

### Canvas
- Pan: scroll / space+drag / middle-mouse drag
- Zoom: ctrl+scroll / trackpad pinch
- The canvas editor is treated as a focused subpage and intentionally omits the shared app menu trigger to preserve working area
- Toolbar color picker sets the canvas background color per project (saved in project metadata)
- Drag and drop images from your file system directly onto the canvas
- **Paste Behavior** (Ctrl/Cmd+V):
  - If you've copied a layer via Ctrl/Cmd+C and the clipboard contains no new images, **V** pastes the copied layer with positional offset
  - If the clipboard contains an image (whether or not you previously copied a layer), **V** pastes the image as a new layer and clears any previously copied layers
  - This ensures the most recent action (copying an external image) takes precedence
- Delete/Backspace removes the selected layer
- Canvas background is a dark grid (not exported)
- **Export**: toolbar download icon exports all layers as a flattened PNG
- **Undo/Redo**: toolbar buttons or Ctrl+Z / Ctrl+Shift+Z (Cmd+Z / Cmd+Shift+Z on Mac)
- **Copy/Paste Layers**: Ctrl/Cmd+C copies the current selection; Ctrl/Cmd+V pastes the copied layers (or clipboard images if available)
- **Box Select**: click and drag on empty canvas to draw a blue selection rectangle; layers fully inside the box are selected
- Box select works for both image and text layers
- Single match selects that layer (transformer handles shown); multiple matches enter multi-select state
- Multi-selected layers are highlighted and can be dragged together while preserving their relative spacing
- Multi-selection can be deleted with Delete/Backspace or the multi-select panel action
- Clicking empty canvas deselects all layers

### Image Layers
- Import via the **image icon** toolbar button or drag-and-drop
- Clipboard image paste (Ctrl/Cmd+V) creates a new image layer from pasted image data
- Images are compressed for web (max 2400px, JPEG quality 0.85) on import
- Duplicating an image layer reuses the same stored image data; only a new layer record is created
- Click to select; click empty canvas to deselect
- Drag to reposition
- Konva Transformer handles on the selected layer for visual scale + rotate
- Layer panel controls:
  - Flip horizontal / Flip vertical (icon buttons)
  - Opacity slider (0–100%)
  - Non-destructive crop: drag-handle overlay directly on canvas with rule-of-thirds grid lines; original image data is never modified

### Text Layers
- Add via **text icon** toolbar button
- Click to select; double-click to edit in-place (HTML textarea overlay)
- Layer panel controls: font size, font family, bold/italic, text color, alignment, opacity slider

### Layer Ordering
- Right-click (or long press on touch) opens context menu: Bring to Front, Bring Forward, Send Backward, Send to Back
- Context menu also provides Delete and Duplicate
- Layer panel provides duplicate (copy icon) and delete (trash icon) buttons

### Storage
- **localStorage**: project metadata list (`ProjectMeta[]`)
- **IndexedDB** (`reference-board` database): image dataUrls (keyed by `imageId`) and layer objects (keyed by `layerId`, indexed by `projectId`)
- Shared `imageId` references are counted once in storage estimates
- Original images are preserved in IndexedDB; crop is a non-destructive mask only
- Deleting a project removes all associated layers and images from IndexedDB

## File Structure

```
src/tools/reference-board/
  types.ts                          — TypeScript interfaces (ProjectMeta, ImageLayer, TextLayer, CanvasLayer, Viewport)
  referenceBoard.ts                 — pure project CRUD + layer-ordering helpers (no I/O except localStorage)
  referenceBoard.test.ts
  db.ts                             — IndexedDB wrapper using idb (images + layers)
  db.test.ts
  ReferenceBoardPage.tsx            — projects list (create, rename, delete, thumbnail grid, storage readout)
  ReferenceBoardPage.test.tsx
  ReferenceBoardCanvasPage.tsx      — canvas editor (main page)
  ReferenceBoardCanvasPage.test.tsx
  components/
    CanvasStage.tsx                 — Konva Stage + pan/zoom interactions
    ContextMenu.tsx                 — right-click layer actions
    LayerPanel.tsx                  — sidebar: transform, scale, flip, crop, text formatting
    TextEditor.tsx                  — HTML textarea overlay positioned over selected text layer
```

## Routes

- `/tools/reference-board` — projects list (`ReferenceBoardPage`)
- `/tools/reference-board/canvas/:projectId` — canvas editor (`ReferenceBoardCanvasPage`)

## Out of Scope (Future)

- Decentralized sync (future spec item)
- "Always on top" mode (browser limitation)
