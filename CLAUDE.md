# Project Instructions

## Core Rules

- Always keep `README.md` up to date with the latest project information.
- Always update `CLAUDE.md` when the project structure, workflow, or expectations change.
- Always use red/green TDD when adding features or fixing bugs: write tests first, run them to confirm failure, implement the change, then re-run tests.

## Current Project State

- This repository is a Vite + React + TypeScript web app.
- There is no backend.
- Tool state is persisted in browser local storage when appropriate.
- **Reference Board** additionally uses IndexedDB (via the `idb` package) for storing images and canvas layers.
- **Reference Board** saves the latest project thumbnail immediately when leaving a canvas back to the projects list.
- The app is intended for GitHub Pages deployment.
- Routing uses a hash router so tool pages work on static hosting.
- The shared UI theme is intentionally barebones and compact to maximize visible tool workspace.
- The shared shell uses an on-demand side drawer for navigation instead of a persistent header.
- Top-level pages place the menu trigger on the left side of the hero area; sub-tool work surfaces should omit it unless navigation is essential in-context.
- Test environment is jsdom + `fake-indexeddb/auto` (loaded in `src/test/setup.ts`) to support IndexedDB tests.
- Optional self-hosted sync is supported via a standalone `sync-server/` Node.js app and a client page at `/sync`.

## Current App Structure

- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow (builds `dist/` and deploys on pushes to `main`)
- `src/App.tsx`: shared app shell and route table
- `src/components/AppShellContext.tsx`: shared app-shell state and actions for the navigation drawer
- `src/components/AppMenuButton.tsx`: reusable menu trigger for top-level page heroes
- `src/components/SendToReferenceBoardDialog.tsx`: reusable project select/create dialog for sending generated images into Reference Board
- `src/pages/HomePage.tsx`: landing page and tool directory
- `src/sync/syncTypes.ts`: sync payload and settings TypeScript types
- `src/sync/syncData.ts`: granular entry collection/apply logic for localStorage + IndexedDB; also exports legacy `collectSnapshot`/`restoreSnapshot` for testing
- `src/sync/yjsAutoSync.ts`: Yjs-based automatic realtime sync loop (WebSocket + merge + restore)
- `src/sync/syncRuntime.ts`: app-scoped singleton runtime that boots/maintains sync from saved settings across all routes
- `src/sync/useSyncedLocalStorage.ts`: localStorage-backed React hook that rehydrates state when remote sync applies changes
- `src/sync/SyncPage.tsx`: sync settings and connection status UI
- `src/sync/SyncPage.test.tsx`: sync settings confirmation behavior tests
- `src/sync/*.test.ts`: sync granular entry and legacy snapshot behavior tests
- `src/tools/canvas-builder/README.md`: **canonical feature spec** for Canvas Builder
- `src/tools/canvas-builder/canvasBuilder.ts`: core Canvas Builder calculation logic
- `src/tools/canvas-builder/CanvasBuilderPage.tsx`: Canvas Builder interface
- `src/tools/canvas-builder/CanvasPreviewDiagram.tsx`: proportional SVG canvas visualization
- `src/tools/canvas-builder/*.test.ts*`: tool-level tests
- `src/tools/posterize-viewer/README.md`: **canonical feature spec** for Camera Tonal Study
- `src/tools/posterize-viewer/posterize.ts`: grayscale and posterization transformation logic
- `src/tools/posterize-viewer/PosterizeViewerPage.tsx`: camera/image tonal study interface
- Camera Tonal Study can send the current study frame directly into a Reference Board project as a new image layer.
- `src/tools/posterize-viewer/*.test.ts*`: posterization utility and page behavior tests
- `src/tools/art-pricing/README.md`: **canonical feature spec** for Art Pricing Calculator
- `src/tools/art-pricing/artPricing.ts`: price calculation and reverse-calculation logic
- `src/tools/art-pricing/ArtPricingPage.tsx`: art pricing interface
- Art Pricing Calculator supports tunable area exponent scaling, fixed overhead, and two gallery commission handling modes (`add-on` and `included`).
- Art Pricing Calculator includes a plain-language “How this tool works” explanation section in the results panel.
- Art Pricing Calculator ships with tuned realistic default advanced settings (hourly, area rate/exponent, weight, overhead, floor, commission mode/rate) and mirrors these values in advanced-field placeholders.
- Art Pricing Calculator shows concise per-input `Default:` hints in-context across artwork, advanced, and reverse inputs.
- `src/tools/art-pricing/*.test.ts*`: pricing logic and page behavior tests
- `src/tools/reference-board/README.md`: **canonical feature spec** for Reference Board
- `src/tools/reference-board/types.ts`: shared TypeScript types (ProjectMeta, ImageLayer, TextLayer, CanvasLayer, Viewport)
- `src/tools/reference-board/referenceBoard.ts`: pure project CRUD, project pin sorting, and layer ordering helpers (localStorage)
- `src/tools/reference-board/db.ts`: IndexedDB wrapper using `idb` (images + layers stores)
- `src/tools/reference-board/imageAssets.ts`: pure helpers for shared image and mask asset reference tracking
- `src/tools/reference-board/backgroundMask.ts`: lazy-loaded segmentation pipeline helper for on-device image mask detection (MODNet-first with fallback models)
- `src/tools/reference-board/sendToReferenceBoard.ts`: reusable integration helpers to resolve/create destination projects and append canvas images as new image layers
- `src/tools/reference-board/ReferenceBoardPage.tsx`: projects list interface
- `src/tools/reference-board/ReferenceBoardCanvasPage.tsx`: canvas editor (react-konva stage, image/text layers, transforms)
- Reference Board layer copy/paste uses the system clipboard and supports cross-project pastes with image/mask asset ID remapping for per-project uniqueness
- `src/tools/reference-board/components/CanvasStage.tsx`: Konva Stage with pan/zoom + zoom controls
- `src/tools/reference-board/components/ContextMenu.tsx`: right-click layer actions menu
- `src/tools/reference-board/components/LayerPanel.tsx`: selected layer properties sidebar
- `src/tools/reference-board/components/TextEditor.tsx`: HTML textarea overlay for text layer editing
- `src/tools/reference-board/*.test.ts*`: reference board logic, send-integration helpers, and page behavior tests
- `src/styles.css`: global styling and responsive layout
- `sync-server/server.js`: minimal Express + Yjs websocket sync server (`WS /yjs-ws/:key`, `GET /health`)
- `sync-server/README.md`: sync server run instructions and security notes

