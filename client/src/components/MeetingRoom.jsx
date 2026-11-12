import React, { useState, useEffect } from 'react';
import VideoGrid from './VideoGrid';
import Controls from './Controls';
import ChatPanel from './ChatPanel';
import ParticipantsPanel from './ParticipantsPanel';
import InfoPanel from './InfoPanel';
import StatsHUD from './StatsHUD';
import SettingsModal from './SettingsModal';
import ToastContainer from './ToastContainer';
import ShortcutsModal from './ShortcutsModal';
import StageHeader from './StageHeader';
import HostConsoleDrawer from './HostConsoleDrawer';

export default function MeetingRoom({
  localStream,
  userName,
  roomId,
  isHost,
  isCoHost = false,
  hostId,
  pinnedPeerId,
  onSetPinnedPeerId = () => {},
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isHandRaised,
  roster,
  remoteStreams,
  remoteScreenStreams = {},
  pageSize = 6,
  currentPage,
  totalPages,
  setCurrentPage,
  activeSpeakerId,
  micVolume,
  telemetry,
  networkStats,
  toasts = [],
  onDismissToast = () => {},
  chatMessages,
  reactions = [],
  onSendReaction = () => {},
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
  onAssignCoHost = () => {},
  onTransferHost = () => {},
  stageAnnouncement = null,
  onBroadcastAnnouncement = () => {},
  onHostLowerAllHands = () => {},
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHostConsole, setShowHostConsole] = useState(false);

  // Global Keyboard Shortcuts (Ctrl+D, Ctrl+E, Ctrl+H, ?, Esc)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if focus is inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onToggleAudio();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onToggleVideo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        onToggleRaiseHand();
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      } else if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowSettings(false);
        setShowStats(false);
        setActivePanel(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleAudio, onToggleVideo, onToggleRaiseHand]);

  const handleTogglePanel = (panelName) => {
    setActivePanel((current) => (current === panelName ? null : panelName));
  };

  const participantCount = 1 + Object.keys(roster).length;
  const raisedHandsCount = Object.values(roster).filter((p) => p.isHandRaised).length;
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
      {/* Executive Stage Header */}
      <StageHeader
        roomId={roomId}
        isHost={isHost}
        participantCount={participantCount}
        raisedHandsCount={raisedHandsCount}
        stageAnnouncement={stageAnnouncement}
        onClearAnnouncement={() => onBroadcastAnnouncement('')}
        onOpenAnnouncementModal={() => setShowHostConsole(true)}
        onOpenHostConsole={() => setShowHostConsole(true)}
        onLowerAllHands={onHostLowerAllHands}
        onToggleStats={() => setShowStats((prev) => !prev)}
        showStats={showStats}
        isLocked={roomSettings?.isLocked}
      />

      {/* Executive Host Management Console Drawer */}
      {isHost && (
        <HostConsoleDrawer
          isOpen={showHostConsole}
          onClose={() => setShowHostConsole(false)}
          roomSettings={roomSettings}
          onUpdateRoomSettings={onUpdateRoomSettings}
          stageAnnouncement={stageAnnouncement}
          onBroadcastAnnouncement={onBroadcastAnnouncement}
          onClearAnnouncement={() => onBroadcastAnnouncement('')}
          onLowerAllHands={onHostLowerAllHands}
          onHostMuteAll={onHostMuteAll}
          onHostEndMeeting={onHostEndMeeting}
          participantCount={participantCount}
          raisedHandsCount={raisedHandsCount}
        />
      )}
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
            hostId={hostId}
            pinnedId={pinnedPeerId}
            onSetPinnedId={onSetPinnedPeerId}
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            isScreenSharing={isScreenSharing}
            isHandRaised={isHandRaised}
            roster={roster}
            remoteStreams={remoteStreams}
            remoteScreenStreams={remoteScreenStreams}
            pageSize={pageSize}
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
            roster={roster}
            onSendMessage={onSendMessage}
            onClose={() => setActivePanel(null)}
          />
        )}

        {isHost && activePanel === 'people' && (
          <ParticipantsPanel
            userName={userName}
            isHost={isHost}
            isCoHost={isCoHost}
            hostId={hostId}
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
            onAssignCoHost={onAssignCoHost}
            onTransferHost={onTransferHost}
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

      {/* Real-time Floating Emoji Reactions (F-01) */}
      {reactions && reactions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100px',
            left: 0,
            right: 0,
            pointerEvents: 'none',
            zIndex: 60,
            overflow: 'hidden',
            height: '240px'
          }}
        >
          <style>
            {`
              @keyframes floatReactionUp {
                0% { transform: translateY(80px) scale(0.6); opacity: 0; }
                20% { transform: translateY(0px) scale(1.15); opacity: 1; }
                80% { transform: translateY(-120px) scale(1); opacity: 0.9; }
                100% { transform: translateY(-200px) scale(0.85); opacity: 0; }
              }
            `}
          </style>
          {reactions.map((rx) => (
            <div
              key={rx.id}
              style={{
                position: 'absolute',
                bottom: '10px',
                left: `${20 + ((rx.timestamp % 60) * 1.0)}%`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(46, 53, 56, 0.92)',
                border: '1px solid #3A4245',
                borderRadius: '24px',
                padding: '6px 14px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(6px)',
                animation: 'floatReactionUp 2.8s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}
            >
              <span style={{ fontSize: '22px' }}>{rx.emoji}</span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#F4F3EF' }}>{rx.userName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Keyboard Shortcuts Guide Dialog */}
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Real-time Enterprise Toast Container */}
      <ToastContainer
        toasts={toasts}
        onDismiss={onDismissToast}
      />

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
        networkStats={networkStats}
        micVolume={micVolume}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onToggleRaiseHand={onToggleRaiseHand}
        onSendReaction={onSendReaction}
        onTogglePanel={handleTogglePanel}
        onToggleStats={() => setShowStats(!showStats)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onLeaveRoom={onLeaveRoom}
      />
    </div>
  );
}
