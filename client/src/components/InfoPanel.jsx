import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

export default function InfoPanel({ roomId, onClose }) {
  const [copied, setCopied] = useState(false);
  const meetUrl = `${window.location.origin}/?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(meetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        width: '360px',
        height: '100%',
        backgroundColor: '#252B2D',
        borderLeft: '1px solid #3A4245',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      <div
        style={{
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #3A4245'
        }}
      >
        <h3
          style={{
            fontSize: '18px',
            fontWeight: '600',
            fontFamily: "var(--font-display, 'Playfair Display', serif)",
            color: '#F4F3EF',
            letterSpacing: '0.3px',
            margin: 0
          }}
        >
          Meeting details
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9EAB9D',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            transition: 'background-color 0.2s'
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <span
            style={{
              fontSize: '11px',
              color: '#9EAB9D',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: '600'
            }}
          >
            Joining link
          </span>
          <div
            style={{
              fontSize: '13px',
              color: '#F4F3EF',
              marginTop: '8px',
              wordBreak: 'break-all',
              backgroundColor: '#2E3538',
              border: '1px solid #3A4245',
              borderRadius: '8px',
              padding: '10px 12px'
            }}
          >
            {meetUrl}
          </div>
        </div>

        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: '#9EAB9D',
            border: 'none',
            borderRadius: '24px',
            padding: '12px 18px',
            color: '#252B2D',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s, transform 0.1s',
            boxShadow: '0 4px 12px rgba(158, 171, 157, 0.25)'
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          <span>{copied ? 'Link copied' : 'Copy joining info'}</span>
        </button>

        <div style={{ borderTop: '1px solid #3A4245', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', color: '#C5CCC4' }}>
            Meeting code: <strong style={{ color: '#F4F3EF' }}>{roomId}</strong>
          </div>
          <p style={{ fontSize: '12px', color: '#8A9497', marginTop: '6px', lineHeight: '1.4' }}>
            VORTEX engine utilizes STUN/TURN relays with selective peer mesh virtualization for optimal scale.
          </p>
        </div>
      </div>
    </div>
  );
}
