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
  Check
} from 'lucide-react';

export default function Controls({
  roomId,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  participantCount,
  activePanel, // 'chat' | 'people' | 'info' | null
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onTogglePanel,
  onLeaveRoom
}) {
  const [currentTime, setCurrentTime] = useState('');
  const [copied, setCopied] = useState(false);

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

  const buttonStyle = (isActive, isAlert = false, isAccent = false) => ({
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: isAlert
      ? '#ea4335'
      : isAccent
      ? '#1a73e8'
      : isActive
      ? '#8ab4f8'
      : '#3c4043',
    color: isActive ? '#202124' : '#ffffff',
    transition: 'background-color 0.2s, transform 0.1s',
    outline: 'none'
  });

  return (
    <div
      style={{
        height: '80px',
        backgroundColor: '#202124',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderTop: '1px solid #3c4043',
        zIndex: 10
      }}
    >
      {/* Left section: Time and Meeting Code */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '220px' }}>
        <span style={{ fontSize: '15px', color: '#ffffff', fontWeight: '500' }}>
          {currentTime}
        </span>
        <span style={{ color: '#5f6368' }}>|</span>
        <span
          style={{
            fontSize: '14px',
            color: '#bdc1c6',
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
            color: copied ? '#81c995' : '#bdc1c6',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px'
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      {/* Center section: Main Call Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Mic Toggle */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Turn on microphone (Ctrl + d)' : 'Turn off microphone (Ctrl + d)'}
          style={buttonStyle(false, isAudioMuted)}
        >
          {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {/* Video Toggle */}
        <button
          onClick={onToggleVideo}
          title={isVideoOff ? 'Turn on camera (Ctrl + e)' : 'Turn off camera (Ctrl + e)'}
          style={buttonStyle(false, isVideoOff)}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop presenting' : 'Present now'}
          style={buttonStyle(false, false, isScreenSharing)}
        >
          <ScreenShare size={20} />
        </button>

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px', justifyContent: 'flex-end' }}>
        {/* Meeting Info */}
        <button
          onClick={() => onTogglePanel('info')}
          title="Meeting details"
          style={{
            background: 'none',
            border: 'none',
            color: activePanel === 'info' ? '#8ab4f8' : '#e8eaed',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Info size={22} />
        </button>

        {/* Participants Panel */}
        <button
          onClick={() => onTogglePanel('people')}
          title="People"
          style={{
            background: 'none',
            border: 'none',
            color: activePanel === 'people' ? '#8ab4f8' : '#e8eaed',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            position: 'relative'
          }}
        >
          <Users size={22} />
          {participantCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                backgroundColor: '#1a73e8',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '10px',
                padding: '1px 5px',
                lineHeight: '14px'
              }}
            >
              {participantCount}
            </span>
          )}
        </button>

        {/* Chat Panel */}
        <button
          onClick={() => onTogglePanel('chat')}
          title="Chat with everyone"
          style={{
            background: 'none',
            border: 'none',
            color: activePanel === 'chat' ? '#8ab4f8' : '#e8eaed',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <MessageSquare size={22} />
        </button>
      </div>
    </div>
  );
}

