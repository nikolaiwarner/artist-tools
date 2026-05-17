import {
  Copy,
  Trash2,
  Lock,
  LockOpen,
  FlipHorizontal2,
  FlipVertical2,
  Crop,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
} from 'lucide-react';
import type { CanvasLayer, GridLayer, ImageLayer, ShapeLayer, TextLayer } from '../types';

// ── Component ──────────────────────────────────────────────────────────────────

interface LayerPanelProps {
  layer: CanvasLayer;
  className?: string;
  onUpdate: (patch: Partial<CanvasLayer>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onSendToBack?: () => void;
  onFlipH?: () => void;
  onFlipV?: () => void;
  onCropStart?: () => void;
  onMaskDrawStart?: () => void;
  onClearMask?: () => void;
  onDetectMask?: () => void;
  isDetectingMask?: boolean;
}

export function LayerPanel({
  layer,
  className,
  onUpdate,
  onDelete,
  onDuplicate,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onFlipH,
  onFlipV,
  onCropStart,
  onMaskDrawStart,
  onClearMask,
  onDetectMask,
  isDetectingMask = false,
}: LayerPanelProps) {
  const imageLayer = layer.type === 'image' ? (layer as ImageLayer) : null;
  const textLayer = layer.type === 'text' ? (layer as TextLayer) : null;
  const shapeLayer = layer.type === 'shape' ? (layer as ShapeLayer) : null;
  const gridLayer = layer.type === 'grid' ? (layer as GridLayer) : null;

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
  const posterizeLevelValue = imageLayer?.posterizeLevels && imageLayer.posterizeLevels >= 2
    ? imageLayer.posterizeLevels
    : 0;

  return (
    <aside className={`refboard-layer-panel${className ? ` ${className}` : ''}`}>
      <div className="refboard-panel-section">
        <p className="refboard-panel-eyebrow">
          {
            layer.type === 'image'
              ? 'Image Layer'
              : layer.type === 'text'
                ? 'Text Layer'
                : layer.type === 'shape'
                  ? 'Shape Layer'
                  : 'Grid Layer'
          }
        </p>
        <div className="refboard-panel-row">
          <button
            onClick={() => onUpdate({ locked: !Boolean(layer.locked) })}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
            aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
            className="refboard-icon-btn"
          >
            {layer.locked ? <LockOpen size={15} /> : <Lock size={15} />}
          </button>
          <button onClick={onDuplicate} title="Duplicate layer" className="refboard-icon-btn">
            <Copy size={15} />
          </button>
          <button onClick={onDelete} className="refboard-icon-btn refboard-delete-btn" title="Delete layer">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="refboard-panel-section">
        <p className="refboard-panel-eyebrow">Order</p>
        <div className="refboard-panel-row">
          <button
            onClick={onBringToFront}
            className="refboard-icon-btn"
            title="Bring selected layer to front"
            aria-label="Bring selected layer to front"
          >
            <ChevronsUp size={15} />
          </button>
          <button
            onClick={onBringForward}
            className="refboard-icon-btn"
            title="Bring selected layer forward"
            aria-label="Bring selected layer forward"
          >
            <ChevronUp size={15} />
          </button>
          <button
            onClick={onSendBackward}
            className="refboard-icon-btn"
            title="Send selected layer backward"
            aria-label="Send selected layer backward"
          >
            <ChevronDown size={15} />
          </button>
          <button
            onClick={onSendToBack}
            className="refboard-icon-btn"
            title="Send selected layer to back"
            aria-label="Send selected layer to back"
          >
            <ChevronsDown size={15} />
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
            <p className="refboard-panel-eyebrow">Tonal</p>
            <div className="refboard-tonal-group" role="group" aria-label="Tonal controls">
              <div className="refboard-tonal-modes" role="group" aria-label="Tonal mode">
                <button
                  type="button"
                  aria-label="Color mode"
                  aria-pressed={(imageLayer.tonalMode ?? 'color') === 'color'}
                  className={(imageLayer.tonalMode ?? 'color') === 'color' ? 'refboard-tonal-mode-btn refboard-toggle-active' : 'refboard-tonal-mode-btn'}
                  onClick={() => onUpdate({ tonalMode: 'color' } as Partial<ImageLayer>)}
                >
                  Color
                </button>
                <button
                  type="button"
                  aria-label="Black and White mode"
                  aria-pressed={(imageLayer.tonalMode ?? 'color') === 'grayscale'}
                  className={(imageLayer.tonalMode ?? 'color') === 'grayscale' ? 'refboard-tonal-mode-btn refboard-toggle-active' : 'refboard-tonal-mode-btn'}
                  onClick={() => onUpdate({ tonalMode: 'grayscale' } as Partial<ImageLayer>)}
                >
                  B/W
                </button>
              </div>

              <div className="refboard-tonal-levels" role="group" aria-label="Posterize level">
                {[0, 2, 3, 4, 5, 6].map((level) => {
                  const active = level === posterizeLevelValue;
                  const label = level === 0 ? 'All' : String(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      aria-label={level === 0 ? 'Posterize off' : `Posterize ${level} levels`}
                      aria-pressed={active}
                      className={active ? 'refboard-tonal-level-chip refboard-toggle-active' : 'refboard-tonal-level-chip'}
                      onClick={() => onUpdate({ posterizeLevels: level === 0 ? undefined : level } as Partial<ImageLayer>)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

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

          <div className="refboard-panel-section">
            <p className="refboard-panel-eyebrow">Mask</p>
            <div className="refboard-panel-row">
              <button
                type="button"
                onClick={onDetectMask}
                className="refboard-icon-btn"
                title={isDetectingMask ? 'Detecting image mask' : 'Detect image mask'}
                style={{ flex: 1, gap: 5 }}
                disabled={isDetectingMask}
              >
                <span style={{ fontSize: '0.8rem' }}>{isDetectingMask ? 'Detecting…' : 'Detect Mask'}</span>
              </button>
              <button
                type="button"
                onClick={onMaskDrawStart}
                className="refboard-icon-btn"
                title={imageLayer.maskImageId ? 'Edit image mask' : 'Draw image mask'}
                style={{ flex: 1, gap: 5 }}
                disabled={isDetectingMask}
              >
                <span style={{ fontSize: '0.8rem' }}>{imageLayer.maskImageId ? 'Edit Mask' : 'Draw Mask'}</span>
              </button>
              {imageLayer.maskImageId && (
                <button
                  type="button"
                  title="Clear image mask"
                  className="refboard-icon-btn"
                  onClick={onClearMask}
                  style={{ fontSize: '0.75rem' }}
                  disabled={isDetectingMask}
                >
                  Clear
                </button>
              )}
              {isDetectingMask && (
                <p role="status" aria-live="polite" style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8 }}>
                  Detecting mask...
                </p>
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

      {gridLayer && (
        <>
          <div className="refboard-panel-section">
            <p className="refboard-panel-eyebrow">Grid</p>
            {numInput(
              'Vertical Lines',
              gridLayer.verticalLines,
              (v) => onUpdate({ verticalLines: Math.max(1, Math.round(v)) } as Partial<GridLayer>),
              { min: 1, max: 64 }
            )}
            {numInput(
              'Horizontal Lines',
              gridLayer.horizontalLines,
              (v) => onUpdate({ horizontalLines: Math.max(1, Math.round(v)) } as Partial<GridLayer>),
              { min: 1, max: 64 }
            )}
            {numInput(
              'Line Width',
              gridLayer.strokeWidth,
              (v) => onUpdate({ strokeWidth: Math.max(1, Math.round(v)) } as Partial<GridLayer>),
              { min: 1, max: 16 }
            )}

            <label className="refboard-panel-label">
              <span>Line Color</span>
              <input
                type="color"
                value={gridLayer.stroke}
                onChange={(e) => onUpdate({ stroke: e.target.value } as Partial<GridLayer>)}
                className="refboard-panel-color"
              />
            </label>
          </div>
        </>
      )}
    </aside>
  );
}
