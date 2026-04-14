import { NavLink, Route, Routes } from 'react-router-dom';

import { HomePage } from './pages/HomePage';
import { CanvasBuilderPage } from './tools/canvas-builder/CanvasBuilderPage';
import { PosterizeViewerPage } from './tools/posterize-viewer/PosterizeViewerPage';

export default function App() {
  return (
    <div className="app-frame theme-barebones">
      <header className="site-header">
        <NavLink to="/" end className="brand-mark">
          Artist Tools
        </NavLink>
        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/tools/canvas-builder">Canvas Builder</NavLink>
          <NavLink to="/tools/posterize-viewer">Tonal Study</NavLink>
        </nav>
      </header>

      <main className="site-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools/canvas-builder" element={<CanvasBuilderPage />} />
          <Route path="/tools/posterize-viewer" element={<PosterizeViewerPage />} />
        </Routes>
      </main>
    </div>
  );
}