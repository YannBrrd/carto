/**
 * Context menu component for zone operations (delete, etc.)
 */

import React from 'react';

export interface ContextMenuState {
  x: number;
  y: number;
  zoneId: string;
}

interface ZoneContextMenuProps {
  contextMenu: ContextMenuState | null;
  onDelete: (zoneId: string) => void;
  onClose: () => void;
}

const ZoneContextMenu: React.FC<ZoneContextMenuProps> = ({
  contextMenu,
  onDelete,
  onClose,
}) => {
  if (!contextMenu) return null;

  return (
    <div
      className="zone-context-menu"
      style={{
        position: 'fixed',
        left: contextMenu.x,
        top: contextMenu.y,
        zIndex: 2000,
        background: 'white',
        borderRadius: '4px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        padding: '4px 0',
        minWidth: '150px',
      }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          onDelete(contextMenu.zoneId);
          onClose();
        }}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '13px',
          color: '#1f2937',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Supprimer cette zone
      </button>
    </div>
  );
};

export default ZoneContextMenu;