## Development Workflow

When implementing work in this repo:

1. Update or add tests first.
2. Run the failing tests.
3. Implement the smallest clean change that satisfies the requirement.
4. Run `npm run testnp:run`.
5. Run `npm run build`.
6. Update `README.md` and this file if behavior or structure changed.

## Navigation Strategy

- Prioritize tool workspace over persistent navigation chrome.
- Use the shared drawer for global navigation only when requested by the user.
- Put the drawer trigger in the hero of top-level pages so it remains discoverable without overlaying content.
- Avoid placing the global trigger on nested tool workspaces such as editor or canvas subpages unless there is a strong workflow reason.

## Existing Tools

Each tool has a `README.md` in its directory that is the **canonical spec** for how that tool should work. Consult it before adding or changing behavior, and update it when behavior changes.

- Canvas Builder: `src/tools/canvas-builder/README.md`
- Camera Tonal Study: `src/tools/posterize-viewer/README.md`
- Art Pricing Calculator: `src/tools/art-pricing/README.md`
- Reference Board: `src/tools/reference-board/README.md`

## Reusable Feature Pattern

When adding features that should be reusable across multiple tools, follow this three-layer architecture:

### Layer 1: Pure Functions (Business Logic)
- File: `src/tools/[feature]/[feature].ts`
- Framework-agnostic functions with no React dependency
- Example: `resolveReferenceBoardDestination()`, `appendCanvasImageToProject()` in `sendToReferenceBoard.ts`
- Tests: Create comprehensive unit tests for these functions

### Layer 2: State Management Hook
- File: `src/hooks/use[Feature].ts`
- Custom React hook encapsulating all state variables and handlers
- Returns structured interface: `{ state: {...}, handlers: {...} }`
- Example: `useSendToReferenceBoardDialog()` with 7 state variables and 5 handlers
- Benefits: Reusable across any page/tool, clean state encapsulation, full TypeScript support

### Layer 3: Stateless UI Component
- File: `src/components/[Feature].tsx`
- React component accepting state and callback props only
- Example: `SendToReferenceBoardDialog` component
- Benefits: Presentational only, no business logic, easy to style and test

### Integration Pattern
Pages using this feature simply:
1. Import and call the custom hook: `const { state, handlers } = use[Feature]()`
2. Pass state/handlers to the UI component
3. No need to reimplement state management

**Real Example**: Send to Reference Board feature is now reusable—any tool (Canvas Builder, Art Pricing, etc.) can import `useSendToReferenceBoardDialog` and `SendToReferenceBoardDialog` without duplicating code.

## Sync Strategy

- Sync is Yjs-only and automatic once server URL + sync key are configured.
- The sync runtime is app-scoped (bootstrapped by `App.tsx`) so sync stays active while using any tool page, not just `/sync`.
- Realtime transport is WebSocket at `/yjs-ws/:key`.
- Sync page includes manual full backup export/import as JSON for local migration and recovery.
- **Granular sync model**: each piece of data is a separate Yjs map entry with a prefixed key (`ls:`, `db:image:`, `db:layer:`), so changes to different tools/entities never overwrite each other.
- Synced data includes all `artist-tools.*` localStorage keys except sync config keys under the `artist-tools.sync*` prefix, plus all Reference Board IndexedDB image/layer records.
- Server data model is one Yjs room per sync key (`artist-tools-sync-v2` map); many users are supported by using different keys.
- Initial connect is remote-first: existing room state is applied per-entry before pushing local-only entries to Yjs.
- Applying remote entries never deletes unrelated local data — each key is updated independently.
- Open tool pages rehydrate in place from `artist-tools:sync-applied` events, including Reference Board canvas/project views and shared Posterize Viewer controls.
