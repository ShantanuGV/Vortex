import React, { useState } from 'react';
import VideoTile from './VideoTile';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';

export default function VideoGrid({
  localStream,
  userName,
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
  personalSettings
}) {
  const [pinnedId, setPinnedId] = useState(null);

  const allPeers = Object.values(roster);
  const totalCount = 1 + allPeers.length;

  const handleTogglePin = (id) => {
    setPinnedId((current) => (current === id ? null : id));
  };

  // Slice visible peers for the current page
  const PAGE_SIZE = 6;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagePeers = allPeers.slice(startIndex, startIndex + PAGE_SIZE);

  // If a participant is pinned, render Spotlight layout
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
              isAudioMuted={pinnedPeer.isAudioMuted}
              isVideoOff={pinnedPeer.isVideoOff}
              isLocal={false}
              isScreenSharing={pinnedPeer.isScreenSharing}
              isHandRaised={pinnedPeer.isHandRaised}
              isSpeaking={activeSpeakerId === pinnedPeer.peerId}
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
                  isAudioMuted={peer.isAudioMuted}
                  isVideoOff={peer.isVideoOff}
                  isLocal={false}
                  isScreenSharing={peer.isScreenSharing}
                  isHandRaised={peer.isHandRaised}
                  isSpeaking={activeSpeakerId === peer.peerId}
                  isPinned={false}
                  onPin={() => handleTogglePin(peer.peerId)}
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
      {/* Active Speaker Banner (if active speaker is currently talking) */}
      {activeSpeakerId && roster[activeSpeakerId] && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(26, 115, 232, 0.9)',
            color: '#ffffff',
            padding: '4px 16px',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 15,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)'
          }}
        >
          <Volume2 size={16} className="animate-pulse" />
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
        {/* Local Video Tile (Always on Page 1) */}
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

        {/* Remote Video Tiles for Current Page */}
        {pagePeers.map((peer) => (
          <VideoTile
            key={peer.peerId}
            stream={remoteStreams[peer.peerId]}
            userName={peer.userName}
            isAudioMuted={peer.isAudioMuted}
            isVideoOff={peer.isVideoOff}
            isLocal={false}
            isScreenSharing={peer.isScreenSharing}
            isHandRaised={peer.isHandRaised}
            isSpeaking={activeSpeakerId === peer.peerId}
            isPinned={false}
            onPin={() => handleTogglePin(peer.peerId)}
          />
        ))}
      </div>

      {/* Scalable Pagination Controls (when room exceeds 6 participants) */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '8px 0',
            backgroundColor: 'rgba(32, 33, 36, 0.85)',
            borderTop: '1px solid #3c4043',
            zIndex: 10
          }}
        >
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            style={{
              background: 'none',
              border: 'none',
              color: currentPage <= 1 ? '#5f6368' : '#8ab4f8',
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

          <span style={{ fontSize: '13px', color: '#bdc1c6', fontWeight: '500' }}>
            Page {currentPage} of {totalPages} ({totalCount} in call)
          </span>

          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            style={{
              background: 'none',
              border: 'none',
              color: currentPage >= totalPages ? '#5f6368' : '#8ab4f8',
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
