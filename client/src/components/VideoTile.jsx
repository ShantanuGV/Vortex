import React, { useEffect, useRef, useState } from 'react';
import { MicOff, Pin, Hand, Volume2, PictureInPicture2 } from 'lucide-react';
import { getParticipantColor } from '../utils/colors';

const VideoTile = React.memo(function VideoTile({
  stream,
  userName,
  peerId,
  isAudioMuted = false,
  isVideoOff = false,
  isLocal = false,
  isScreenSharing = false,
  isPinned = false,
  isSpeaking = false,
  isHandRaised = false,
  isHost = false,
  mirrorVideo = true,
  lightingBoost = false,
  backgroundEffect = 'none',
  onPin = () => {},
  onMutePeer = () => {}
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }

    if (audioRef.current && !isLocal) {
      if (stream && stream.getAudioTracks().length > 0) {
        if (audioRef.current.srcObject !== stream) {
          audioRef.current.srcObject = stream;
        }
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.srcObject = null;
      }
    }
  }, [stream, isLocal]);

  const initial = userName ? userName.charAt(0).toUpperCase() : '?';
  const avatarBgColor = getParticipantColor(userName || peerId || 'User');

  let videoFilter = 'none';
  if (backgroundEffect === 'slight-blur') {
    videoFilter = 'blur(4px)';
  } else if (backgroundEffect === 'heavy-blur') {
    videoFilter = 'blur(10px)';
  }
  if (lightingBoost) {
    videoFilter = videoFilter === 'none' ? 'brightness(1.22) contrast(1.08)' : `${videoFilter} brightness(1.22) contrast(1.08)`;
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        backgroundColor: '#2E3538',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        boxShadow: isSpeaking
          ? '0 0 0 2px #9EAB9D, 0 8px 24px rgba(158, 171, 157, 0.35)'
          : isPinned
          ? '0 0 0 2px #F4F3EF'
          : '0 4px 12px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        border: '1px solid #3A4245'
      }}
    >
      {/* Remote Audio Track Playback */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
        />
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isScreenSharing ? 'contain' : 'cover',
          transform: isLocal && !isScreenSharing && mirrorVideo ? 'scaleX(-1)' : 'none',
          opacity: isVideoOff ? 0 : 1,
          filter: videoFilter,
          pointerEvents: isVideoOff ? 'none' : 'auto',
          transition: 'opacity 0.25s ease'
        }}
      />

      {/* Aesthetic Avatar Display when camera is off */}
      {isVideoOff && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            backgroundColor: '#2E3538',
            zIndex: 2
          }}
        >
          <div
            style={{
              width: '92px',
              height: '92px',
              borderRadius: '50%',
              backgroundColor: avatarBgColor,
              color: '#F4F3EF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '34px',
              fontFamily: 'var(--font-display)',
              fontWeight: '500',
              border: '2px solid rgba(244, 243, 239, 0.2)',
              boxShadow: isSpeaking 
                ? '0 0 0 4px rgba(158, 171, 157, 0.4), 0 8px 24px rgba(0,0,0,0.5)' 
                : '0 6px 16px rgba(0, 0, 0, 0.4)',
              transition: 'all 0.25s ease'
            }}
          >
            {initial}
          </div>
          <span
            style={{
              fontSize: '14px',
              color: '#F4F3EF',
              fontWeight: '500',
              letterSpacing: '-0.01em'
            }}
          >
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
            backgroundColor: '#D8A464',
            color: '#252B2D',
            borderRadius: '20px',
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            zIndex: 4
          }}
        >
          <Hand size={13} /> Raised hand
        </div>
      )}

      {/* Top Right Actions (Pin & Admin Quick Mute) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 4
        }}
      >
        {/* Admin Quick Mute Button */}
        {isHost && !isLocal && !isAudioMuted && (isHovered || isSpeaking) && (
          <button
            onClick={() => onMutePeer(peerId)}
            title="Mute this participant"
            style={{
              backgroundColor: 'rgba(217, 107, 107, 0.9)',
              color: '#F4F3EF',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(4px)',
              transition: 'transform 0.15s, background-color 0.2s'
            }}
          >
            <MicOff size={14} />
          </button>
        )}

        {/* Picture-in-Picture Button */}
        {isHovered && !isVideoOff && document.pictureInPictureEnabled && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (videoRef.current) {
                try {
                  if (document.pictureInPictureElement === videoRef.current) {
                    await document.exitPictureInPicture();
                  } else {
                    await videoRef.current.requestPictureInPicture();
                  }
                } catch (err) {
                  console.warn('PiP failed:', err);
                }
              }
            }}
            title="Pop out in Picture-in-Picture window"
            style={{
              backgroundColor: 'rgba(37, 43, 45, 0.75)',
              color: '#F4F3EF',
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
            <PictureInPicture2 size={15} />
          </button>
        )}

        {/* Pin button */}
        {(isHovered || isPinned) && (
          <button
            onClick={onPin}
            title={isPinned ? 'Unpin from screen' : 'Pin to screen'}
            style={{
              backgroundColor: isPinned ? '#F4F3EF' : 'rgba(37, 43, 45, 0.75)',
              color: isPinned ? '#252B2D' : '#F4F3EF',
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
            <Pin size={15} />
          </button>
        )}
      </div>

      {/* Bottom Info Pill (With Google Meet-style highlighted "You" tag) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          backgroundColor: 'rgba(37, 43, 45, 0.85)',
          padding: '4px 10px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(6px)',
          maxWidth: 'calc(100% - 24px)',
          border: '1px solid rgba(244, 243, 239, 0.08)',
          zIndex: 4
        }}
      >
        <span
          style={{
            fontSize: '13px',
            color: '#F4F3EF',
            fontWeight: '500',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {userName}
        </span>

        {/* Highlighted "You" Badge like Google Meet */}
        {isLocal && (
          <span
            style={{
              backgroundColor: 'rgba(158, 171, 157, 0.25)',
              color: '#9EAB9D',
              padding: '1px 6px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              letterSpacing: '0.2px'
            }}
          >
            You
          </span>
        )}

        {isSpeaking && !isAudioMuted && (
          <Volume2 size={14} color="#9EAB9D" className="animate-pulse" />
        )}

        {isAudioMuted && (
          <div
            style={{
              backgroundColor: '#D96B6B',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <MicOff size={11} color="#F4F3EF" />
          </div>
        )}
      </div>
    </div>
  );
});

export default VideoTile;
