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
        backgroundColor: '#202124',
        borderLeft: '1px solid #3c4043',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #3c4043'
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>
          Meeting details
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#bdc1c6',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '600' }}>
            Joining info
          </span>
          <div
            style={{
              fontSize: '14px',
              color: '#8ab4f8',
              marginTop: '8px',
              wordBreak: 'break-all'
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
            backgroundColor: '#303134',
            border: '1px solid #5f6368',
            borderRadius: '8px',
            padding: '10px 16px',
            color: '#8ab4f8',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {copied ? <Check size={18} color="#81c995" /> : <Copy size={18} />}
          <span>{copied ? 'Link copied' : 'Copy joining info'}</span>
        </button>

        <div style={{ borderTop: '1px solid #3c4043', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', color: '#bdc1c6' }}>
            Meeting code: <strong style={{ color: '#ffffff' }}>{roomId}</strong>
          </div>
          <p style={{ fontSize: '12px', color: '#80868b', marginTop: '6px' }}>
            REA WebRTC Engine powered by Google STUN servers.
          </p>
        </div>
      </div>
    </div>
  );
}

