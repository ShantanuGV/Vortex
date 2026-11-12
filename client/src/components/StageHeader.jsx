import React, { useState, useEffect } from 'react';
import {
  Shield,
  Copy,
  Check,
  Megaphone,
  Hand,
  Activity,
  Lock,
  Radio,
  X
} from 'lucide-react';

export default function StageHeader({
  roomId,
  isHost,
  participantCount,
  raisedHandsCount = 0,
  stageAnnouncement = null,
  onClearAnnouncement = () => {},
  onOpenAnnouncementModal = () => {},
  onOpenHostConsole = () => {},
  onLowerAllHands = () => {},
  onToggleStats = () => {},
  showStats = false,
  isLocked = false
}) {
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Meeting duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header
      style={{
        height: '62px',
        backgroundColor: '#252B2D',
        borderBottom: '1px solid #3A4245',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 30,
        position: 'relative',
        userSelect: 'none',
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      {/* Left: VORTEX Branding & Room Metadata */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* VORTEX Logo & Brand Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/vortex-logo.png"
            alt="VORTEX"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-display, 'Playfair Display', serif)",
              fontSize: '20px',
              fontWeight: '700',
              color: '#F4F3EF',
              letterSpacing: '1px'
            }}
          >
            VORTEX
          </span>
        </div>

        <div style={{ width: '1px', height: '22px', backgroundColor: '#3A4245' }} />

        {/* Room Code Badge with 1-Click Copy */}
        <div
          onClick={handleCopyLink}
          title="Click to copy meeting link"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            padding: '4px 10px',
            borderRadius: '16px',
            fontSize: '12px',
            color: '#F4F3EF',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#373F43')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2E3538')}
        >
          <span style={{ fontWeight: '500', letterSpacing: '0.4px' }}>{roomId}</span>
          {copied ? <Check size={13} color="#9EAB9D" /> : <Copy size={13} color="#9EAB9D" />}
        </div>

        {/* Live Status Pill & Timer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(234, 67, 53, 0.12)',
            border: '1px solid rgba(234, 67, 53, 0.35)',
            padding: '3px 10px',
            borderRadius: '14px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#F4F3EF'
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#EA4335',
              display: 'inline-block'
            }}
            className="animate-pulse"
          />
          <span style={{ color: '#EA4335', fontWeight: '700' }}>LIVE</span>
          <span style={{ color: '#A6B0A8' }}>{formatTime(elapsedSeconds)}</span>
        </div>

        {isLocked && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(217, 107, 107, 0.15)',
              border: '1px solid #D96B6B',
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              color: '#F4F3EF'
            }}
          >
            <Lock size={11} color="#D96B6B" /> Locked
          </div>
        )}
      </div>

      {/* Center: Stage Broadcast Announcement Ribbon (if active) */}
      {stageAnnouncement && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#2E3538',
            border: '1px solid #9EAB9D',
            padding: '5px 16px',
            borderRadius: '20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            maxWidth: '520px',
            zIndex: 40
          }}
        >
          <Megaphone size={14} color="#9EAB9D" className="animate-pulse" />
          <span
            style={{
              fontSize: '12px',
              color: '#F4F3EF',
              fontWeight: '500',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {stageAnnouncement}
          </span>
          {isHost && (
            <button
              onClick={onClearAnnouncement}
              title="Clear stage announcement"
              style={{
                background: 'none',
                border: 'none',
                color: '#8A9497',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                marginLeft: '4px'
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Right: Executive Host Controls or Participant Mode Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isHost ? (
          <>
            {/* Live Audience Count Pill (Host ONLY) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#2E3538',
                border: '1px solid #3A4245',
                padding: '5px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                color: '#F4F3EF'
              }}
            >
              <Radio size={13} color="#9EAB9D" />
              <span>Audience:</span>
              <strong style={{ color: '#9EAB9D' }}>{participantCount}</strong>
            </div>

            {/* Lower All Hands Button (shown when attendees have raised hands) */}
            {raisedHandsCount > 0 && (
              <button
                type="button"
                onClick={onLowerAllHands}
                title="Lower all attendee raised hands"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: 'rgba(216, 164, 100, 0.15)',
                  border: '1px solid #D8A464',
                  color: '#D8A464',
                  padding: '5px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                <Hand size={13} /> Lower Hands ({raisedHandsCount})
              </button>
            )}

            {/* Broadcast Announcement Button */}
            <button
              type="button"
              onClick={onOpenAnnouncementModal}
              title="Broadcast message to all attendees"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#2E3538',
                border: '1px solid #3A4245',
                color: '#F4F3EF',
                padding: '5px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#373F43')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2E3538')}
            >
              <Megaphone size={13} color="#9EAB9D" /> Broadcast
            </button>

            {/* Dedicated Host Console Button */}
            <button
              type="button"
              onClick={onOpenHostConsole}
              title="Open Executive Host Console"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#9EAB9D',
                border: 'none',
                color: '#252B2D',
                padding: '6px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(158, 171, 157, 0.35)',
                transition: 'transform 0.1s'
              }}
            >
              <Shield size={14} /> Host Controls
            </button>

            {/* Telemetry HUD toggle */}
            <button
              type="button"
              onClick={onToggleStats}
              title="Toggle media fabric telemetry"
              style={{
                background: 'none',
                border: '1px solid #3A4245',
                color: showStats ? '#9EAB9D' : '#8A9497',
                padding: '6px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Activity size={14} />
            </button>
          </>
        ) : (
          /* Participant Privacy Mode - Clean, executive presentation status */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#2E3538',
              border: '1px solid #3A4245',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              color: '#F4F3EF'
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#9EAB9D'
              }}
            />
            <span style={{ color: '#9EAB9D', fontWeight: '600' }}>Executive Stage</span>
            <span style={{ color: '#8A9497' }}>· Connected</span>
          </div>
        )}
      </div>
    </header>
  );
}

