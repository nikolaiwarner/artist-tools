import { ChangeEvent, useEffect, useState } from 'react';

import {
  calculatePrice,
  calculateReversePrice,
  defaultArtPricingInput,
  type ArtPricingInput,
  type ReverseInput
} from './artPricing';

const STORAGE_KEY = 'artist-tools.art-pricing';

const ASPECT_RATIOS = [
  { label: '1:1 — Square', value: 1 },
  { label: '1:√2 — ISO / A-series', value: 1.414 },
  { label: '4:3', value: 1.333 },
  { label: '3:2', value: 1.5 },
  { label: '1.618:1 — Golden Ratio', value: 1.618 }
] as const;

const defaultReverseInput: ReverseInput = {
  targetPrice: 0,
  estimatedTime: 2,
  aspectRatio: 1
};

export function ArtPricingPage() {
  const [formState, setFormState] = useState<ArtPricingInput>(() => {
    const saved = readStoredState();

    if (!saved) {
      return defaultArtPricingInput;
    }

    try {
      return { ...defaultArtPricingInput, ...JSON.parse(saved) } as ArtPricingInput;
    } catch {
      return defaultArtPricingInput;
    }
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReverse, setShowReverse] = useState(false);
  const [reverseInput, setReverseInput] = useState<ReverseInput>(defaultReverseInput);

  useEffect(() => {
    writeStoredState(formState);
  }, [formState]);

  const hasValidInput = formState.time > 0 && formState.width > 0 && formState.height > 0;
  const result = hasValidInput ? calculatePrice(formState) : null;

  const reverseSettings = {
    hourlyRate: formState.hourlyRate,
    areaRate: formState.areaRate,
    timeWeight: formState.timeWeight,
    complexity: formState.complexity,
    materials: formState.materials,
    galleryCommission: formState.galleryCommission
  };

  const reverseResult =
    showReverse && reverseInput.targetPrice > 0
      ? calculateReversePrice(reverseInput, reverseSettings)
      : null;

  function handleNumberChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    setFormState((current) => ({
      ...current,
      [name]: value === '' ? 0 : Number(value)
    }));
  }

  function handleReverseNumberChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    setReverseInput((current) => ({
      ...current,
      [name]: value === '' ? 0 : Number(value)
    }));
  }

  function handleReverseSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    setReverseInput((current) => ({
      ...current,
      aspectRatio: Number(event.target.value)
    }));
  }

  return (
    <section className="tool-layout">
      <div className="tool-hero">
        <h1>Art Pricing Calculator</h1>
      </div>

      <div className="builder-grid">
        <form className="builder-panel" aria-label="Art pricing form">
          <fieldset className="pricing-fieldset">
            <legend className="pricing-legend">Artwork</legend>

            <label>
              <span>Time spent (hours)</span>
              <input
                name="time"
                type="number"
                min="0"
                step="0.25"
                value={formState.time || ''}
                placeholder="e.g. 2"
                onChange={handleNumberChange}
              />
            </label>

            <label>
              <span>Width (inches)</span>
              <input
                name="width"
                type="number"
                min="0"
                step="0.5"
                value={formState.width || ''}
                placeholder="e.g. 10"
                onChange={handleNumberChange}
              />
            </label>

            <label>
              <span>Height (inches)</span>
              <input
                name="height"
                type="number"
                min="0"
                step="0.5"
                value={formState.height || ''}
                placeholder="e.g. 10"
                onChange={handleNumberChange}
              />
            </label>

            <label>
              <span>Complexity multiplier</span>
              <input
                name="complexity"
                type="number"
                min="0.1"
                step="0.1"
                value={formState.complexity}
                onChange={handleNumberChange}
              />
            </label>

            <label>
              <span>Materials cost ($)</span>
              <input
                name="materials"
                type="number"
                min="0"
                step="0.01"
                value={formState.materials || ''}
                placeholder="0"
                onChange={handleNumberChange}
              />
            </label>
          </fieldset>

          <button
            type="button"
            className="pricing-toggle-btn"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
          </button>

          {showAdvanced && (
            <fieldset className="pricing-fieldset pricing-advanced">
              <legend className="pricing-legend">Advanced</legend>

              <label>
                <span>Hourly rate ($/hr)</span>
                <input
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="1"
                  value={formState.hourlyRate}
                  onChange={handleNumberChange}
                />
              </label>

              <label>
                <span>Area rate ($ per √in²)</span>
                <input
                  name="areaRate"
                  type="number"
                  min="0"
                  step="0.5"
                  value={formState.areaRate}
                  onChange={handleNumberChange}
                />
              </label>

              <label>
                <span>Time vs area weight (0 = all area, 1 = all time)</span>
                <input
                  name="timeWeight"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formState.timeWeight}
                  onChange={handleNumberChange}
                />
              </label>

              <label>
                <span>Minimum price ($)</span>
                <input
                  name="minPrice"
                  type="number"
                  min="0"
                  step="1"
                  value={formState.minPrice}
                  onChange={handleNumberChange}
                />
              </label>

              <label>
                <span>Gallery commission (%)</span>
                <input
                  name="galleryCommission"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formState.galleryCommission || ''}
                  placeholder="0"
                  onChange={handleNumberChange}
                />
              </label>
            </fieldset>
          )}

          <button
            type="button"
            className="pricing-toggle-btn"
            aria-expanded={showReverse}
            onClick={() => setShowReverse((v) => !v)}
          >
            {showReverse ? 'Hide reverse calculator' : 'Show reverse calculator'}
          </button>

          {showReverse && (
            <fieldset className="pricing-fieldset pricing-advanced">
              <legend className="pricing-legend">Reverse calculator</legend>
              <p className="pricing-helper">
                Given a target price, find what canvas size to use.
              </p>

              <label>
                <span>Target price ($)</span>
                <input
                  name="targetPrice"
                  type="number"
                  min="0"
                  step="1"
                  value={reverseInput.targetPrice || ''}
                  placeholder="e.g. 300"
                  onChange={handleReverseNumberChange}
                />
              </label>

              <label>
                <span>Estimated time (hours)</span>
                <input
                  name="estimatedTime"
                  type="number"
                  min="0"
                  step="0.5"
                  value={reverseInput.estimatedTime}
                  onChange={handleReverseNumberChange}
                />
              </label>

              <label>
                <span>Aspect ratio</span>
                <select
                  className="pricing-select"
                  value={reverseInput.aspectRatio}
                  onChange={handleReverseSelectChange}
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio.value} value={ratio.value}>
                      {ratio.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
        </form>

        <section className="builder-panel results-panel" aria-live="polite">
          {result ? (
            <>
              <div className="pricing-price-block">
                <p className="pricing-label">Suggested price</p>
                <p className="pricing-price">${result.finalPrice.toFixed(2)}</p>
              </div>

              <div className="pricing-breakdown">
                <h2>Breakdown</h2>
                <table className="pricing-table">
                  <tbody>
                    <tr>
                      <td>Time ({formState.time} hrs)</td>
                      <td>${result.timeCost.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Area cost</td>
                      <td>${result.areaCost.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Blended cost</td>
                      <td>${result.blendedCost.toFixed(2)}</td>
                    </tr>
                    {formState.complexity !== 1 && (
                      <tr>
                        <td>Complexity</td>
                        <td>{formState.complexity}&times;</td>
                      </tr>
                    )}
                    {formState.materials > 0 && (
                      <tr>
                        <td>Materials</td>
                        <td>${formState.materials.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr className="pricing-row-total">
                      <td>Raw price</td>
                      <td>${result.rawPrice.toFixed(2)}</td>
                    </tr>
                    {formState.galleryCommission > 0 && (
                      <tr>
                        <td>Gallery commission ({formState.galleryCommission}%)</td>
                        <td>+${result.galleryAmount.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <p className="pricing-floor-note">
                  Minimum price: ${formState.minPrice.toFixed(2)}
                  {result.finalPrice === formState.minPrice && result.rawPrice < formState.minPrice
                    ? ' — floor applied'
                    : ''}
                </p>
              </div>

              <div className="pricing-formula">
                <details>
                  <summary>View formula</summary>
                  <pre className="pricing-formula-code">
                    {`time cost  = ${formState.time} hrs × $${formState.hourlyRate}/hr
area cost  = √(${formState.width}×${formState.height}) × $${formState.areaRate}
blended    = (${result.timeCost} × ${formState.timeWeight}) + (${result.areaCost} × ${(1 - formState.timeWeight).toFixed(2)})
raw price  = (${result.blendedCost} × ${formState.complexity}) + ${formState.materials}`}
                  </pre>
                </details>
              </div>
            </>
          ) : (
            <p className="pricing-placeholder">Enter time and dimensions to see a price estimate.</p>
          )}

          {reverseResult && (
            <div className="pricing-reverse-result">
              <h2>Recommended size</h2>
              {reverseResult.width > 0 ? (
                <>
                  <p className="pricing-reverse-dims">
                    {reverseResult.width.toFixed(1)} &times; {reverseResult.height.toFixed(1)} in
                  </p>
                  <p className="pricing-reverse-area">
                    {reverseResult.area.toFixed(1)} in² total area
                  </p>
                  <p className="pricing-reverse-verify">
                    Verified price: ${reverseResult.verifiedPrice.toFixed(2)}
                  </p>
                </>
              ) : (
                <p className="pricing-placeholder">
                  Time cost alone exceeds the target — try a lower time estimate or higher target.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function readStoredState() {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  return storage.getItem(STORAGE_KEY);
}

function writeStoredState(formState: ArtPricingInput) {
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

  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    return null;
  }

  return storage;
}
