import React, { useEffect, useRef } from 'react';
import { MicOff, Pin, Hand, Volume2 } from 'lucide-react';

export default function VideoTile({
  stream,
  userName,
  isAudioMuted = false,
  isVideoOff = false,
  isLocal = false,
  isScreenSharing = false,
  isPinned = false,
  isSpeaking = false,
  isHandRaised = false,
  onPin = () => {}
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initial = userName ? userName.charAt(0).toUpperCase() : '?';

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: '#3c4043',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        boxShadow: isSpeaking
          ? '0 0 0 3px #1a73e8, 0 8px 16px rgba(26, 115, 232, 0.4)'
          : isPinned
          ? '0 0 0 2px #8ab4f8'
          : '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.2s ease-in-out',
        border: '1px solid #4a4d51'
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isScreenSharing ? 'contain' : 'cover',
          transform: isLocal && !isScreenSharing ? 'scaleX(-1)' : 'none',
          display: isVideoOff ? 'none' : 'block'
        }}
      />

      {/* Avatar when camera is turned off */}
      {isVideoOff && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              backgroundColor: isSpeaking ? '#1a73e8' : '#5f6368',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              fontWeight: '600',
              boxShadow: isSpeaking ? '0 0 20px rgba(26, 115, 232, 0.8)' : '0 4px 12px rgba(0,0,0,0.4)',
              transition: 'background-color 0.2s, box-shadow 0.2s'
            }}
          >
            {initial}
          </div>
          <span style={{ fontSize: '15px', color: '#e8eaed', fontWeight: '500' }}>
            {userName} {isLocal && '(You)'}
          </span>
        </div>
      )}

      {/* Top Left: Hand Raised Badge */}
      {isHandRaised && (
        <div
          title="Hand is raised"
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            backgroundColor: '#f2994a',
            color: '#202124',
            borderRadius: '16px',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontWeight: '600',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
          }}
        >
          <Hand size={14} /> Raised hand
        </div>
      )}

      {/* Top Right: Pin button */}
      <button
        onClick={onPin}
        title={isPinned ? 'Unpin' : 'Pin to screen'}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          backgroundColor: isPinned ? '#8ab4f8' : 'rgba(32, 33, 36, 0.7)',
          color: isPinned ? '#202124' : '#ffffff',
          border: 'none',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          transition: 'all 0.2s'
        }}
      >
        <Pin size={16} />
      </button>

      {/* Bottom info pill */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          backgroundColor: 'rgba(32, 33, 36, 0.8)',
          padding: '4px 10px',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(4px)',
          maxWidth: 'calc(100% - 24px)'
        }}
      >
        <span
          style={{
            fontSize: '13px',
            color: '#ffffff',
            fontWeight: '500',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {userName} {isLocal && '(You)'}
        </span>

        {isSpeaking && !isAudioMuted && (
          <Volume2 size={14} color="#8ab4f8" className="animate-pulse" />
        )}

        {isAudioMuted && (
          <div
            style={{
              backgroundColor: '#ea4335',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <MicOff size={12} color="#ffffff" />
          </div>
        )}
      </div>
    </div>
  );
}
