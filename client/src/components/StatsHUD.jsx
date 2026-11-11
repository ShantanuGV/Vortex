import React from 'react';
import { Activity, X } from 'lucide-react';

export default function StatsHUD({ telemetry, activeSpeakerName, onClose }) {
  if (!telemetry) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: '320px',
        backgroundColor: 'rgba(37, 43, 45, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1px solid #3A4245',
        borderRadius: '14px',
        padding: '16px 18px',
        color: '#F4F3EF',
        zIndex: 50,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        fontSize: '13px',
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="#9EAB9D" />
          <span
            style={{
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: "var(--font-display, 'Playfair Display', serif)",
              color: '#F4F3EF'
            }}
          >
            Scale & Telemetry HUD
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#8A9497', cursor: 'pointer', padding: '4px' }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3A4245', paddingBottom: '6px' }}>
          <span style={{ color: '#8A9497' }}>Architecture:</span>
          <span style={{ color: '#9EAB9D', fontWeight: '600' }}>Star / Host-Broadcast</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3A4245', paddingBottom: '6px' }}>
          <span style={{ color: '#8A9497' }}>Your Role:</span>
          <span style={{ color: '#F4F3EF', fontWeight: '600' }}>
            {telemetry.isHost ? 'Meeting Host (Managing)' : 'Audience (Host Only)'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3A4245', paddingBottom: '6px' }}>
          <span style={{ color: '#8A9497' }}>Total in Room:</span>
          <strong style={{ color: '#9EAB9D' }}>{telemetry.totalParticipants} participants</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3A4245', paddingBottom: '6px' }}>
          <span style={{ color: '#8A9497' }}>Active WebRTC Feeds:</span>
          <strong>{telemetry.activeStreams} active feeds</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3A4245', paddingBottom: '6px' }}>
          <span style={{ color: '#8A9497' }}>Bandwidth & CPU Saved:</span>
          <span style={{ color: '#9EAB9D', fontWeight: '700' }}>
            {telemetry.savingsPercent}% saved
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3A4245', paddingBottom: '6px' }}>
          <span style={{ color: '#8A9497' }}>Grid Virtualization:</span>
          <span>Page {telemetry.page} of {telemetry.totalPages}</span>
        </div>

        {activeSpeakerName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px' }}>
            <span style={{ color: '#8A9497' }}>Active Speaker:</span>
            <span style={{ color: '#E5A967', fontWeight: '600' }}>{activeSpeakerName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
