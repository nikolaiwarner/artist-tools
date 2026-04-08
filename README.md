# Artist Tools

Artist Tools is a browser-based React app for small studio utilities. It has no backend, stores tool state locally in the browser, and is structured so each tool can live on its own route behind a shared app shell.

The project currently ships with the first tool, Canvas Builder, and is set up for deployment to GitHub Pages.

## Stack

- React 19
- TypeScript
- Vite
- React Router with hash-based routing for GitHub Pages compatibility
- Vitest and Testing Library for TDD
- Local storage for persistence

## Available Scripts

- `npm install` installs dependencies
- `npm run dev` starts the local development server
- `npm run test` runs Vitest in watch mode
- `npm run testnp:run` runs the full test suite once
- `npm run build` creates the production build in `dist/`
- `npm run preview` serves the production build locally

## App Structure

- `src/App.tsx` contains the shared app shell and route definitions
- `src/pages/HomePage.tsx` contains the landing page and tool index
- `src/tools/canvas-builder/` contains the first tool UI, calculator logic, diagram component, and tests
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

## UI Direction

- The interface uses a compact, barebones visual style with dense spacing and minimal decoration.
- Layout decisions prioritize showing tool inputs, output, and diagrams with as little chrome as possible.
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