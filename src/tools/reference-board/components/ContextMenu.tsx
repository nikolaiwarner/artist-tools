import { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onCropStart?: () => void;
  cropLabel?: string;
}

export function ContextMenu({
  x,
  y,
  onClose,
  onDelete,
  onDuplicate,
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
      aria-label="Layer actions"
    >
      {item('Duplicate', onDuplicate)}
      {onCropStart && item(cropLabel, onCropStart)}
      <div className="refboard-ctx-divider" />
      {item('Bring to Front', onBringToFront)}
      {item('Bring Forward', onBringForward)}
      {item('Send Backward', onSendBackward)}
      {item('Send to Back', onSendToBack)}
      <div className="refboard-ctx-divider" />
      {item('Delete', onDelete)}
    </div>
  );
}
