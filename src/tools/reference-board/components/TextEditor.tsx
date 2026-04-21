import { useRef, useEffect } from 'react';
import type Konva from 'konva';

interface TextEditorProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  viewport: { x: number; y: number; scale: number };
  layerX: number;
  layerY: number;
  layerRotation: number;
  layerScale: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  fill: string;
  width: number;
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
}

export function TextEditor({
  stageRef,
  viewport,
  layerX,
  layerY,
  layerRotation,
  layerScale,
  fontSize,
  fontFamily,
  bold,
  italic,
  fill,
  width,
  value,
  onChange,
  onBlur,
}: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const stage = stageRef.current;
  if (!stage) return null;
  const container = stage.container();
  const rect = container.getBoundingClientRect();

  const screenX = rect.left + viewport.x + layerX * viewport.scale;
  const screenY = rect.top + viewport.y + layerY * viewport.scale;
  const scaledWidth = width * viewport.scale * layerScale;
  const scaledFontSize = fontSize * viewport.scale * layerScale;

  return (
    <textarea
      ref={ref}
      className="refboard-text-editor"
      style={{
        left: screenX,
        top: screenY,
        width: scaledWidth,
        fontSize: scaledFontSize,
        fontFamily,
        fontWeight: bold ? 600 : 400,
        fontStyle: italic ? 'italic' : 'normal',
        color: fill,
        transform: `rotate(${layerRotation}deg)`,
        transformOrigin: 'top left',
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onBlur();
        e.stopPropagation();
      }}
    />
  );
}
