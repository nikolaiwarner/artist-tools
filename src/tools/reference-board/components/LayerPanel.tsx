import { Copy, Trash2, FlipHorizontal2, FlipVertical2, Crop } from 'lucide-react';
import type { CanvasLayer, ImageLayer, ShapeLayer, TextLayer } from '../types';

// ── Component ──────────────────────────────────────────────────────────────────

interface LayerPanelProps {
  layer: CanvasLayer;
  onUpdate: (patch: Partial<CanvasLayer>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onCropStart?: () => void;
}

export function LayerPanel({
  layer,
  onUpdate,
  onDelete,
  onDuplicate,
  onFlipH,
  onFlipV,
  onCropStart,
}: LayerPanelProps) {
  const imageLayer = layer.type === 'image' ? (layer as ImageLayer) : null;
  const textLayer = layer.type === 'text' ? (layer as TextLayer) : null;
  const shapeLayer = layer.type === 'shape' ? (layer as ShapeLayer) : null;

  function numInput(
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts?: { min?: number; max?: number; step?: number }
  ) {
    return (
      <label className="refboard-panel-label">
        <span>{label}</span>
        <input
          type="number"
          className="refboard-panel-input"
          value={value}
          min={opts?.min}
          max={opts?.max}
          step={opts?.step ?? 1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      </label>
    );
  }

  const FONT_FAMILIES = [
    'IBM Plex Sans',
    'IBM Plex Mono',
    'serif',
    'sans-serif',
    'monospace',
    'Georgia',
    'Times New Roman',
    'Arial',
    'Helvetica',
  ];

  return (
    <aside className="refboard-layer-panel">
      <div className="refboard-panel-section">
        <p className="refboard-panel-eyebrow">
          {layer.type === 'image' ? 'Image Layer' : layer.type === 'text' ? 'Text Layer' : 'Shape Layer'}
        </p>
        <div className="refboard-panel-row">
          <button onClick={onDuplicate} title="Duplicate layer" className="refboard-icon-btn">
            <Copy size={15} />
          </button>
          <button onClick={onDelete} className="refboard-icon-btn refboard-delete-btn" title="Delete layer">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="refboard-panel-section">
        <p className="refboard-panel-eyebrow">Opacity</p>
        <div className="refboard-slider-row">
          <input
            type="range"
            className="refboard-panel-slider"
            value={Math.round(layer.opacity * 100)}
            min={0}
            max={100}
            step={1}
            onChange={(e) => onUpdate({ opacity: parseInt(e.target.value) / 100 })}
          />
          <span className="refboard-slider-val">{Math.round(layer.opacity * 100)}%</span>
        </div>
      </div>

      {imageLayer && (
        <>
          <div className="refboard-panel-section">
            <p className="refboard-panel-eyebrow">Flip</p>
            <div className="refboard-panel-row">
              <button onClick={onFlipH} className="refboard-icon-btn" title="Flip horizontal">
                <FlipHorizontal2 size={15} />
              </button>
              <button onClick={onFlipV} className="refboard-icon-btn" title="Flip vertical">
                <FlipVertical2 size={15} />
              </button>
            </div>
          </div>

          <div className="refboard-panel-section">
            <p className="refboard-panel-eyebrow">Crop</p>
            <div className="refboard-panel-row">
              <button
                onClick={onCropStart}
                className="refboard-icon-btn"
                title={imageLayer.crop ? 'Edit crop' : 'Crop image'}
                style={{ flex: 1, gap: 5 }}
              >
                <Crop size={15} />
                <span style={{ fontSize: '0.8rem' }}>{imageLayer.crop ? 'Edit' : 'Crop'}</span>
              </button>
              {imageLayer.crop && (
                <button
                  title="Reset crop"
                  className="refboard-icon-btn"
                  onClick={() => onUpdate({ crop: undefined } as Partial<CanvasLayer>)}
                  style={{ fontSize: '0.75rem' }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {textLayer && (
        <>
          <div className="refboard-panel-section">
            <p className="refboard-panel-eyebrow">Text</p>
            {numInput('Font Size', textLayer.fontSize, (v) => onUpdate({ fontSize: v } as Partial<TextLayer>), { min: 6, max: 200 })}

            <label className="refboard-panel-label">
              <span>Font Family</span>
              <select
                className="refboard-panel-select"
                value={textLayer.fontFamily}
                onChange={(e) => onUpdate({ fontFamily: e.target.value } as Partial<TextLayer>)}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>

            <div className="refboard-panel-row">
              <button
                aria-pressed={textLayer.bold}
                className={textLayer.bold ? 'refboard-toggle-active' : ''}
                onClick={() => onUpdate({ bold: !textLayer.bold } as Partial<TextLayer>)}
                style={{ fontWeight: 700 }}
              >
                B
              </button>
              <button
                aria-pressed={textLayer.italic}
                className={textLayer.italic ? 'refboard-toggle-active' : ''}
                onClick={() => onUpdate({ italic: !textLayer.italic } as Partial<TextLayer>)}
                style={{ fontStyle: 'italic' }}
              >
                I
              </button>
            </div>

            <label className="refboard-panel-label">
              <span>Color</span>
              <input
                type="color"
                value={textLayer.fill}
                onChange={(e) => onUpdate({ fill: e.target.value } as Partial<TextLayer>)}
                className="refboard-panel-color"
              />
            </label>

            <label className="refboard-panel-label">
              <span>Alignment</span>
              <div className="refboard-panel-row">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    aria-pressed={textLayer.align === a}
                    className={textLayer.align === a ? 'refboard-toggle-active' : ''}
                    onClick={() => onUpdate({ align: a } as Partial<TextLayer>)}
                    title={a}
                  >
                    {a === 'left' ? '⬛ L' : a === 'center' ? '⬛ C' : '⬛ R'}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </>
      )}

      {shapeLayer && (
        <>
          <div className="refboard-panel-section">
            <p className="refboard-panel-eyebrow">Shape</p>
            {numInput('Width', shapeLayer.width, (v) => onUpdate({ width: Math.max(1, v) } as Partial<ShapeLayer>), { min: 1, max: 4000 })}
            {numInput('Height', shapeLayer.height, (v) => onUpdate({ height: Math.max(1, v) } as Partial<ShapeLayer>), { min: 1, max: 4000 })}
            {numInput('Stroke Width', shapeLayer.strokeWidth, (v) => onUpdate({ strokeWidth: Math.max(0, v) } as Partial<ShapeLayer>), { min: 0, max: 100, step: 1 })}

            <label className="refboard-panel-label">
              <span>Stroke</span>
              <input
                type="color"
                value={shapeLayer.stroke}
                onChange={(e) => onUpdate({ stroke: e.target.value } as Partial<ShapeLayer>)}
                className="refboard-panel-color"
              />
            </label>

            <label className="refboard-panel-label">
              <span>Fill</span>
              <input
                type="color"
                value={shapeLayer.fill === 'transparent' ? '#ffffff' : shapeLayer.fill}
                onChange={(e) => onUpdate({ fill: e.target.value } as Partial<ShapeLayer>)}
                className="refboard-panel-color"
              />
            </label>

            <button
              aria-pressed={shapeLayer.fill === 'transparent'}
              className={shapeLayer.fill === 'transparent' ? 'refboard-toggle-active' : ''}
              onClick={() => onUpdate({ fill: shapeLayer.fill === 'transparent' ? '#ffffff' : 'transparent' } as Partial<ShapeLayer>)}
            >
              {shapeLayer.fill === 'transparent' ? 'Transparent Fill' : 'Use Transparent Fill'}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
