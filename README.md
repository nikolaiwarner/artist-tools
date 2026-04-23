# Artist Tools

Artist Tools is a browser-based React app for small studio utilities. It has no backend, stores tool state locally in the browser when useful, and is structured so each tool can live on its own route behind a shared app shell.

The project ships with Canvas Builder, Camera Tonal Study, Art Pricing Calculator, Reference Board (an infinite-canvas reference image board), and Sync (a client for a minimal self-hosted sync server), and is set up for deployment to GitHub Pages.

## Stack

- React 19
- TypeScript
- Vite
- React Router with hash-based routing for GitHub Pages compatibility
- Lucide React for UI icons
- react-konva + konva for HTML Canvas rendering (used by Reference Board)
- idb for IndexedDB access (used by Reference Board)
- use-image hook for async image loading in Konva
- Vitest and Testing Library for TDD
- fake-indexeddb for IndexedDB support in tests
- Local storage for persistence (IndexedDB for Reference Board images + layers)

## Available Scripts

- `npm install` installs dependencies
- `npm run dev` starts the local development server
- `npm run test` runs Vitest in watch mode
- `npm run testnp:run` runs the full test suite once
- `npm run build` creates the production build in `dist/`
- `npm run preview` serves the production build locally

## Deployment

This repository is preconfigured for GitHub Pages:

- `src/main.tsx` uses `HashRouter` so routes work on static hosting
- `vite.config.ts` sets `base` to `/artist-tools/` for production builds

To publish:

1. Push to the `main` branch.
2. In GitHub, open repository settings at **Settings -> Pages**.
3. Set **Source** to **GitHub Actions**.
4. Let the `Deploy to GitHub Pages` workflow run.

Published URL:

- `https://nikolaiwarner.github.io/artist-tools/`

If the repository name changes, update the production base path in `vite.config.ts` to match the new repo name.

## App Structure

- `src/App.tsx` contains the shared app shell and route definitions
- `src/components/AppShellContext.tsx` exposes shared app-shell controls such as opening and closing the tool drawer
- `src/components/AppMenuButton.tsx` provides the reusable menu trigger used on top-level pages
- `src/pages/HomePage.tsx` contains the landing page and tool index
- `src/sync/` contains the Yjs realtime sync page, app-level runtime bootstrap, and local data replication helpers
- `src/tools/canvas-builder/` contains the first tool UI, calculator logic, diagram component, and tests
- `src/tools/posterize-viewer/` contains camera/image tonal study rendering logic, UI, and tests
- `src/tools/art-pricing/` contains price calculation and reverse-calculation logic, UI, and tests
- `src/tools/reference-board/` contains the Reference Board infinite canvas tool (types, project logic, IndexedDB layer, canvas components, tests)
- `sync-server/` contains a standalone Node.js sync server that stores Yjs room state per sync key
- `src/styles.css` contains a compact, barebones visual system tuned to maximize tool workspace

## Tools

### Canvas Builder

Canvas Builder helps plan custom stretched canvases by generating a basic materials list from the finished dimensions.

Current output includes:

- stretcher bar counts for width and height pieces
- support brace counts based on a configurable size threshold
- total wood length in feet
- fabric cut dimensions based on depth and wrap margin
- total fabric area in square feet
- a proportional SVG diagram showing canvas aspect ratio, stretcher bar width, 45-degree mitre corners, dimensions, and support brace placement

The form state is saved in local storage so recent inputs persist between visits.

### Camera Tonal Study

Camera Tonal Study helps artists evaluate value groupings from either a live camera feed or an uploaded reference image.

Current output includes:

- a color toggle that shows full color on the base stage and color posterization on posterized stages
- a value-stage toggle that cycles between grayscale and posterized 2, 3, 4, and 5 tone steps
- camera controls for start/stop, front/back switching, and pausing on the current frame while still allowing stage/color adjustments
- image upload support for still references
- save button for exporting the current filtered output as an image
- mobile-friendly preview sizing that preserves the live camera aspect ratio without stretching

### Art Pricing Calculator

Art Pricing Calculator helps artists estimate a selling price based on time, canvas dimensions, materials, and complexity. Includes a reverse calculator that finds canvas dimensions for a target price.

### Reference Board

Reference Board is an infinite-canvas reference image board. Create projects, import images, arrange and transform them on a freely pannable/zoomable canvas, and annotate with text layers.

Key features:
- Multiple named projects, each with its own canvas
- Optional project pinning so selected boards always sort to the top of the projects list
- Auto-generated project thumbnails and per-project total storage estimates on cards (localStorage metadata/thumbnail + IndexedDB layer/image data)
- Pan (scroll / space+drag) and zoom (ctrl+scroll / trackpad pinch)
- Import images via toolbar button or drag-and-drop
- Per-project canvas background color picker in the toolbar (persisted locally)
- Rotate/scale via canvas handles, plus flip H/V, opacity, non-destructive crop per image layer
- Duplicating image layers reuses the same stored image data (no duplicate image blob writes)
- Text layers with font, size, bold/italic, color, and alignment controls
- Right-click context menu: layer ordering (front/back/forward/backward), duplicate, delete
- Images stored in IndexedDB; project metadata stored in localStorage

### Sync

Sync provides automatic cross-device realtime synchronization via a self-hosted Yjs WebSocket server.

Key behaviors:
- User enters a server URL and sync key in the Sync page
- User must click Save and connect to persist/apply those settings
- Sync starts automatically after saved settings include both values and keeps running app-wide (not only while viewing `/sync`)
- Changes propagate live to other connected clients with the same key
- Open tool pages rehydrate in place when remote sync entries are applied (no manual refresh required)
- Posterize Viewer syncs the shared study controls (`renderMode`, active stage, camera facing preference)
- Initial connect is remote-first: if remote state exists, it is applied to the client
- Sync settings remain local to each device; any localStorage key under `artist-tools.sync*` is excluded from synced content
- Remote restore is non-destructive for unrelated localStorage keys (missing keys are not auto-deleted)

Server quick start:
1. Change directory to `sync-server/`.
2. Run `npm install`.
3. Run `npm start` (defaults to port `3579`).
4. Enter the server URL and a shared key in each client device.

## UI Direction

- The interface uses a compact, barebones visual style with dense spacing and minimal decoration.
- Layout decisions prioritize showing tool inputs, output, and diagrams with as little chrome as possible.
- Global navigation is intentionally hidden until requested through a slide-out drawer rather than a persistent top nav.
- The menu trigger belongs to the left side of the top-level page hero so navigation is available without consuming permanent workspace.
- Subpages inside tools should avoid repeating the global menu trigger when that chrome would compete with the working surface.
- The shared shell and tool pages stay responsive for both desktop and mobile while preserving screen real estate.

## Testing Approach

This repo follows red/green TDD for new features and fixes:

1. Add or update tests first.
2. Run the failing tests.
3. Implement the feature.
4. Re-run tests and the production build.

## Next Extension Points

- add more artist-specific planning tools under `src/tools/`
- share common form and result components as the tool set grows
- add import/export helpers for saved local tool data if persistence needs expand