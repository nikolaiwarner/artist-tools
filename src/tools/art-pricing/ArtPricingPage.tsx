import { ChangeEvent, useState } from 'react';

import { AppMenuButton } from '../../components/AppMenuButton';
import { useSyncedLocalStorage } from '../../sync/useSyncedLocalStorage';
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
  const [formState, setFormState] = useSyncedLocalStorage<ArtPricingInput>(
    STORAGE_KEY,
    defaultArtPricingInput,
    (raw) => ({ ...defaultArtPricingInput, ...JSON.parse(raw) } as ArtPricingInput)
  );

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReverse, setShowReverse] = useState(false);
  const [reverseInput, setReverseInput] = useState<ReverseInput>(defaultReverseInput);

  const hasValidInput = formState.time > 0 && formState.width > 0 && formState.height > 0;
  const result = hasValidInput ? calculatePrice(formState) : null;

  const reverseSettings = {
    hourlyRate: formState.hourlyRate,
    areaRate: formState.areaRate,
    areaExponent: formState.areaExponent,
    timeWeight: formState.timeWeight,
    complexity: formState.complexity,
    materials: formState.materials,
    overheadFixed: formState.overheadFixed,
    galleryCommission: formState.galleryCommission,
    commissionMode: formState.commissionMode
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
        <div className="tool-hero-head">
          <AppMenuButton />
          <div className="tool-hero-copy">
            <h1>Art Pricing Calculator</h1>
          </div>
        </div>
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
              <small className="pricing-input-help">Your studio labor time.</small>
              <small className="pricing-input-default">Default: 2 hrs</small>
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
              <small className="pricing-input-help">Finished artwork width.</small>
              <small className="pricing-input-default">Default: 0 in</small>
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
              <small className="pricing-input-help">Finished artwork height.</small>
              <small className="pricing-input-default">Default: 0 in</small>
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
              <small className="pricing-input-help">Boost price for harder pieces.</small>
              <small className="pricing-input-default">Default: 1.0</small>
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
              <small className="pricing-input-help">Cost of paint, canvas, and supplies.</small>
              <small className="pricing-input-default">Default: $0</small>
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
                  placeholder="45"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">Your target pay per studio hour.</small>
                <small className="pricing-input-default">Default: 45</small>
              </label>

              <label>
                <span>Area rate ($ per size unit)</span>
                <input
                  name="areaRate"
                  type="number"
                  min="0"
                  step="0.5"
                  value={formState.areaRate}
                  placeholder="4"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">Base size price factor.</small>
                <small className="pricing-input-default">Default: 4</small>
              </label>

              <label>
                <span>Size exponent (0.5 = softer, 1.0 = stronger)</span>
                <input
                  name="areaExponent"
                  type="number"
                  min="0.5"
                  max="1"
                  step="0.05"
                  value={formState.areaExponent}
                  placeholder="0.75"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">How strongly bigger work scales price.</small>
                <small className="pricing-input-default">Default: 0.75</small>
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
                  placeholder="0.6"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">Balance labor vs size influence.</small>
                <small className="pricing-input-default">Default: 0.6</small>
              </label>

              <label>
                <span>Minimum price ($)</span>
                <input
                  name="minPrice"
                  type="number"
                  min="0"
                  step="1"
                  value={formState.minPrice}
                  placeholder="150"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">Hard floor the final price cannot go below.</small>
                <small className="pricing-input-default">Default: 150</small>
              </label>

              <label>
                <span>Fixed overhead ($)</span>
                <input
                  name="overheadFixed"
                  type="number"
                  min="0"
                  step="1"
                  value={formState.overheadFixed || ''}
                  placeholder="20"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">Flat admin/business cost per piece.</small>
                <small className="pricing-input-default">Default: 20</small>
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
                  placeholder="50"
                  onChange={handleNumberChange}
                />
                <small className="pricing-input-help">Gallery share percentage.</small>
                <small className="pricing-input-default">Default: 50%</small>
              </label>

              <label>
                <span>Commission handling</span>
                <select
                  className="pricing-select"
                  name="commissionMode"
                  value={formState.commissionMode}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      commissionMode: event.target.value === 'included' ? 'included' : 'add-on'
                    }))
                  }
                >
                  <option value="add-on">Add on top (buyer pays)</option>
                  <option value="included">Included in list price (artist absorbs)</option>
                </select>
                <small className="pricing-input-help">Whether gallery cut is added or absorbed.</small>
                <small className="pricing-input-default">Default: Included in list price</small>
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
                <small className="pricing-input-help">The selling price you want to hit.</small>
                <small className="pricing-input-default">Default: $0</small>
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
                <small className="pricing-input-help">Expected labor for that future piece.</small>
                <small className="pricing-input-default">Default: 2 hrs</small>
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
                <small className="pricing-input-help">Shape of the canvas (width to height).</small>
                <small className="pricing-input-default">Default: 1:1</small>
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
                    {formState.overheadFixed > 0 && (
                      <tr>
                        <td>Fixed overhead</td>
                        <td>${formState.overheadFixed.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr className="pricing-row-total">
                      <td>Raw price</td>
                      <td>${result.rawPrice.toFixed(2)}</td>
                    </tr>
                    {formState.galleryCommission > 0 && (
                      <tr>
                        <td>
                          Gallery commission ({formState.galleryCommission}%)
                          {formState.commissionMode === 'included'
                            ? ' (included in list price)'
                            : ''}
                        </td>
                        <td>
                          {formState.commissionMode === 'add-on' ? '+' : ''}
                          ${result.galleryAmount.toFixed(2)}
                        </td>
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
area cost  = (${formState.width}×${formState.height})^${formState.areaExponent} × $${formState.areaRate}
blended    = (${result.timeCost} × ${formState.timeWeight}) + (${result.areaCost} × ${(1 - formState.timeWeight).toFixed(2)})
raw price  = (${result.blendedCost} × ${formState.complexity}) + ${formState.materials} + ${formState.overheadFixed}`}
                  </pre>
                </details>
              </div>

            </>
          ) : (
            <p className="pricing-placeholder">Enter time and dimensions to see a price estimate.</p>
          )}

          <div className="pricing-breakdown">
            <h2>How this tool works</h2>
            <p>
              Simple idea: price should reflect your labor, size, and out-of-pocket costs, while
              still staying consistent from one piece to the next.
            </p>
            <p>
              First, it calculates a labor number from your hours and hourly rate. Then it
              calculates a size number from width and height. The size exponent lets you choose how
              strongly bigger pieces should increase price.
            </p>
            <p>
              Next, it blends labor and size using the time-vs-size weight, applies complexity, and
              adds materials plus fixed overhead. If you use galleries, commission can either be
              added on top or treated as included in the listed price.
            </p>
            <p>
              Finally, the minimum price floor protects you from accidentally pricing very low just
              because a piece is small or fast to make.
            </p>
          </div>

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
