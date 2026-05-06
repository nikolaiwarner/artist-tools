type CanvasPreviewDiagramProps = {
  width: number;
  height: number;
  woodWidth: number;
  supportBraces: number;
  showHangerPlacement?: boolean;
};

const VIEWPORT_WIDTH = 360;
const VIEWPORT_HEIGHT = 280;
const HORIZONTAL_PADDING = 34;
const TOP_PADDING = 46;
const BOTTOM_PADDING = 34;

export function CanvasPreviewDiagram({ width, height, woodWidth, supportBraces, showHangerPlacement = true }: CanvasPreviewDiagramProps) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeWoodWidth = Math.max(0.5, woodWidth);
  const drawableWidth = VIEWPORT_WIDTH - HORIZONTAL_PADDING * 2;
  const drawableHeight = VIEWPORT_HEIGHT - TOP_PADDING - BOTTOM_PADDING;
  const scale = Math.min(drawableWidth / safeWidth, drawableHeight / safeHeight);
  const frameWidth = safeWidth * scale;
  const frameHeight = safeHeight * scale;
  const barThickness = Math.min(Math.max(safeWoodWidth * scale, 2), Math.min(frameWidth, frameHeight) / 2 - 1);
  const frameX = (VIEWPORT_WIDTH - frameWidth) / 2;
  const frameY = TOP_PADDING + (drawableHeight - frameHeight) / 2;
  const hangerOffsetGuideX = Math.min(VIEWPORT_WIDTH - 10, frameX + frameWidth + 12);
  const innerX = frameX + barThickness;
  const innerY = frameY + barThickness;
  const innerWidth = Math.max(1, frameWidth - barThickness * 2);
  const innerHeight = Math.max(1, frameHeight - barThickness * 2);
  const centerX = frameX + frameWidth / 2;
  const centerY = frameY + frameHeight / 2;
  const braceLines = getBraceLines({
    frameX: innerX,
    frameY: innerY,
    frameWidth: innerWidth,
    frameHeight: innerHeight,
    centerX,
    centerY,
    supportBraces
  });
  const hangerPlacement = getHangerPlacement({
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    barThickness,
    scale,
    canvasHeight: safeHeight
  });
  const hangerOffsetLabelY = frameY + (hangerPlacement.screwY - frameY) / 2 + 3;

  return (
    <figure className="canvas-preview" aria-label="Canvas scale preview">
      <svg
        className="canvas-preview-svg"
        viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
        role="img"
        aria-label="Canvas preview diagram"
      >
        <rect x="1" y="1" width={VIEWPORT_WIDTH - 2} height={VIEWPORT_HEIGHT - 2} className="canvas-preview-boundary" />

        <line x1={frameX} y1={frameY - 18} x2={frameX + frameWidth} y2={frameY - 18} className="canvas-dimension-line" />
        <line x1={frameX} y1={frameY - 23} x2={frameX} y2={frameY - 13} className="canvas-dimension-line" />
        <line
          x1={frameX + frameWidth}
          y1={frameY - 23}
          x2={frameX + frameWidth}
          y2={frameY - 13}
          className="canvas-dimension-line"
        />

        <line x1={frameX - 18} y1={frameY} x2={frameX - 18} y2={frameY + frameHeight} className="canvas-dimension-line" />
        <line x1={frameX - 23} y1={frameY} x2={frameX - 13} y2={frameY} className="canvas-dimension-line" />
        <line
          x1={frameX - 23}
          y1={frameY + frameHeight}
          x2={frameX - 13}
          y2={frameY + frameHeight}
          className="canvas-dimension-line"
        />

        <path
          d={`M ${frameX} ${frameY} H ${frameX + frameWidth} V ${frameY + frameHeight} H ${frameX} Z M ${innerX} ${innerY} H ${innerX + innerWidth
            } V ${innerY + innerHeight} H ${innerX} Z`}
          fillRule="evenodd"
          className="canvas-frame"
        />

        <rect x={innerX} y={innerY} width={innerWidth} height={innerHeight} className="canvas-opening" />

        <line x1={frameX} y1={frameY} x2={innerX} y2={innerY} className="canvas-mitre" data-testid="mitre-cut" />
        <line
          x1={frameX + frameWidth}
          y1={frameY}
          x2={innerX + innerWidth}
          y2={innerY}
          className="canvas-mitre"
          data-testid="mitre-cut"
        />
        <line
          x1={frameX}
          y1={frameY + frameHeight}
          x2={innerX}
          y2={innerY + innerHeight}
          className="canvas-mitre"
          data-testid="mitre-cut"
        />
        <line
          x1={frameX + frameWidth}
          y1={frameY + frameHeight}
          x2={innerX + innerWidth}
          y2={innerY + innerHeight}
          className="canvas-mitre"
          data-testid="mitre-cut"
        />

        {braceLines.map((line, index) => (
          <line
            key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className="canvas-brace"
            data-testid="support-brace"
            aria-label={`Support brace ${index + 1}`}
          />
        ))}

        {showHangerPlacement ? (
          <>
            <path
              d={`M ${hangerPlacement.leftX} ${hangerPlacement.screwY} Q ${centerX} ${hangerPlacement.wirePeakY} ${hangerPlacement.rightX} ${hangerPlacement.screwY}`}
              className="canvas-hanger-wire"
              data-testid="hanger-wire"
              aria-label="Wire hanger path"
            />
            <circle
              cx={hangerPlacement.leftX}
              cy={hangerPlacement.screwY}
              r={3}
              className="canvas-hanger-screw"
              data-testid="hanger-screw"
              aria-label="Left hanger screw"
            />
            <circle
              cx={hangerPlacement.rightX}
              cy={hangerPlacement.screwY}
              r={3}
              className="canvas-hanger-screw"
              data-testid="hanger-screw"
              aria-label="Right hanger screw"
            />
            <line
              x1={hangerOffsetGuideX}
              y1={frameY}
              x2={hangerOffsetGuideX}
              y2={hangerPlacement.screwY}
              className="canvas-dimension-line canvas-hanger-offset-line"
              data-testid="hanger-offset-line"
              aria-label="Hanger top offset"
            />
            <line
              x1={hangerOffsetGuideX - 5}
              y1={frameY}
              x2={hangerOffsetGuideX + 5}
              y2={frameY}
              className="canvas-dimension-line canvas-hanger-offset-line"
            />
            <line
              x1={hangerOffsetGuideX - 5}
              y1={hangerPlacement.screwY}
              x2={hangerOffsetGuideX + 5}
              y2={hangerPlacement.screwY}
              className="canvas-dimension-line canvas-hanger-offset-line"
            />
            <text
              x={hangerOffsetGuideX + 8}
              y={hangerOffsetLabelY}
              textAnchor="start"
              className="canvas-dimension-label canvas-hanger-offset-label"
            >
              {formatMeasure(hangerPlacement.offsetInches)} in
            </text>
          </>
        ) : null}

        <text x={centerX} y={frameY - 26} textAnchor="middle" className="canvas-dimension-label">
          {formatMeasure(width)} in width
        </text>
        <text
          x={frameX - 26}
          y={centerY}
          textAnchor="middle"
          className="canvas-dimension-label"
          transform={`rotate(-90 ${frameX - 26} ${centerY})`}
        >
          {formatMeasure(height)} in height
        </text>
      </svg>
      <div className="canvas-preview-meta" aria-label="Canvas diagram notes">
        <p className="canvas-preview-pill">Bar width: {formatMeasure(woodWidth)} in</p>
        {showHangerPlacement ? (
          <p className="canvas-preview-pill">Hanger screws: {formatMeasure(hangerPlacement.offsetInches)} in down from top</p>
        ) : null}
        {showHangerPlacement && hangerPlacement.isCappedAtMax ? (
          <p className="canvas-preview-note">Very tall canvas: consider cleat or two-hook hanging.</p>
        ) : null}
      </div>
      <figcaption>
        Proportional preview of your finished canvas dimensions, support braces, and typical wire hanger screw points.
      </figcaption>
    </figure>
  );
}

