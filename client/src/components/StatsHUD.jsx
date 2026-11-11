import React from 'react';
import { Activity, ShieldCheck, Zap, X, Cpu } from 'lucide-react';

export default function StatsHUD({ telemetry, activeSpeakerName, onClose }) {
  if (!telemetry) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: '320px',
        backgroundColor: 'rgba(32, 33, 36, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #5f6368',
        borderRadius: '12px',
        padding: '16px',
        color: '#ffffff',
        zIndex: 50,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        fontSize: '13px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="#8ab4f8" />
          <span style={{ fontWeight: '600', fontSize: '14px', color: '#e8eaed' }}>
            Scale & Telemetry HUD
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#bdc1c6', cursor: 'pointer', padding: '2px' }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '6px' }}>
          <span style={{ color: '#9aa0a6' }}>Total Participants:</span>
          <strong style={{ color: '#81c995' }}>{telemetry.totalParticipants} in call</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '6px' }}>
          <span style={{ color: '#9aa0a6' }}>Subscribed Streams:</span>
          <strong>{telemetry.activeStreams} active video feeds</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '6px' }}>
          <span style={{ color: '#9aa0a6' }}>Bandwidth & CPU Saved:</span>
          <span style={{ color: '#8ab4f8', fontWeight: '700' }}>
            {telemetry.savingsPercent}% saved
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '6px' }}>
          <span style={{ color: '#9aa0a6' }}>Grid Virtualization:</span>
          <span>Page {telemetry.page} of {telemetry.totalPages}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '6px' }}>
          <span style={{ color: '#9aa0a6' }}>Active Speaker:</span>
          <span style={{ color: activeSpeakerName ? '#fbbc04' : '#bdc1c6' }}>
            {activeSpeakerName || 'None'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#81c995', fontSize: '11px' }}>
          <ShieldCheck size={14} />
          <span>Zero-Transcoding Selective Forwarding Active</span>
        </div>
      </div>
    </div>
  );
}
