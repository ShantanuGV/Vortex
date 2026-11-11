import React, { useState } from 'react';
import VideoGrid from './VideoGrid';
import Controls from './Controls';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import InfoPanel from './InfoPanel';
import StatsHUD from './StatsHUD';

export default function MeetingRoom({
  localStream,
  userName,
  roomId,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isHandRaised,
  roster,
  remoteStreams,
  currentPage,
  totalPages,
  setCurrentPage,
  activeSpeakerId,
  telemetry,
  chatMessages,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRaiseHand,
  onSendMessage,
  onLeaveRoom
}) {
  const [activePanel, setActivePanel] = useState(null); // 'chat' | 'people' | 'info' | null
  const [showStats, setShowStats] = useState(false);

  const handleTogglePanel = (panelName) => {
    setActivePanel((current) => (current === panelName ? null : panelName));
  };

  const participantCount = 1 + Object.keys(roster).length;
  const activeSpeaker = activeSpeakerId ? roster[activeSpeakerId]?.userName : null;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#202124',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Scalability & Telemetry HUD */}
      {showStats && (
        <StatsHUD
          telemetry={telemetry}
          activeSpeakerName={activeSpeaker}
          onClose={() => setShowStats(false)}
        />
      )}

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
            isHandRaised={isHandRaised}
            roster={roster}
            remoteStreams={remoteStreams}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            activeSpeakerId={activeSpeakerId}
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
            isHandRaised={isHandRaised}
            roster={roster}
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
        isHandRaised={isHandRaised}
        participantCount={participantCount}
        activePanel={activePanel}
        showStats={showStats}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onToggleRaiseHand={onToggleRaiseHand}
        onTogglePanel={handleTogglePanel}
        onToggleStats={() => setShowStats(!showStats)}
        onLeaveRoom={onLeaveRoom}
      />
    </div>
  );
}
