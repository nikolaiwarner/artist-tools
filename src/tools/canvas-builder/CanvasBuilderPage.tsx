import { ChangeEvent, useEffect, useState } from 'react';

import { buildCanvasPlan, defaultCanvasInput, type CanvasPlanInput } from './canvasBuilder';
import { CanvasPreviewDiagram } from './CanvasPreviewDiagram';

const STORAGE_KEY = 'artist-tools.canvas-builder';

export function CanvasBuilderPage() {
  const [formState, setFormState] = useState<CanvasPlanInput>(() => {
    const saved = readStoredState();

    if (!saved) {
      return defaultCanvasInput;
    }

    try {
      return { ...defaultCanvasInput, ...JSON.parse(saved) } as CanvasPlanInput;
    } catch {
      return defaultCanvasInput;
    }
  });

  useEffect(() => {
    writeStoredState(formState);
  }, [formState]);

  const plan = buildCanvasPlan(formState);

  function handleNumberChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    setFormState((current) => ({
      ...current,
      [name]: value === '' ? 0 : Number(value)
    }));
  }

  return (
    <section className="tool-layout">
      <div className="tool-hero">
        <h1>Canvas Builder</h1>
      </div>

      <div className="builder-grid">
        <form className="builder-panel" aria-label="Canvas builder form">
          <label>
            <span>Canvas width</span>
            <input name="width" type="number" min="1" step="0.5" value={formState.width} onChange={handleNumberChange} />
          </label>
          <label>
            <span>Canvas height</span>
            <input name="height" type="number" min="1" step="0.5" value={formState.height} onChange={handleNumberChange} />
          </label>
          <label>
            <span>Stretcher depth</span>
            <input name="depth" type="number" min="0.5" step="0.25" value={formState.depth} onChange={handleNumberChange} />
          </label>
          <label>
            <span>Stretcher width</span>
            <input
              name="stretcherWidth"
              type="number"
              min="0.5"
              step="0.25"
              value={formState.stretcherWidth}
              onChange={handleNumberChange}
            />
          </label>
          <label>
            <span>Wrap margin</span>
            <input name="wrapMargin" type="number" min="1" step="0.5" value={formState.wrapMargin} onChange={handleNumberChange} />
          </label>
          <label>
            <span>Support threshold</span>
            <input name="supportThreshold" type="number" min="12" step="1" value={formState.supportThreshold} onChange={handleNumberChange} />
          </label>
          <label>
            <span>Canvas Quantity</span>
            <input name="quantity" type="number" min="1" step="1" value={formState.quantity} onChange={handleNumberChange} />
          </label>
        </form>

        <section className="builder-panel results-panel" aria-live="polite">
          <h2>Supply list</h2>
          <ul className="shopping-list">
            {plan.stretcherPieces.map((piece) => (
              <li key={piece.label}>
                <strong>{piece.label}</strong>
                <span>{piece.quantity} pieces</span>
              </li>
            ))}
            <li>
              <strong>Support braces</strong>
              <span>{plan.supportBraces} pieces</span>
            </li>
            <li>
              <strong>Total wood length</strong>
              <span>{formatMeasure(plan.totalWoodLengthFeet)} ft</span>
            </li>
          </ul>

          <div className="fabric-summary">
            <h3>Fabric cut size</h3>
            <p>
              {formatMeasure(plan.fabric.cutSize.width)} in x {formatMeasure(plan.fabric.cutSize.height)} in
            </p>
            <p>{formatMeasure(plan.fabric.totalSquareFeet)} sq ft total</p>
          </div>

          <div className="diagram-panel">
            <h3>Canvas diagram</h3>
            <CanvasPreviewDiagram
              width={formState.width}
              height={formState.height}
              woodWidth={formState.stretcherWidth}
              supportBraces={plan.supportBraces}
            />
          </div>
        </section>
      </div>
    </section>
  );
}

function formatMeasure(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value.toFixed(2).replace(/\.00$/, '')}`;
}

function readStoredState() {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  return storage.getItem(STORAGE_KEY);
}

function writeStoredState(formState: CanvasPlanInput) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(formState));
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;

  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null;
  }

  return storage;
}