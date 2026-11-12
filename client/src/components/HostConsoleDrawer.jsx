import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Megaphone,
  Mic,
  MicOff,
  Video,
  Share2,
  MessageSquare,
  Lock,
  Unlock,
  Key,
  Hand,
  PhoneOff,
  Users,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function HostConsoleDrawer({
  isOpen,
  onClose,
  roomSettings = {},
  onUpdateRoomSettings = () => {},
  stageAnnouncement = '',
  onBroadcastAnnouncement = () => {},
  onClearAnnouncement = () => {},
  onLowerAllHands = () => {},
  onHostMuteAll = () => {},
  onHostEndMeeting = () => {},
  participantCount = 0,
  raisedHandsCount = 0
}) {
  const [announcementText, setAnnouncementText] = useState(stageAnnouncement || '');
  const [passwordInput, setPasswordInput] = useState(roomSettings.password || '');
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    setAnnouncementText(stageAnnouncement || '');
  }, [stageAnnouncement]);

  useEffect(() => {
    setPasswordInput(roomSettings.password || '');
  }, [roomSettings.password]);

  if (!isOpen) return null;

  const handlePublishAnnouncement = (e) => {
    e.preventDefault();
    if (!announcementText.trim()) return;
    onBroadcastAnnouncement(announcementText.trim());
  };

  const handleClear = () => {
    setAnnouncementText('');
    onClearAnnouncement();
  };

  const handleTogglePolicy = (key) => {
    const updated = {
      ...roomSettings,
      [key]: !roomSettings[key]
    };
    onUpdateRoomSettings(updated);
  };

  const handleSavePassword = (e) => {
    e.preventDefault();
    onUpdateRoomSettings({
      ...roomSettings,
      password: passwordInput.trim()
    });
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '100vw',
        backgroundColor: '#252B2D',
        borderLeft: '1px solid #3A4245',
        boxShadow: '-12px 0 36px rgba(0,0,0,0.65)',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "var(--font-ui, 'Inter', sans-serif)",
        color: '#F4F3EF',
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      <style>
        {`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}
      </style>

      {/* Drawer Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid #3A4245',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#212628'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(158, 171, 157, 0.15)',
              border: '1px solid #9EAB9D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9EAB9D'
            }}
          >
            <Shield size={20} />
          </div>
          <div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: '700',
                margin: 0,
                fontFamily: "var(--font-display, 'Playfair Display', serif)",
                letterSpacing: '0.4px',
                color: '#F4F3EF'
              }}
            >
              Executive Host Console
            </h2>
            <div style={{ fontSize: '12px', color: '#8A9497', marginTop: '2px' }}>
              Master moderation & presentation policies
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close Host Console"
          style={{
            background: 'none',
            border: 'none',
            color: '#8A9497',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#F4F3EF')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8A9497')}
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        {/* SECTION 1: Stage Broadcast Announcement */}
        <section
          style={{
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Megaphone size={16} color="#9EAB9D" />
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#F4F3EF', letterSpacing: '0.3px' }}>
              STAGE BANNER ANNOUNCEMENT
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#8A9497', margin: 0, lineHeight: '1.4' }}>
            Broadcast an executive announcement banner pinned to the top of all attendees' screens.
          </p>

          <form onSubmit={handlePublishAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
              rows={2}
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder="e.g., Welcome everyone! Q&A session starts in 15 minutes."
              style={{
                width: '100%',
                backgroundColor: '#252B2D',
                border: '1px solid #3A4245',
                borderRadius: '10px',
                padding: '10px 12px',
                color: '#F4F3EF',
                fontSize: '13px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={!announcementText.trim()}
                style={{
                  flex: 1,
                  backgroundColor: '#9EAB9D',
                  color: '#252B2D',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: announcementText.trim() ? 'pointer' : 'not-allowed',
                  opacity: announcementText.trim() ? 1 : 0.5,
                  transition: 'opacity 0.2s'
                }}
              >
                Publish to Stage
              </button>
              {stageAnnouncement && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    backgroundColor: '#252B2D',
                    color: '#D96B6B',
                    border: '1px solid #3A4245',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </section>

        {/* SECTION 2: Emergency Moderation */}
        <section
          style={{
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="#D8A464" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#F4F3EF', letterSpacing: '0.3px' }}>
                STAGE MODERATION
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#9EAB9D', fontWeight: '600' }}>
              Audience: {participantCount}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              onClick={onHostMuteAll}
              style={{
                backgroundColor: '#252B2D',
                border: '1px solid #EA4335',
                color: '#F28B82',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <MicOff size={16} />
              <span>Mute All Mic</span>
            </button>

            <button
              type="button"
              onClick={onLowerAllHands}
              style={{
                backgroundColor: '#252B2D',
                border: '1px solid #D8A464',
                color: '#D8A464',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Hand size={16} />
              <span>Lower Hands ({raisedHandsCount})</span>
            </button>
          </div>
        </section>

        {/* SECTION 3: Live Attendee Permissions */}
        <section
          style={{
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#F4F3EF', letterSpacing: '0.3px' }}>
            ATTENDEE CAPABILITIES
          </div>

          {/* Policy: Mic */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Mic size={16} color={roomSettings.allowMic ? '#9EAB9D' : '#8A9497'} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>Unmute Microphone</div>
                <div style={{ fontSize: '11px', color: '#8A9497' }}>Allow attendees to turn on their audio</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.allowMic ?? true}
              onChange={() => handleTogglePolicy('allowMic')}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#9EAB9D' }}
            />
          </div>

          {/* Policy: Camera */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Video size={16} color={roomSettings.allowCamera ? '#9EAB9D' : '#8A9497'} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>Turn On Camera</div>
                <div style={{ fontSize: '11px', color: '#8A9497' }}>Allow attendees to stream their video</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.allowCamera ?? true}
              onChange={() => handleTogglePolicy('allowCamera')}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#9EAB9D' }}
            />
          </div>

          {/* Policy: Screen Share */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Share2 size={16} color={roomSettings.allowScreenShare ? '#9EAB9D' : '#8A9497'} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>Screen Sharing</div>
                <div style={{ fontSize: '11px', color: '#8A9497' }}>Allow attendees to present their screen</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.allowScreenShare ?? true}
              onChange={() => handleTogglePolicy('allowScreenShare')}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#9EAB9D' }}
            />
          </div>

          {/* Policy: Chat */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MessageSquare size={16} color={roomSettings.allowChat ? '#9EAB9D' : '#8A9497'} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>Send Chat Messages</div>
                <div style={{ fontSize: '11px', color: '#8A9497' }}>Allow attendees to use chat</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.allowChat ?? true}
              onChange={() => handleTogglePolicy('allowChat')}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#9EAB9D' }}
            />
          </div>
        </section>

        {/* SECTION 4: Access & Security Gate */}
        <section
          style={{
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#F4F3EF', letterSpacing: '0.3px' }}>
            ACCESS CONTROL & SECURITY
          </div>

          {/* Policy: Lock Room */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {roomSettings.isLocked ? <Lock size={16} color="#EA4335" /> : <Unlock size={16} color="#9EAB9D" />}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>Lock Meeting Room</div>
                <div style={{ fontSize: '11px', color: '#8A9497' }}>Reject any incoming connection requests</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.isLocked ?? false}
              onChange={() => handleTogglePolicy('isLocked')}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#EA4335' }}
            />
          </div>

          {/* Policy: Waiting Room Admission */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Users size={16} color={roomSettings.hostAdmission ? '#9EAB9D' : '#8A9497'} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#F4F3EF' }}>Waiting Room (Host Admission)</div>
                <div style={{ fontSize: '11px', color: '#8A9497' }}>Guests must be manually approved to join</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={roomSettings.hostAdmission ?? true}
              onChange={() => handleTogglePolicy('hostAdmission')}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#9EAB9D' }}
            />
          </div>

          {/* Password / PIN */}
          <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={14} color="#9EAB9D" />
              <span style={{ fontSize: '12px', fontWeight: '500', color: '#F4F3EF' }}>Meeting Access Password</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="No password required"
                style={{
                  flex: 1,
                  backgroundColor: '#252B2D',
                  border: '1px solid #3A4245',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  color: '#F4F3EF',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: passwordSaved ? '#9EAB9D' : '#3A4245',
                  color: passwordSaved ? '#252B2D' : '#F4F3EF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'background-color 0.2s'
                }}
              >
                {passwordSaved ? <CheckCircle2 size={13} /> : 'Save'}
              </button>
            </div>
          </form>
        </section>

        {/* SECTION 5: Meeting Termination */}
        <section
          style={{
            backgroundColor: 'rgba(234, 67, 53, 0.08)',
            border: '1px solid rgba(234, 67, 53, 0.3)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#EA4335', letterSpacing: '0.3px' }}>
            TERMINATE SESSION
          </div>
          <p style={{ fontSize: '12px', color: '#A6B0A8', margin: 0, lineHeight: '1.4' }}>
            Permanently close the room router and disconnect all audience members immediately.
          </p>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Are you sure you want to end this meeting for everyone?')) {
                onHostEndMeeting();
              }
            }}
            style={{
              backgroundColor: '#EA4335',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              padding: '10px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(234, 67, 53, 0.35)',
              marginTop: '4px'
            }}
          >
            <PhoneOff size={16} /> End Meeting for All
          </button>
        </section>
      </div>
    </div>
  );
}

