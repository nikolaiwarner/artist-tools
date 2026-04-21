import { useRef, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import type { Viewport } from '../types';

interface CanvasStageProps {
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  children?: React.ReactNode;
  stageRef?: React.RefObject<Konva.Stage | null>;
  onBackgroundClick?: () => void;
  selectionBox?: { startX: number; startY: number; endX: number; endY: number } | null;
  onSelectionStart?: (x: number, y: number) => void;
  onSelectionMove?: (x: number, y: number) => void;
  onSelectionEnd?: () => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

export function CanvasStage({
  viewport,
  onViewportChange,
  children,
  stageRef: externalStageRef,
  onBackgroundClick,
  selectionBox,
  onSelectionStart,
  onSelectionMove,
  onSelectionEnd,
}: CanvasStageProps) {
  const internalStageRef = useRef<Konva.Stage>(null);
  const stageRef = externalStageRef ?? internalStageRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // Wheel zoom (ctrl/cmd + scroll or trackpad pinch)
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const isZoom = e.evt.ctrlKey || e.evt.metaKey;
      if (isZoom) {
        const scaleBy = 1.04;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const mousePointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };

        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * Math.pow(scaleBy, direction)));

        const newPos = {
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        };

        onViewportChange({ x: newPos.x, y: newPos.y, scale: newScale });
      } else {
        // Pan with scroll
        onViewportChange({
          x: viewport.x - e.evt.deltaX,
          y: viewport.y - e.evt.deltaY,
          scale: viewport.scale,
        });
      }
    },
    [viewport, onViewportChange, stageRef]
  );

  // Middle mouse / space+drag panning, or box select on empty canvas
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const isMiddle = e.evt.button === 1;
      if (isMiddle || spaceDownRef.current) {
        isPanningRef.current = true;
        lastPosRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
      } else if (e.target === stage && !e.evt.ctrlKey && !e.evt.metaKey && !e.evt.shiftKey) {
        // Box select on empty canvas (not middle click, not panning, not modifier keys)
        onSelectionStart?.(pointer.x, pointer.y);
      }
    },
    [onSelectionStart]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      if (isPanningRef.current) {
        const dx = e.evt.clientX - lastPosRef.current.x;
        const dy = e.evt.clientY - lastPosRef.current.y;
        lastPosRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        onViewportChange({ x: viewport.x + dx, y: viewport.y + dy, scale: viewport.scale });
      } else if (selectionBox) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          onSelectionMove?.(pointer.x, pointer.y);
        }
      }
    },
    [viewport, onViewportChange, selectionBox, onSelectionMove]
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (containerRef.current) {
      containerRef.current.style.cursor = spaceDownRef.current ? 'grab' : 'default';
    }
    onSelectionEnd?.();
  }, [onSelectionEnd]);

  // Space key for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        spaceDownRef.current = true;
        if (containerRef.current) containerRef.current.style.cursor = 'grab';
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        if (containerRef.current) containerRef.current.style.cursor = 'default';
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Prevent context menu on middle-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  }, []);

  function fitAll() {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    const w = container.clientWidth;
    const h = container.clientHeight;
    onViewportChange({ x: w / 2, y: h / 2, scale: 1 });
  }

  return (
    <div ref={containerRef} className="refboard-canvas-container" onContextMenu={handleContextMenu}>
      <Stage
        ref={stageRef as React.RefObject<Konva.Stage>}
        width={containerRef.current?.clientWidth ?? window.innerWidth}
        height={containerRef.current?.clientHeight ?? window.innerHeight - 120}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            onBackgroundClick?.();
          }
        }}
        style={{ background: 'transparent', display: 'block' }}
      >
        <Layer>
          {children}
          {selectionBox && (
            <Rect
              x={Math.min(selectionBox.startX, selectionBox.endX)}
              y={Math.min(selectionBox.startY, selectionBox.endY)}
              width={Math.abs(selectionBox.endX - selectionBox.startX)}
              height={Math.abs(selectionBox.endY - selectionBox.startY)}
              stroke="#0099ff"
              strokeWidth={2}
              fill="rgba(0, 153, 255, 0.1)"
              pointerEvents="none"
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
