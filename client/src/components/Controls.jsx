import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  MessageSquare,
  Users,
  Info,
  Copy,
  Check,
  Hand,
  Activity,
  Settings as SettingsIcon,
  ShieldCheck,
  Wifi,
  Keyboard,
  Smile
} from 'lucide-react';

export default function Controls({
  roomId,
  isHost,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isHandRaised,
  participantCount,
  activePanel,
  showStats,
  roomSettings,
  networkStats = { quality: 'excellent', rttMs: 0, packetLossPct: 0, jitterMs: 0 },
  micVolume = 0,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRaiseHand,
  onSendReaction = () => {},
  onTogglePanel,
  onToggleStats,
  onOpenSettings,
  onOpenShortcuts = () => {},
  onLeaveRoom
}) {
  const [currentTime, setCurrentTime] = useState('');
  const [copied, setCopied] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buttonStyle = (isActive, isAlert = false, isSage = false, isAmber = false, isDisabled = false) => ({
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: isAlert || isAmber || isSage || isActive ? 'none' : '1px solid #3A4245',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.35 : 1,
    backgroundColor: isAlert
      ? '#EA4335'
      : isAmber
      ? '#E5A967'
      : isSage
      ? '#9EAB9D'
      : isActive
      ? '#9EAB9D'
      : '#2E3538',
    color: isAmber || isSage || isActive ? '#252B2D' : '#F4F3EF',
    transition: 'background-color 0.2s, transform 0.1s',
    outline: 'none',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
  });

  const micDisabled = !isHost && !roomSettings.allowMic;
  const cameraDisabled = !isHost && !roomSettings.allowCamera;
  const screenDisabled = !isHost && !roomSettings.allowScreenShare;

  return (
    <div
      style={{
        height: '80px',
        backgroundColor: '#252B2D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        borderTop: '1px solid #3A4245',
        zIndex: 10,
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      {/* Left section: Time, Meeting Code, and Host Authority badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '240px' }}>
        <img
          src="/vortex-logo.png"
          alt="Vortex"
          style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'contain' }}
        />
        <span style={{ fontSize: '15px', color: '#F4F3EF', fontWeight: '600' }}>
          {currentTime}
        </span>
        <span style={{ color: '#4D575B' }}>|</span>
        <span
          style={{
            fontSize: '14px',
            color: '#C5CCC4',
            letterSpacing: '0.5px',
            fontWeight: '500'
          }}
        >
          {roomId}
        </span>
        <button
          onClick={handleCopyLink}
          title="Copy meeting link"
          style={{
            background: 'none',
            border: 'none',
            color: copied ? '#9EAB9D' : '#8A9497',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            borderRadius: '4px',
            transition: 'color 0.2s'
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>

        {isHost && (
          <span
            title="You are the meeting host"
            style={{
              fontSize: '11px',
              backgroundColor: 'rgba(158, 171, 157, 0.2)',
              color: '#9EAB9D',
              border: '1px solid rgba(158, 171, 157, 0.3)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <ShieldCheck size={12} /> Host
          </span>
        )}

        {/* Realtime WebRTC Network Quality Pill */}
        <div
          title={`Network: ${networkStats.quality.toUpperCase()} | Latency: ${networkStats.rttMs || '<10'}ms | Loss: ${networkStats.packetLossPct || '0'}% | Jitter: ${networkStats.jitterMs || '0'}ms`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor:
              networkStats.quality === 'poor'
                ? 'rgba(234, 67, 53, 0.15)'
                : networkStats.quality === 'fair'
                ? 'rgba(229, 169, 103, 0.15)'
                : 'rgba(158, 171, 157, 0.15)',
            color:
              networkStats.quality === 'poor'
                ? '#EA4335'
                : networkStats.quality === 'fair'
                ? '#E5A967'
                : '#9EAB9D',
            border: `1px solid ${
              networkStats.quality === 'poor'
                ? 'rgba(234, 67, 53, 0.3)'
                : networkStats.quality === 'fair'
                ? 'rgba(229, 169, 103, 0.3)'
                : 'rgba(158, 171, 157, 0.3)'
            }`,
            cursor: 'help'
          }}
        >
          <Wifi size={12} />
          <span>{networkStats.rttMs ? `${networkStats.rttMs}ms` : 'Good'}</span>
        </div>
      </div>

      {/* Center section: Main Call Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Mic Toggle */}
        <button
          onClick={onToggleAudio}
          disabled={micDisabled && isAudioMuted}
          title={
            micDisabled
              ? 'Microphones are locked by host'
              : isAudioMuted
              ? 'Turn on microphone (Ctrl + d)'
              : 'Turn off microphone (Ctrl + d)'
          }
          style={buttonStyle(false, isAudioMuted, false, false, micDisabled && isAudioMuted)}
        >
          {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {/* Video Toggle */}
        <button
          onClick={onToggleVideo}
          disabled={cameraDisabled && isVideoOff}
          title={
            cameraDisabled
              ? 'Cameras are locked by host'
              : isVideoOff
              ? 'Turn on camera (Ctrl + e)'
              : 'Turn off camera (Ctrl + e)'
          }
          style={buttonStyle(false, isVideoOff, false, false, cameraDisabled && isVideoOff)}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={onToggleScreenShare}
          disabled={screenDisabled && !isScreenSharing}
          title={
            screenDisabled
              ? 'Screen sharing restricted to host'
              : isScreenSharing
              ? 'Stop presenting'
              : 'Present now'
          }
          style={buttonStyle(false, false, isScreenSharing, false, screenDisabled && !isScreenSharing)}
        >
          <ScreenShare size={20} />
        </button>

        {/* Raise Hand Toggle */}
        <button
          onClick={onToggleRaiseHand}
          title={isHandRaised ? 'Lower hand' : 'Raise hand'}
          style={buttonStyle(false, false, false, isHandRaised)}
        >
          <Hand size={20} />
        </button>

        {/* Emoji Reactions (F-01) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowReactions(!showReactions)}
            title="Send a reaction"
            style={buttonStyle(showReactions)}
          >
            <Smile size={20} />
          </button>

          {showReactions && (
            <div
              style={{
                position: 'absolute',
                bottom: '60px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#2E3538',
                border: '1px solid #3A4245',
                borderRadius: '30px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 50,
                backdropFilter: 'blur(8px)'
              }}
            >
              {['👍', '🎉', '❤️', '😂', '😮', '🙌', '👏', '🔥'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onSendReaction(emoji);
                    setShowReactions(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '50%',
                    transition: 'transform 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Leave Call Button */}
        <button
          onClick={onLeaveRoom}
          title="Leave call"
          style={{
            ...buttonStyle(false, true),
            width: '64px',
            borderRadius: '24px'
          }}
        >
          <PhoneOff size={22} />
        </button>
      </div>

      {/* Right section: Panels and Extra Tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '240px', justifyContent: 'flex-end' }}>
        {/* Scale Telemetry HUD - Host Only */}
        {isHost && (
          <button
            onClick={onToggleStats}
            title="Scalability & bandwidth telemetry"
            style={{
              background: 'none',
              border: 'none',
              color: showStats ? '#9EAB9D' : '#C5CCC4',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s'
            }}
          >
            <Activity size={22} />
          </button>
        )}

        {/* Meeting Info */}
        <button
          onClick={() => onTogglePanel('info')}
          title="Meeting details"
          style={{
            background: 'none',
            border: 'none',
            color: activePanel === 'info' ? '#9EAB9D' : '#C5CCC4',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s'
          }}
        >
          <Info size={22} />
        </button>

        {/* Participants Panel - Host Only */}
        {isHost && (
          <button
            onClick={() => onTogglePanel('people')}
            title="Participants"
            style={{
              background: 'none',
              border: 'none',
              color: activePanel === 'people' ? '#9EAB9D' : '#C5CCC4',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              position: 'relative',
              transition: 'color 0.2s'
            }}
          >
            <Users size={22} />
            {participantCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  backgroundColor: '#9EAB9D',
                  color: '#252B2D',
                  fontSize: '11px',
                  fontWeight: '700',
                  borderRadius: '10px',
                  padding: '1px 5px',
                  lineHeight: '14px'
                }}
              >
                {participantCount}
              </span>
            )}
          </button>
        )}

        {/* Chat Panel */}
        <button
          onClick={() => onTogglePanel('chat')}
          title="Chat with everyone"
          style={{
            background: 'none',
            border: 'none',
            color: activePanel === 'chat' ? '#9EAB9D' : '#C5CCC4',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s'
          }}
        >
          <MessageSquare size={22} />
        </button>

        {/* Settings Icon (Meeting & Personal settings) */}
        <button
          onClick={onOpenSettings}
          title="Settings (Admin & Personal)"
          style={{
            background: 'none',
            border: 'none',
            color: '#C5CCC4',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            transition: 'transform 0.2s, color 0.2s'
          }}
        >
          <SettingsIcon size={22} />
        </button>

        {/* Keyboard Shortcuts Help */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts (?)"
          style={{
            background: 'none',
            border: 'none',
            color: '#8A9497',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s'
          }}
        >
          <Keyboard size={20} />
        </button>
      </div>
    </div>
  );
}
