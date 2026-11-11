import React, { useState } from 'react';
import VideoGrid from './VideoGrid';
import Controls from './Controls';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import InfoPanel from './InfoPanel';

export default function MeetingRoom({
  localStream,
  userName,
  roomId,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  remotePeers,
  chatMessages,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onSendMessage,
  onLeaveRoom
}) {
  const [activePanel, setActivePanel] = useState(null); // 'chat' | 'people' | 'info' | null

  const handleTogglePanel = (panelName) => {
    setActivePanel((current) => (current === panelName ? null : panelName));
  };

  const participantCount = 1 + Object.keys(remotePeers).length;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#202124',
        overflow: 'hidden'
      }}
    >
      {/* Main Center Video Area + Optional Side Panel */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Video Grid */}
        <div style={{ flex: 1, height: '100%', position: 'relative' }}>
          <VideoGrid
            localStream={localStream}
            userName={userName}
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            remotePeers={remotePeers}
          />
        </div>

        {/* Slide-out Panels */}
        {activePanel === 'chat' && (
          <ChatPanel
            chatMessages={chatMessages}
            onSendMessage={onSendMessage}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'people' && (
          <ParticipantsPanel
            userName={userName}
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            remotePeers={remotePeers}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'info' && (
          <InfoPanel
            roomId={roomId}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>

      {/* Bottom Controls Bar */}
      <Controls
        roomId={roomId}
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        participantCount={participantCount}
        activePanel={activePanel}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onTogglePanel={handleTogglePanel}
        onLeaveRoom={onLeaveRoom}
      />
    </div>
  );
}

