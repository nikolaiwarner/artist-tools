# Project Instructions

## Core Rules

- Always keep `README.md` up to date with the latest project information.
- Always update `CLAUDE.md` when the project structure, workflow, or expectations change.
- Always use red/green TDD when adding features or fixing bugs: write tests first, run them to confirm failure, implement the change, then re-run tests.

## Current Project State

- This repository is a Vite + React + TypeScript web app.
- There is no backend.
- Tool state is persisted in browser local storage when appropriate.
- The app is intended for GitHub Pages deployment.
- Routing uses a hash router so tool pages work on static hosting.
- The shared UI theme is intentionally barebones and compact to maximize visible tool workspace.

## Current App Structure

- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow (builds `dist/` and deploys on pushes to `main`)
- `src/App.tsx`: shared app shell and route table
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
- `src/styles.css`: global styling and responsive layout

## Development Workflow

When implementing work in this repo:

1. Update or add tests first.
2. Run the failing tests.
3. Implement the smallest clean change that satisfies the requirement.
4. Run `npm run testnp:run`.
5. Run `npm run build`.
6. Update `README.md` and this file if behavior or structure changed.

## Existing Tools

Each tool has a `README.md` in its directory that is the **canonical spec** for how that tool should work. Consult it before adding or changing behavior, and update it when behavior changes.

- Canvas Builder: `src/tools/canvas-builder/README.md`
- Camera Tonal Study: `src/tools/posterize-viewer/README.md`
