import React, { useState } from 'react';
import VideoTile from './VideoTile';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';

export default function VideoGrid({
  localStream,
  userName,
  isHost,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  isHandRaised,
  roster,
  remoteStreams,
  currentPage,
  totalPages,
  onPageChange,
  activeSpeakerId,
  personalSettings,
  onHostMutePeer = () => {}
}) {
  const [pinnedId, setPinnedId] = useState(null);

  const allPeers = Object.values(roster);
  const totalCount = 1 + allPeers.length;

  const handleTogglePin = (id) => {
    setPinnedId((current) => (current === id ? null : id));
  };

  const PAGE_SIZE = 6;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagePeers = allPeers.slice(startIndex, startIndex + PAGE_SIZE);

  // Spotlight layout
  if (pinnedId) {
    const isLocalPinned = pinnedId === 'local';
    const pinnedPeer = isLocalPinned ? null : roster[pinnedId];
    const pinnedStream = isLocalPinned ? localStream : remoteStreams[pinnedId];

    return (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          gap: '12px',
          padding: '16px',
          overflow: 'hidden',
          position: 'relative'
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
              isHandRaised={isHandRaised}
              mirrorVideo={personalSettings?.mirrorVideo ?? true}
              lightingBoost={personalSettings?.lightingBoost ?? false}
              backgroundEffect={personalSettings?.backgroundEffect || 'none'}
              isPinned={true}
              onPin={() => handleTogglePin('local')}
            />
          ) : pinnedPeer ? (
            <VideoTile
              stream={pinnedStream}
              userName={pinnedPeer.userName}
              peerId={pinnedPeer.peerId}
              isAudioMuted={pinnedPeer.isAudioMuted}
              isVideoOff={pinnedPeer.isVideoOff}
              isLocal={false}
              isScreenSharing={pinnedPeer.isScreenSharing}
              isHandRaised={pinnedPeer.isHandRaised}
              isSpeaking={activeSpeakerId === pinnedPeer.peerId}
              isHost={isHost}
              isPinned={true}
              onPin={() => handleTogglePin(pinnedPeer.peerId)}
              onMutePeer={onHostMutePeer}
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
          {!isLocalPinned && (
            <div style={{ height: '160px', flexShrink: 0 }}>
              <VideoTile
                stream={localStream}
                userName={userName}
                isAudioMuted={isAudioMuted}
                isVideoOff={isVideoOff}
                isLocal={true}
                isScreenSharing={isScreenSharing}
                isHandRaised={isHandRaised}
                mirrorVideo={personalSettings?.mirrorVideo ?? true}
                lightingBoost={personalSettings?.lightingBoost ?? false}
                backgroundEffect={personalSettings?.backgroundEffect || 'none'}
                isPinned={false}
                onPin={() => handleTogglePin('local')}
              />
            </div>
          )}

          {pagePeers
            .filter((p) => p.peerId !== pinnedId)
            .map((peer) => (
              <div key={peer.peerId} style={{ height: '160px', flexShrink: 0 }}>
                <VideoTile
                  stream={remoteStreams[peer.peerId]}
                  userName={peer.userName}
                  peerId={peer.peerId}
                  isAudioMuted={peer.isAudioMuted}
                  isVideoOff={peer.isVideoOff}
                  isLocal={false}
                  isScreenSharing={peer.isScreenSharing}
                  isHandRaised={peer.isHandRaised}
                  isSpeaking={activeSpeakerId === peer.peerId}
                  isHost={isHost}
                  isPinned={false}
                  onPin={() => handleTogglePin(peer.peerId)}
                  onMutePeer={onHostMutePeer}
                />
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Calculate dynamic grid layout for visible page
  const visibleCount = 1 + pagePeers.length;
  let gridTemplateColumns = '1fr';
  let gridTemplateRows = '1fr';

  if (visibleCount === 2) {
    gridTemplateColumns = 'repeat(2, 1fr)';
    gridTemplateRows = '1fr';
  } else if (visibleCount <= 4) {
    gridTemplateColumns = 'repeat(2, 1fr)';
    gridTemplateRows = 'repeat(2, 1fr)';
  } else {
    gridTemplateColumns = 'repeat(3, 1fr)';
    gridTemplateRows = 'repeat(2, 1fr)';
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Active Speaker Banner */}
      {activeSpeakerId && roster[activeSpeakerId] && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(46, 53, 56, 0.95)',
            border: '1px solid #9EAB9D',
            color: '#F4F3EF',
            padding: '5px 18px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 15,
            boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)'
          }}
        >
          <Volume2 size={16} color="#9EAB9D" className="animate-pulse" />
          <span>{roster[activeSpeakerId].userName} is speaking</span>
        </div>
      )}

      {/* Main Grid View */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns,
          gridTemplateRows,
          gap: '16px',
          padding: '16px',
          alignContent: 'center',
          justifyContent: 'center',
          minHeight: 0
        }}
      >
        {/* Local Video Tile (Page 1) */}
        {currentPage === 1 && (
          <VideoTile
            stream={localStream}
            userName={userName}
            isAudioMuted={isAudioMuted}
            isVideoOff={isVideoOff}
            isLocal={true}
            isScreenSharing={isScreenSharing}
            isHandRaised={isHandRaised}
            mirrorVideo={personalSettings?.mirrorVideo ?? true}
            lightingBoost={personalSettings?.lightingBoost ?? false}
            backgroundEffect={personalSettings?.backgroundEffect || 'none'}
            isPinned={false}
            onPin={() => handleTogglePin('local')}
          />
        )}

        {/* Remote Video Tiles */}
        {pagePeers.map((peer) => (
          <VideoTile
            key={peer.peerId}
            stream={remoteStreams[peer.peerId]}
            userName={peer.userName}
            peerId={peer.peerId}
            isAudioMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoOff}
            isLocal={false}
            isScreenSharing={peer.isScreenSharing}
            isHandRaised={peer.isHandRaised}
            isSpeaking={activeSpeakerId === peer.peerId}
            isHost={isHost}
            isPinned={false}
            onPin={() => handleTogglePin(peer.peerId)}
            onMutePeer={onHostMutePeer}
          />
        ))}
      </div>

      {/* Scalable Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '8px 0',
            backgroundColor: 'rgba(37, 43, 45, 0.85)',
            borderTop: '1px solid #3A4245',
            zIndex: 10
          }}
        >
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            style={{
              background: 'none',
              border: 'none',
              color: currentPage <= 1 ? '#566166' : '#9EAB9D',
              cursor: currentPage <= 1 ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            <ChevronLeft size={18} /> Prev
          </button>

          <span style={{ fontSize: '13px', color: '#A6B0A8', fontWeight: '500' }}>
            Page {currentPage} of {totalPages} ({totalCount} in call)
          </span>

          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            style={{
              background: 'none',
              border: 'none',
              color: currentPage >= totalPages ? '#566166' : '#9EAB9D',
              cursor: currentPage >= totalPages ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            Next <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
