import React from 'react';
import { X, Mic, MicOff, Video, VideoOff, User } from 'lucide-react';

export default function ParticipantsPanel({
  userName,
  isAudioMuted,
  isVideoOff,
  remotePeers,
  onClose
}) {
  const peerList = Object.values(remotePeers);
  const totalCount = 1 + peerList.length;

  return (
    <div
      style={{
        width: '360px',
        height: '100%',
        backgroundColor: '#202124',
        borderLeft: '1px solid #3c4043',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #3c4043'
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>
          People ({totalCount})
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#bdc1c6',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Participants List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {/* Local User */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: '#303134'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#1a73e8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                color: '#ffffff'
              }}
            >
              {userName ? userName.charAt(0).toUpperCase() : 'Y'}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>
                {userName} (You)
              </div>
              <div style={{ fontSize: '12px', color: '#9aa0a6' }}>Meeting host</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#bdc1c6' }}>
            {isAudioMuted ? <MicOff size={18} color="#ea4335" /> : <Mic size={18} />}
            {isVideoOff ? <VideoOff size={18} color="#ea4335" /> : <Video size={18} />}
          </div>
        </div>

        {/* Remote Peers */}
        {peerList.map((peer) => (
          <div
            key={peer.peerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: '#282a2d'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#8ab4f8',
                  color: '#202124',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600'
                }}
              >
                {peer.userName ? peer.userName.charAt(0).toUpperCase() : 'P'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>
                {peer.userName}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#bdc1c6' }}>
              {peer.isAudioMuted ? <MicOff size={18} color="#ea4335" /> : <Mic size={18} />}
              {peer.isVideoOff ? <VideoOff size={18} color="#ea4335" /> : <Video size={18} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

