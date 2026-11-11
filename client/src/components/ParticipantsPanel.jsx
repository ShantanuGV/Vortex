import React, { useState } from 'react';
import { X, Mic, MicOff, Video, VideoOff, Hand, Search, ShieldCheck, UserX, UserPlus, Clock } from 'lucide-react';
import { getParticipantColor } from '../utils/colors';

export default function ParticipantsPanel({
  userName,
  isHost,
  isAudioMuted,
  isVideoOff,
  isHandRaised,
  roster,
  waitingPeers = [],
  onAdmitPeer = () => {},
  onDenyPeer = () => {},
  onAdmitAllPeers = () => {},
  onHostMuteAll,
  onHostMutePeer,
  onHostKickPeer,
  onClose
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const peerList = Object.values(roster);
  const totalCount = 1 + peerList.length;

  const filteredPeers = peerList.filter((p) =>
    p.userName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedPeers = [...filteredPeers].sort((a, b) => {
    if (a.isHandRaised && !b.isHandRaised) return -1;
    if (!a.isHandRaised && b.isHandRaised) return 1;
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    if (a.role === 'speaker' && b.role !== 'speaker') return -1;
    if (a.role !== 'speaker' && b.role === 'speaker') return 1;
    return a.userName.localeCompare(b.userName);
  });

  const localColor = getParticipantColor(userName || 'You');

  return (
    <div
      style={{
        width: '360px',
        height: '100%',
        backgroundColor: '#252B2D',
        borderLeft: '1px solid #3A4245',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #3A4245'
        }}
      >
        <h3
          style={{
            fontSize: '18px',
            fontWeight: '600',
            fontFamily: "var(--font-display, 'Playfair Display', serif)",
            color: '#F4F3EF',
            letterSpacing: '0.3px',
            margin: 0
          }}
        >
          Participants ({totalCount})
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9EAB9D',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            transition: 'background-color 0.2s'
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Host Controls Action Bar */}
      {isHost && (
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: 'rgba(158, 171, 157, 0.12)',
            borderBottom: '1px solid #3A4245',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9EAB9D', fontWeight: '600' }}>
            <ShieldCheck size={16} /> Host Controls
          </div>
          <button
            type="button"
            onClick={onHostMuteAll}
            title="Mute all participants"
            style={{
              backgroundColor: '#2E3538',
              border: '1px solid #EA4335',
              color: '#F28B82',
              borderRadius: '16px',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.2s'
            }}
          >
            <MicOff size={13} /> Mute all
          </button>
        </div>
      )}

      {/* Waiting Room Section for Host */}
      {isHost && waitingPeers && waitingPeers.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(158, 171, 157, 0.08)',
            borderBottom: '1px solid #3A4245',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#9EAB9D', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              <Clock size={13} /> Waiting to join ({waitingPeers.length})
            </div>
            {waitingPeers.length > 1 && (
              <button
                type="button"
                onClick={onAdmitAllPeers}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9EAB9D',
                  fontSize: '11px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Admit all
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {waitingPeers.map((waiting) => {
              const color = getParticipantColor(waiting.userName || waiting.peerId);
              return (
                <div
                  key={waiting.peerId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#2E3538',
                    border: '1px solid #3A4245'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        color: '#252B2D',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '13px'
                      }}
                    >
                      {waiting.userName ? waiting.userName.charAt(0).toUpperCase() : 'W'}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>
                      {waiting.userName}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => onDenyPeer(waiting.peerId)}
                      title="Deny entry"
                      style={{
                        backgroundColor: '#252B2D',
                        border: '1px solid #3A4245',
                        color: '#8A9497',
                        borderRadius: '12px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdmitPeer(waiting.peerId)}
                      title="Admit to call"
                      style={{
                        backgroundColor: '#9EAB9D',
                        border: 'none',
                        color: '#252B2D',
                        borderRadius: '12px',
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Admit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #3A4245' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '24px',
            padding: '8px 14px',
            gap: '8px'
          }}
        >
          <Search size={16} color="#9EAB9D" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for people"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#F4F3EF',
              fontSize: '13px',
              outline: 'none',
              width: '100%'
            }}
          />
        </div>
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
            borderRadius: '10px',
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: localColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                color: '#252B2D',
                fontSize: '15px'
              }}
            >
              {userName ? userName.charAt(0).toUpperCase() : 'Y'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#F4F3EF' }}>
                  {userName}
                </span>
                <span
                  style={{
                    backgroundColor: 'rgba(158, 171, 157, 0.25)',
                    color: '#9EAB9D',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: '600'
                  }}
                >
                  You
                </span>
              </div>
              <div style={{ fontSize: '11px', color: isHost ? '#9EAB9D' : '#C5CCC4', marginTop: '2px' }}>
                {isHost ? 'Meeting host' : 'Participant'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F4F3EF' }}>
            {isHandRaised && <Hand size={18} color="#E5A967" />}
            {isAudioMuted ? <MicOff size={18} color="#EA4335" /> : <Mic size={18} color="#9EAB9D" />}
            {isVideoOff ? <VideoOff size={18} color="#EA4335" /> : <Video size={18} color="#9EAB9D" />}
          </div>
        </div>

        {/* Remote Peers */}
        {sortedPeers.map((peer) => {
          const peerColor = getParticipantColor(peer.userName || peer.peerId);
          return (
            <div
              key={peer.peerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: peer.isHandRaised ? 'rgba(229, 169, 103, 0.12)' : '#2E3538',
                border: peer.isHandRaised ? '1px solid #E5A967' : '1px solid #3A4245'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: peerColor,
                    color: '#252B2D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '15px'
                  }}
                >
                  {peer.userName ? peer.userName.charAt(0).toUpperCase() : 'P'}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#F4F3EF' }}>
                    {peer.userName}
                  </div>
                  <div style={{ fontSize: '11px', color: peer.isHost ? '#9EAB9D' : '#8A9497', marginTop: '2px' }}>
                    {peer.isHost ? 'Meeting host' : peer.role === 'speaker' ? 'Active Speaker' : 'Audience'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8A9497' }}>
                {peer.isHandRaised && <Hand size={18} color="#E5A967" />}
                {peer.isAudioMuted ? <MicOff size={18} color="#EA4335" /> : <Mic size={18} color="#9EAB9D" />}
                {peer.isVideoOff ? <VideoOff size={18} color="#EA4335" /> : <Video size={18} color="#9EAB9D" />}

                {/* Host individual participant controls */}
                {isHost && !peer.isHost && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                    {/* Individual Mute Peer Button */}
                    {!peer.isAudioMuted && (
                      <button
                        type="button"
                        onClick={() => onHostMutePeer(peer.peerId)}
                        title={`Mute ${peer.userName}`}
                        style={{
                          background: 'rgba(234, 67, 53, 0.15)',
                          border: '1px solid rgba(234, 67, 53, 0.4)',
                          borderRadius: '6px',
                          color: '#EA4335',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}
                      >
                        <MicOff size={14} /> Mute
                      </button>
                    )}

                    {/* Kick Peer Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${peer.userName} from this meeting?`)) {
                          onHostKickPeer(peer.peerId);
                        }
                      }}
                      title={`Remove ${peer.userName} from meeting`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EA4335',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <UserX size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