type BraceCoordinatesArgs = {
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  centerX: number;
  centerY: number;
  supportBraces: number;
};

type LineCoordinates = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type HangerPlacementArgs = {
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  barThickness: number;
  scale: number;
  canvasHeight: number;
};

type HangerPlacement = {
  leftX: number;
  rightX: number;
  screwY: number;
  wirePeakY: number;
  offsetInches: number;
  isCappedAtMax: boolean;
};

function getBraceLines(args: BraceCoordinatesArgs): LineCoordinates[] {
  const { frameX, frameY, frameWidth, frameHeight, centerX, centerY, supportBraces } = args;

  if (supportBraces <= 0) {
    return [];
  }

  if (supportBraces === 1) {
    if (frameWidth >= frameHeight) {
      return [{ x1: frameX, y1: centerY, x2: frameX + frameWidth, y2: centerY }];
    }

    return [{ x1: centerX, y1: frameY, x2: centerX, y2: frameY + frameHeight }];
  }

  return [
    { x1: frameX, y1: centerY, x2: frameX + frameWidth, y2: centerY },
    { x1: centerX, y1: frameY, x2: centerX, y2: frameY + frameHeight }
  ];
}

function getHangerPlacement(args: HangerPlacementArgs): HangerPlacement {
  const { frameX, frameY, frameWidth, frameHeight, barThickness, scale, canvasHeight } = args;
  const rawOffsetInches = canvasHeight * 0.33;
  const offsetInches = getHangerOffsetInches(canvasHeight);
  const screwY = Math.min(frameY + frameHeight - barThickness * 0.75, frameY + offsetInches * scale);
  const leftX = frameX + barThickness * 0.55;
  const rightX = frameX + frameWidth - barThickness * 0.55;
  const peakLift = Math.max(6, Math.min(16, frameWidth * 0.08));
  const wirePeakY = Math.max(frameY + barThickness * 0.8, screwY - peakLift);

  return {
    leftX,
    rightX,
    screwY,
    wirePeakY,
    offsetInches,
    isCappedAtMax: rawOffsetInches > 12
  };
}

function getHangerOffsetInches(canvasHeight: number) {
  // Artists commonly place D-rings around one-third down from the top edge.
  return Math.min(12, Math.max(2, canvasHeight * 0.33));
}

function formatMeasure(value: number) {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return `${Math.round(value * 100) / 100}`;
}
