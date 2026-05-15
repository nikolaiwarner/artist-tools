import { useRef, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import type { Viewport } from '../types';

interface CanvasStageProps {
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  onViewportCommit?: (viewport: Viewport) => void;
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

// Helper function to calculate distance between two points
function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper function to get the center point between two touches
function getTouchCenter(touches: React.TouchList): { x: number; y: number } {
  const touch1 = touches[0];
  const touch2 = touches[1];
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

export function CanvasStage({
  viewport,
  onViewportChange,
  onViewportCommit,
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

  // Touch gesture tracking
  const touchesRef = useRef<React.TouchList | null>(null);
  const lastTouchDistanceRef = useRef(0);
  const viewportRef = useRef(viewport);
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchViewportChangedRef = useRef(false);

  const emitViewportChange = useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport;
    onViewportChange(nextViewport);
  }, [onViewportChange]);

  const emitViewportCommit = useCallback((nextViewport?: Viewport) => {
    onViewportCommit?.(nextViewport ?? viewportRef.current);
  }, [onViewportCommit]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    return () => {
      if (wheelCommitTimerRef.current) {
        clearTimeout(wheelCommitTimerRef.current);
      }
    };
  }, []);

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

        emitViewportChange({ x: newPos.x, y: newPos.y, scale: newScale });
      } else {
        // Pan with scroll
        emitViewportChange({
          x: viewport.x - e.evt.deltaX,
          y: viewport.y - e.evt.deltaY,
          scale: viewport.scale,
        });
      }

      if (wheelCommitTimerRef.current) {
        clearTimeout(wheelCommitTimerRef.current);
      }
      wheelCommitTimerRef.current = setTimeout(() => {
        emitViewportCommit();
      }, 250);
    },
    [viewport, emitViewportChange, emitViewportCommit, stageRef]
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
        emitViewportChange({ x: viewport.x + dx, y: viewport.y + dy, scale: viewport.scale });
      } else if (selectionBox) {
        const pointer = stage.getPointerPosition();
        if (pointer) {
          onSelectionMove?.(pointer.x, pointer.y);
        }
      }
    },
    [viewport, emitViewportChange, selectionBox, onSelectionMove]
  );

  const handleMouseUp = useCallback(() => {
    const wasPanning = isPanningRef.current;
    isPanningRef.current = false;
    if (containerRef.current) {
      containerRef.current.style.cursor = spaceDownRef.current ? 'grab' : 'default';
    }
    if (wasPanning) {
      emitViewportCommit();
    }
    onSelectionEnd?.();
  }, [emitViewportCommit, onSelectionEnd]);

  // Touch gesture handlers for mobile pinch-zoom and pan
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      touchesRef.current = e.touches;

      if (e.touches.length === 2) {
        // Start of pinch or two-finger pan
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastTouchDistanceRef.current = getDistance(
          { x: touch1.clientX, y: touch1.clientY },
          { x: touch2.clientX, y: touch2.clientY }
        );
        lastPosRef.current = getTouchCenter(e.touches);
      } else if (e.touches.length === 1) {
        // Single touch - let Konva handle it
        lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      touchesRef.current = e.touches;

      if (e.touches.length === 2) {
        // Two-finger gesture: pinch zoom or pan
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = getDistance(
          { x: touch1.clientX, y: touch1.clientY },
          { x: touch2.clientX, y: touch2.clientY }
        );
        const currentCenter = getTouchCenter(e.touches);

        // Detect pinch zoom
        const distanceDelta = currentDistance - lastTouchDistanceRef.current;
        if (Math.abs(distanceDelta) > 5) {
          // Significant pinch movement detected
          const stage = stageRef.current;
          if (stage) {
            const oldScale = stage.scaleX();
            const zoomFactor = currentDistance / lastTouchDistanceRef.current;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * zoomFactor));

            // Calculate zoom center (convert screen coords to canvas coords)
            const stageBox = stage.getStage().container().getBoundingClientRect();
            const pointerPos = {
              x: currentCenter.x - stageBox.left,
              y: currentCenter.y - stageBox.top,
            };

            const mousePointTo = {
              x: (pointerPos.x - stage.x()) / oldScale,
              y: (pointerPos.y - stage.y()) / oldScale,
            };

            const newPos = {
              x: pointerPos.x - mousePointTo.x * newScale,
              y: pointerPos.y - mousePointTo.y * newScale,
            };

            emitViewportChange({ x: newPos.x, y: newPos.y, scale: newScale });
            touchViewportChangedRef.current = true;
            lastTouchDistanceRef.current = currentDistance;
          }
        } else {
          // Two-finger pan (small or no distance change, but center moved)
          const dx = currentCenter.x - lastPosRef.current.x;
          const dy = currentCenter.y - lastPosRef.current.y;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            emitViewportChange({
              x: viewport.x + dx,
              y: viewport.y + dy,
              scale: viewport.scale,
            });
            touchViewportChangedRef.current = true;
            lastPosRef.current = currentCenter;
          }
        }
      }
    },
    [viewport, emitViewportChange, stageRef]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const shouldCommitViewport = touchViewportChangedRef.current && e.touches.length < 2;
    touchesRef.current = e.touches;
    lastTouchDistanceRef.current = 0;
    if (shouldCommitViewport) {
      touchViewportChangedRef.current = false;
      emitViewportCommit();
    }
  }, [emitViewportCommit]);

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
    const nextViewport = { x: w / 2, y: h / 2, scale: 1 };
    emitViewportChange(nextViewport);
    emitViewportCommit(nextViewport);
  }

  return (
    <div
      ref={containerRef}
      className="refboard-canvas-container"
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }} // Prevent browser touch scrolling/zoom
    >
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
