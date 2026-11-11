import React, { useState } from 'react';
import VideoGrid from './VideoGrid';
import Controls from './Controls';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import InfoPanel from './InfoPanel';
import StatsHUD from './StatsHUD';
import SettingsModal from './SettingsModal';

export default function MeetingRoom({
  localStream,
  userName,
  roomId,
  isHost,
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
  micVolume,
  telemetry,
  chatMessages,
  roomSettings,
  personalSettings,
  waitingPeers = [],
  onAdmitPeer = () => {},
  onDenyPeer = () => {},
  onAdmitAllPeers = () => {},
  onUpdateRoomSettings,
  onHostMuteAll,
  onHostMutePeer,
  onHostKickPeer,
  onHostEndMeeting,
  onUpdatePersonalSettings,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRaiseHand,
  onSendMessage,
  onLeaveRoom
}) {
  const [activePanel, setActivePanel] = useState(null); // 'chat' | 'people' | 'info' | null
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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
        backgroundColor: '#252B2D',
        color: '#F4F3EF',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Settings Modal (Meeting Admin & Personal Settings) */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        isHost={isHost}
        roomSettings={roomSettings}
        onUpdateRoomSettings={onUpdateRoomSettings}
        onHostMuteAll={onHostMuteAll}
        onHostEndMeeting={onHostEndMeeting}
        personalSettings={personalSettings}
        onUpdatePersonalSettings={onUpdatePersonalSettings}
        micVolume={micVolume}
      />

      {/* Scalability & Telemetry HUD */}
      {showStats && (
        <StatsHUD
          telemetry={telemetry}
          activeSpeakerName={activeSpeaker}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Host Admission Knocking Banner (Google Meet style) */}
      {isHost && waitingPeers && waitingPeers.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#2E3538',
            border: '1px solid #9EAB9D',
            borderRadius: '18px',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
            zIndex: 60,
            backdropFilter: 'blur(10px)',
            fontFamily: "var(--font-ui, 'Inter', sans-serif)"
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: '#9EAB9D',
                color: '#252B2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '16px'
              }}
            >
              {waitingPeers[0]?.userName?.charAt(0).toUpperCase() || 'P'}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#F4F3EF' }}>
                {waitingPeers[0]?.userName}
              </div>
              <div style={{ fontSize: '12px', color: '#9EAB9D' }}>
                wants to join this call {waitingPeers.length > 1 && `(+${waitingPeers.length - 1} more)`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => onDenyPeer(waitingPeers[0].peerId)}
              style={{
                backgroundColor: '#252B2D',
                border: '1px solid #3A4245',
                color: '#F4F3EF',
                borderRadius: '16px',
                padding: '7px 16px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              Deny
            </button>

            <button
              onClick={() => onAdmitPeer(waitingPeers[0].peerId)}
              style={{
                backgroundColor: '#9EAB9D',
                border: 'none',
                color: '#252B2D',
                borderRadius: '16px',
                padding: '7px 18px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'background-color 0.2s, transform 0.1s',
                boxShadow: '0 2px 8px rgba(158, 171, 157, 0.3)'
              }}
            >
              Admit
            </button>

            {waitingPeers.length > 1 && (
              <button
                onClick={onAdmitAllPeers}
                style={{
                  backgroundColor: '#3A4245',
                  border: 'none',
                  color: '#F4F3EF',
                  borderRadius: '16px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Admit all ({waitingPeers.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Center Video Area + Optional Side Panel */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Video Grid */}
        <div style={{ flex: 1, height: '100%', position: 'relative' }}>
          <VideoGrid
            localStream={localStream}
            userName={userName}
            isHost={isHost}
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
            personalSettings={personalSettings}
            onHostMutePeer={onHostMutePeer}
          />
        </div>

        {/* Slide-out Panels */}
        {activePanel === 'chat' && (
          <ChatPanel
            chatMessages={chatMessages}
            isHost={isHost}
            roomSettings={roomSettings}
            onSendMessage={onSendMessage}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'people' && (
          <ParticipantsPanel
            userName={userName}
            isHost={isHost}
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            isHandRaised={isHandRaised}
            roster={roster}
            waitingPeers={waitingPeers}
            onAdmitPeer={onAdmitPeer}
            onDenyPeer={onDenyPeer}
            onAdmitAllPeers={onAdmitAllPeers}
            onHostMuteAll={onHostMuteAll}
            onHostMutePeer={onHostMutePeer}
            onHostKickPeer={onHostKickPeer}
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
        isHost={isHost}
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        participantCount={participantCount}
        activePanel={activePanel}
        showStats={showStats}
        roomSettings={roomSettings}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onToggleRaiseHand={onToggleRaiseHand}
        onTogglePanel={handleTogglePanel}
        onToggleStats={() => setShowStats(!showStats)}
        onOpenSettings={() => setShowSettings(true)}
        onLeaveRoom={onLeaveRoom}
      />
    </div>
  );
}
