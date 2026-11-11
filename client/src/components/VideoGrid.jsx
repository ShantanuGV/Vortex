import React, { useState } from 'react';
import VideoTile from './VideoTile';

export default function VideoGrid({
  localStream,
  userName,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  remotePeers
}) {
  const [pinnedId, setPinnedId] = useState(null);

  const remotePeerList = Object.values(remotePeers);
  const totalCount = 1 + remotePeerList.length;

  const handleTogglePin = (id) => {
    setPinnedId((current) => (current === id ? null : id));
  };

  // If a participant is pinned, render Spotlight layout
  if (pinnedId) {
    const isLocalPinned = pinnedId === 'local';
    const pinnedPeer = isLocalPinned
      ? null
      : remotePeerList.find((p) => p.peerId === pinnedId);

    return (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          gap: '12px',
          padding: '16px',
          overflow: 'hidden'
        }}
      >
        {/* Spotlight Video (Main) */}
        <div style={{ flex: 1, height: '100%', minWidth: 0 }}>
          {isLocalPinned ? (
            <VideoTile
              stream={localStream}
              userName={userName}
              isAudioMuted={isAudioMuted}
              isVideoOff={isVideoOff}
              isLocal={true}
              isScreenSharing={isScreenSharing}
              isPinned={true}
              onPin={() => handleTogglePin('local')}
            />
          ) : pinnedPeer ? (
            <VideoTile
              stream={pinnedPeer.stream}
              userName={pinnedPeer.userName}
              isAudioMuted={pinnedPeer.isAudioMuted}
              isVideoOff={pinnedPeer.isVideoOff}
              isLocal={false}
              isScreenSharing={pinnedPeer.isScreenSharing}
              isPinned={true}
              onPin={() => handleTogglePin(pinnedPeer.peerId)}
            />
          ) : null}
        </div>

        {/* Thumbnail Sidebar */}
        <div
          style={{
            width: '280px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
            height: '100%'
          }}
        >
          {/* If local is not pinned, show local in thumbnail list */}
          {!isLocalPinned && (
            <div style={{ height: '160px', flexShrink: 0 }}>
              <VideoTile
                stream={localStream}
                userName={userName}
                isAudioMuted={isAudioMuted}
                isVideoOff={isVideoOff}
                isLocal={true}
                isScreenSharing={isScreenSharing}
                isPinned={false}
                onPin={() => handleTogglePin('local')}
              />
            </div>
          )}

          {/* Other remote peers */}
          {remotePeerList
            .filter((p) => p.peerId !== pinnedId)
            .map((peer) => (
              <div key={peer.peerId} style={{ height: '160px', flexShrink: 0 }}>
                <VideoTile
                  stream={peer.stream}
                  userName={peer.userName}
                  isAudioMuted={peer.isAudioMuted}
                  isVideoOff={peer.isVideoOff}
                  isLocal={false}
                  isScreenSharing={peer.isScreenSharing}
                  isPinned={false}
                  onPin={() => handleTogglePin(peer.peerId)}
                />
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Adaptive Grid Configuration
  let gridTemplateColumns = '1fr';
  let gridTemplateRows = '1fr';

  if (totalCount === 2) {
    gridTemplateColumns = 'repeat(auto-fit, minmax(400px, 1fr))';
    gridTemplateRows = '1fr';
  } else if (totalCount <= 4) {
    gridTemplateColumns = 'repeat(2, 1fr)';
    gridTemplateRows = 'repeat(2, 1fr)';
  } else if (totalCount <= 6) {
    gridTemplateColumns = 'repeat(3, 1fr)';
    gridTemplateRows = 'repeat(2, 1fr)';
  } else {
    gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    gridTemplateRows = 'repeat(auto-fit, minmax(240px, 1fr))';
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns,
        gridTemplateRows,
        gap: '16px',
        width: '100%',
        height: '100%',
        padding: '16px',
        alignContent: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Local Video Tile */}
      <VideoTile
        stream={localStream}
        userName={userName}
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        isLocal={true}
        isScreenSharing={isScreenSharing}
        isPinned={false}
        onPin={() => handleTogglePin('local')}
      />

      {/* Remote Video Tiles */}
      {remotePeerList.map((peer) => (
        <VideoTile
          key={peer.peerId}
          stream={peer.stream}
          userName={peer.userName}
          isAudioMuted={peer.isAudioMuted}
          isVideoOff={peer.isVideoOff}
          isLocal={false}
          isScreenSharing={peer.isScreenSharing}
          isPinned={false}
          onPin={() => handleTogglePin(peer.peerId)}
        />
      ))}
    </div>
  );
}

