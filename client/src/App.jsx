import React, { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import Lobby from './components/Lobby';
import MeetingRoom from './components/MeetingRoom';

export default function App() {
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);

  const {
    localStream,
    roster,
    remoteStreams,
    currentPage,
    totalPages,
    setCurrentPage,
    activeSpeakerId,
    micVolume,
    telemetry,
    networkStats,
    toasts,
    removeToast,
    isHost,
    hostId,
    roomSettings,
    personalSettings,
    updateRoomSettings,
    hostMuteAll,
    hostMutePeer,
    hostKickPeer,
    hostEndMeeting,
    pinnedPeerId,
    setPinnedPeerId,
    // Host Admission / Waiting Room
    isWaitingForAdmission,
    admissionStatus,
    deniedReason,
    waitingPeers,
    admitPeer,
    denyPeer,
    admitAllPeers,
    cancelWaiting,
    updatePersonalSettings,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isHandRaised,
    chatMessages,
    isConnected,
    roomId,
    userName,
    joinRoom,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleRaiseHand,
    sendChatMessage,
    leaveRoom
  } = useWebRTC();

  const handleJoinRoom = async ({ roomId: id, userName: name, isAudioMuted: audioMuted, isVideoOff: videoOff }) => {
    setHasRequestedJoin(true);
    await joinRoom({
      roomId: id,
      userName: name,
      initialAudioMuted: audioMuted,
      initialVideoOff: videoOff
    });
  };

  const handleCancelWaiting = () => {
    cancelWaiting();
    setHasRequestedJoin(false);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setHasRequestedJoin(false);
  };

  // Determine if participant is actively in the meeting room:
  // Must have requested join, be connected, and NOT be waiting in the admission lobby
  const isInMeetingRoom = hasRequestedJoin && isConnected && !isWaitingForAdmission && admissionStatus !== 'denied';

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {!isInMeetingRoom ? (
        <Lobby
          onJoinRoom={handleJoinRoom}
          isWaiting={isWaitingForAdmission}
          admissionStatus={admissionStatus}
          deniedReason={deniedReason}
          onCancelWaiting={handleCancelWaiting}
        />
      ) : (
        <MeetingRoom
          localStream={localStream}
          userName={userName}
          roomId={roomId}
          isHost={isHost}
          hostId={hostId}
          pinnedPeerId={pinnedPeerId}
          onSetPinnedPeerId={setPinnedPeerId}
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          isScreenSharing={isScreenSharing}
          isHandRaised={isHandRaised}
          roster={roster}
          remoteStreams={remoteStreams}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
          activeSpeakerId={activeSpeakerId}
          micVolume={micVolume}
          telemetry={telemetry}
          networkStats={networkStats}
          toasts={toasts}
          onDismissToast={removeToast}
          chatMessages={chatMessages}
          roomSettings={roomSettings}
          personalSettings={personalSettings}
          waitingPeers={waitingPeers}
          onAdmitPeer={admitPeer}
          onDenyPeer={denyPeer}
          onAdmitAllPeers={admitAllPeers}
          onUpdateRoomSettings={updateRoomSettings}
          onHostMuteAll={hostMuteAll}
          onHostMutePeer={hostMutePeer}
          onHostKickPeer={hostKickPeer}
          onHostEndMeeting={hostEndMeeting}
          onUpdatePersonalSettings={updatePersonalSettings}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleRaiseHand={toggleRaiseHand}
          onSendMessage={sendChatMessage}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
