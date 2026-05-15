import { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  ariaLabel?: string;
  onAddText?: () => void;
  onAddImage?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onCropStart?: () => void;
  cropLabel?: string;
}

export function ContextMenu({
  x,
  y,
  onClose,
  ariaLabel = 'Layer actions',
  onAddText,
  onAddImage,
  onDelete,
  onDuplicate,
  onCopy,
  onPaste,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  onCropStart,
  cropLabel = 'Crop Image',
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  function item(label: string, action: () => void) {
    return (
      <button
        className="refboard-ctx-item"
        onMouseDown={(e) => {
          e.stopPropagation();
          action();
          onClose();
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      ref={menuRef}
      className="refboard-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={ariaLabel}
    >
      {onAddText && item('Add Text', onAddText)}
      {onAddImage && item('Add Image', onAddImage)}
      {(onAddText || onAddImage) && (onCopy || onDuplicate || onPaste || onCropStart || onBringToFront || onSendToBack || onBringForward || onSendBackward || onDelete) && (
        <div className="refboard-ctx-divider" />
      )}
      {onCopy && item('Copy', onCopy)}
      {onDuplicate && item('Duplicate', onDuplicate)}
      {onPaste && item('Paste', onPaste)}
      {onCropStart && item(cropLabel, onCropStart)}
      {(onCopy || onDuplicate || onPaste || onCropStart) && (onBringToFront || onSendToBack || onBringForward || onSendBackward || onDelete) && (
        <div className="refboard-ctx-divider" />
      )}
      {onBringToFront && item('Bring to Front', onBringToFront)}
      {onBringForward && item('Bring Forward', onBringForward)}
      {onSendBackward && item('Send Backward', onSendBackward)}
      {onSendToBack && item('Send to Back', onSendToBack)}
      {onDelete && (
        <>
          <div className="refboard-ctx-divider" />
          {item('Delete', onDelete)}
        </>
      )}
    </div>
  );
}
