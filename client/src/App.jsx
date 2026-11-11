import React, { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import Lobby from './components/Lobby';
import MeetingRoom from './components/MeetingRoom';

export default function App() {
  const [inMeeting, setInMeeting] = useState(false);

  const {
    localStream,
    roster,
    remoteStreams,
    currentPage,
    totalPages,
    setCurrentPage,
    activeSpeakerId,
    telemetry,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isHandRaised,
    chatMessages,
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
    await joinRoom({
      roomId: id,
      userName: name,
      initialAudioMuted: audioMuted,
      initialVideoOff: videoOff
    });
    setInMeeting(true);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setInMeeting(false);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {!inMeeting ? (
        <Lobby onJoinRoom={handleJoinRoom} />
      ) : (
        <MeetingRoom
          localStream={localStream}
          userName={userName}
          roomId={roomId}
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
          telemetry={telemetry}
          chatMessages={chatMessages}
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
