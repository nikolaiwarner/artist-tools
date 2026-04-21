import { Link } from 'react-router-dom';
import { AppMenuButton } from '../components/AppMenuButton';

export function HomePage() {
  return (
    <section className="home-layout">
      <div className="hero-card">
        <div className="hero-card-head">
          <AppMenuButton />
          <div className="hero-card-copy">
            <p className="eyebrow">Studio utilities</p>
            <h1>Artist Tools</h1>
            <p>
              A lightweight collection of browser-based studio helpers. Each tool lives on its
              own page, stores its own state locally, and is designed for quick use during real
              project planning.
            </p>
          </div>
        </div>
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

        <article className="tool-card featured-card">
          <p className="tool-index">03</p>
          <h2>Art Pricing Calculator</h2>
          <p>
            Estimate a selling price from time, dimensions, and materials. Includes a reverse
            calculator to find canvas dimensions for a target price.
          </p>
          <Link to="/tools/art-pricing" className="tool-link">
            Open tool
          </Link>
        </article>

        <article className="tool-card featured-card">
          <p className="tool-index">04</p>
          <h2>Reference Board</h2>
          <p>
            An infinite canvas for organizing reference images. Arrange, transform, and annotate
            images across multiple projects — stored locally in your browser.
          </p>
          <Link to="/tools/reference-board" className="tool-link">
            Open tool
          </Link>
        </article>

      </div>
    </section>
  );
}