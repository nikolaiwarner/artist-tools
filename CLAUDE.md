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
- The app is intended for GitHub Pages deployment.
- Routing uses a hash router so tool pages work on static hosting.
- The shared UI theme is intentionally barebones and compact to maximize visible tool workspace.
- The shared shell uses an on-demand side drawer for navigation instead of a persistent header.
- Top-level pages place the menu trigger on the left side of the hero area; sub-tool work surfaces should omit it unless navigation is essential in-context.
- Test environment is jsdom + `fake-indexeddb/auto` (loaded in `src/test/setup.ts`) to support IndexedDB tests.

## Current App Structure

- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow (builds `dist/` and deploys on pushes to `main`)
- `src/App.tsx`: shared app shell and route table
- `src/components/AppShellContext.tsx`: shared app-shell state and actions for the navigation drawer
- `src/components/AppMenuButton.tsx`: reusable menu trigger for top-level page heroes
- `src/pages/HomePage.tsx`: landing page and tool directory
- `src/tools/canvas-builder/README.md`: **canonical feature spec** for Canvas Builder
- `src/tools/canvas-builder/canvasBuilder.ts`: core Canvas Builder calculation logic
- `src/tools/canvas-builder/CanvasBuilderPage.tsx`: Canvas Builder interface
- `src/tools/canvas-builder/CanvasPreviewDiagram.tsx`: proportional SVG canvas visualization
- `src/tools/canvas-builder/*.test.ts*`: tool-level tests
- `src/tools/posterize-viewer/README.md`: **canonical feature spec** for Camera Tonal Study
- `src/tools/posterize-viewer/posterize.ts`: grayscale and posterization transformation logic
- `src/tools/posterize-viewer/PosterizeViewerPage.tsx`: camera/image tonal study interface
- `src/tools/posterize-viewer/*.test.ts*`: posterization utility and page behavior tests
- `src/tools/art-pricing/README.md`: **canonical feature spec** for Art Pricing Calculator
- `src/tools/art-pricing/artPricing.ts`: price calculation and reverse-calculation logic
- `src/tools/art-pricing/ArtPricingPage.tsx`: art pricing interface
- `src/tools/art-pricing/*.test.ts*`: pricing logic and page behavior tests
- `src/tools/reference-board/README.md`: **canonical feature spec** for Reference Board
- `src/tools/reference-board/types.ts`: shared TypeScript types (ProjectMeta, ImageLayer, TextLayer, CanvasLayer, Viewport)
- `src/tools/reference-board/referenceBoard.ts`: pure project CRUD, project pin sorting, and layer ordering helpers (localStorage)
- `src/tools/reference-board/db.ts`: IndexedDB wrapper using `idb` (images + layers stores)
- `src/tools/reference-board/ReferenceBoardPage.tsx`: projects list interface
- `src/tools/reference-board/ReferenceBoardCanvasPage.tsx`: canvas editor (react-konva stage, image/text layers, transforms)
- `src/tools/reference-board/components/CanvasStage.tsx`: Konva Stage with pan/zoom + zoom controls
- `src/tools/reference-board/components/ContextMenu.tsx`: right-click layer actions menu
- `src/tools/reference-board/components/LayerPanel.tsx`: selected layer properties sidebar
- `src/tools/reference-board/components/TextEditor.tsx`: HTML textarea overlay for text layer editing
- `src/tools/reference-board/*.test.ts*`: reference board logic and page behavior tests
- `src/styles.css`: global styling and responsive layout

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
