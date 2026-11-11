import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

export default function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Spacebar', desc: 'Push to Talk (hold to unmute when muted)' },
    { key: 'Ctrl + D / ⌘ + D', desc: 'Toggle Microphone on / off' },
    { key: 'Ctrl + E / ⌘ + E', desc: 'Toggle Camera on / off' },
    { key: 'Ctrl + H / ⌘ + H', desc: 'Raise or lower hand' },
    { key: 'Ctrl + Shift + P', desc: 'Toggle Picture-in-Picture window' },
    { key: '?', desc: 'Open / close this shortcuts guide' },
    { key: 'Esc', desc: 'Close open panels, dialogs, or settings' }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#252B2D',
          border: '1px solid #3A4245',
          borderRadius: '20px',
          width: '480px',
          maxWidth: '92vw',
          padding: '28px',
          color: '#F4F3EF',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            borderBottom: '1px solid #3A4245',
            paddingBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Keyboard size={20} color="#9EAB9D" />
            <h3
              style={{
                margin: 0,
                fontSize: '18px',
                fontFamily: "var(--font-display, 'Playfair Display', serif)",
                letterSpacing: '0.5px'
              }}
            >
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9EAB9D',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {shortcuts.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: '#2E3538',
                borderRadius: '10px',
                border: '1px solid rgba(158, 171, 157, 0.15)'
              }}
            >
              <span style={{ fontSize: '13px', color: '#F4F3EF', fontWeight: '400' }}>
                {item.desc}
              </span>
              <kbd
                style={{
                  backgroundColor: '#252B2D',
                  border: '1px solid #3A4245',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#9EAB9D',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            fontSize: '11px',
            color: '#9EAB9D',
            letterSpacing: '0.5px'
          }}
        >
          VORTEX REALTIME VIDEO SUITE
        </div>
      </div>
    </div>
  );
}
