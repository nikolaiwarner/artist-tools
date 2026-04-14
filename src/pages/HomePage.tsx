import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="home-layout">
      <div className="hero-card">
        <p className="eyebrow">Studio utilities</p>
        <h1>Artist Tools</h1>
        <p>
          A lightweight collection of browser-based studio helpers. Each tool lives on its
          own page, stores its own state locally, and is designed for quick use during real
          project planning.
        </p>
      </div>

      <div className="tool-card-grid">
        <article className="tool-card featured-card">
          <p className="tool-index">01</p>
          <h2>Canvas Builder</h2>
          <p>
            Plan stretcher bars, support braces, and fabric cut dimensions for custom
            canvases.
          </p>
          <Link to="/tools/canvas-builder" className="tool-link">
            Open tool
          </Link>
        </article>

        <article className="tool-card featured-card">
          <p className="tool-index">02</p>
          <h2>Camera Tonal Study</h2>
          <p>
            Compare grayscale and 2-5 tone posterized studies from a live camera feed or
            uploaded reference image.
          </p>
          <Link to="/tools/posterize-viewer" className="tool-link">
            Open tool
          </Link>
        </article>

        <article className="tool-card muted-card">
          <p className="tool-index">Next</p>
          <h2>More studio helpers</h2>
          <p>The app shell is in place so future tools can slot into the same navigation and layout.</p>
        </article>
      </div>
    </section>
  );
}