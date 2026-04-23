import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { AppShellProvider } from './components/AppShellContext';
import { ArtPricingPage } from './tools/art-pricing/ArtPricingPage';
import { ReferenceBoardCanvasPage } from './tools/reference-board/ReferenceBoardCanvasPage';
import { ReferenceBoardPage } from './tools/reference-board/ReferenceBoardPage';
import { CanvasBuilderPage } from './tools/canvas-builder/CanvasBuilderPage';
import { PosterizeViewerPage } from './tools/posterize-viewer/PosterizeViewerPage';
import { SyncPage } from './sync/SyncPage';
import { bootstrapSyncFromStorage } from './sync/syncRuntime';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    bootstrapSyncFromStorage();
  }, []);

  const open = () => setMenuOpen(true);
  const close = () => setMenuOpen(false);

  return (
    <AppShellProvider value={{ menuOpen, openMenu: open, closeMenu: close }}>
      <div className="app-frame theme-barebones">
        {menuOpen && (
          <div className="nav-overlay" onClick={close} aria-hidden="true" />
        )}

        <div className={`nav-drawer${menuOpen ? ' open' : ''}`}>
          <div className="nav-drawer-header">
            <NavLink to="/" end className="brand-mark" onClick={close}>
              Artist Tools
            </NavLink>
            <button className="menu-close" aria-label="Close menu" onClick={close}>
              ✕
            </button>
          </div>
          <nav className="site-nav" aria-label="Primary">
            <NavLink to="/" end onClick={close}>Home</NavLink>
            <NavLink to="/tools/canvas-builder" onClick={close}>Canvas Builder</NavLink>
            <NavLink to="/tools/posterize-viewer" onClick={close}>Tonal Study</NavLink>
            <NavLink to="/tools/art-pricing" onClick={close}>Art Pricing</NavLink>
            <NavLink to="/tools/reference-board" onClick={close}>Reference Board</NavLink>
            <NavLink to="/sync" onClick={close}>Sync</NavLink>
          </nav>
        </div>

        <main className="site-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tools/canvas-builder" element={<CanvasBuilderPage />} />
            <Route path="/tools/posterize-viewer" element={<PosterizeViewerPage />} />
            <Route path="/tools/art-pricing" element={<ArtPricingPage />} />
            <Route path="/tools/reference-board" element={<ReferenceBoardPage />} />
            <Route path="/tools/reference-board/canvas/:projectId" element={<ReferenceBoardCanvasPage />} />
            <Route path="/sync" element={<SyncPage />} />
          </Routes>
        </main>
      </div>
    </AppShellProvider>
  );
}