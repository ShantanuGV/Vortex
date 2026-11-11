import React, { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import Lobby from './components/Lobby';
import MeetingRoom from './components/MeetingRoom';

export default function App() {
  const [inMeeting, setInMeeting] = useState(false);

  const {
    localStream,
    remotePeers,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    chatMessages,
    roomId,
    userName,
    joinRoom,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
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
          remotePeers={remotePeers}
          chatMessages={chatMessages}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onSendMessage={sendChatMessage}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
