import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Video as MeetIcon, Sparkles } from 'lucide-react';

export default function Lobby({ onJoinRoom }) {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);

  const videoRef = useRef(null);

  // Generate Google Meet formatted room code (e.g. abc-defg-hij)
  const generateRoomCode = () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const randPart = (len) =>
      Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    return `${randPart(3)}-${randPart(4)}-${randPart(3)}`;
  };

  useEffect(() => {
    // Check if room code was passed via URL query param
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setRoomId(roomParam);
    } else {
      setRoomId(generateRoomCode());
    }

    // Default username suggestion
    const randomNum = Math.floor(100 + Math.random() * 900);
    setUserName(`Guest ${randomNum}`);

    // Request camera preview
    let activeStream = null;
    navigator.mediaDevices
      .getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true
      })
      .then((stream) => {
        activeStream = stream;
        setPreviewStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.warn('Could not acquire preview stream:', err);
        setIsVideoOff(true);
      });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleToggleAudio = () => {
    if (previewStream) {
      previewStream.getAudioTracks().forEach((track) => {
        track.enabled = isAudioMuted;
      });
    }
    setIsAudioMuted(!isAudioMuted);
  };

  const handleToggleVideo = () => {
    if (previewStream) {
      previewStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
    }
    setIsVideoOff(!isVideoOff);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId.trim()) return;

    // Clean up local preview tracks before joining so useWebRTC can acquire clean stream
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
    }

    onJoinRoom({
      roomId: roomId.trim().toLowerCase(),
      userName: userName.trim(),
      isAudioMuted,
      isVideoOff
    });
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#202124',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#1a73e8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}
          >
            <MeetIcon size={22} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: '500', color: '#e8eaed' }}>
            Google Meet <span style={{ fontSize: '13px', color: '#8ab4f8' }}>[REA Lab]</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              backgroundColor: 'rgba(138, 180, 248, 0.15)',
              color: '#8ab4f8',
              padding: '6px 12px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '500'
            }}
          >
            <Sparkles size={14} /> WebRTC Peer Engine
          </span>
        </div>
      </div>

      {/* Main Lobby Container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}
      >
        <div
          style={{
            display: 'flex',
            maxWidth: '1020px',
            width: '100%',
            gap: '48px',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          {/* Left Preview Box */}
          <div
            style={{
              position: 'relative',
              width: '540px',
              height: '360px',
              borderRadius: '16px',
              backgroundColor: '#3c4043',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
                display: isVideoOff ? 'none' : 'block'
              }}
            />

            {isVideoOff && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <div
                  style={{
                    width: '96px',
                    height: '96px',
                    borderRadius: '50%',
                    backgroundColor: '#1a73e8',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '36px',
                    fontWeight: '600'
                  }}
                >
                  {userName ? userName.charAt(0).toUpperCase() : 'G'}
                </div>
                <span style={{ color: '#bdc1c6', fontSize: '14px' }}>Camera is off</span>
              </div>
            )}

            {/* Bottom floating toggle buttons */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                display: 'flex',
                gap: '16px',
                zIndex: 5
              }}
            >
              <button
                type="button"
                onClick={handleToggleAudio}
                title={isAudioMuted ? 'Turn on microphone' : 'Turn off microphone'}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: isAudioMuted ? '#ea4335' : '#3c4043',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  transition: 'background-color 0.2s'
                }}
              >
                {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                type="button"
                onClick={handleToggleVideo}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: isVideoOff ? '#ea4335' : '#3c4043',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  transition: 'background-color 0.2s'
                }}
              >
                {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            </div>
          </div>

          {/* Right Join Form */}
          <div
            style={{
              width: '360px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}
          >
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '400', color: '#ffffff', marginBottom: '8px' }}>
                Ready to join?
              </h1>
              <p style={{ fontSize: '14px', color: '#bdc1c6' }}>
                Connect seamlessly with WebRTC audio & video.
              </p>
            </div>

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9aa0a6', marginBottom: '6px' }}>
                  YOUR DISPLAY NAME
                </label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  style={{
                    width: '100%',
                    backgroundColor: '#303134',
                    border: '1px solid #5f6368',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9aa0a6', marginBottom: '6px' }}>
                  MEETING CODE
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="abc-defg-hij"
                    style={{
                      flex: 1,
                      backgroundColor: '#303134',
                      border: '1px solid #5f6368',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      color: '#ffffff',
                      fontSize: '15px',
                      outline: 'none',
                      letterSpacing: '0.5px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setRoomId(generateRoomCode())}
                    title="Generate new code"
                    style={{
                      backgroundColor: '#3c4043',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#8ab4f8',
                      padding: '0 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    New
                  </button>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '8px',
                  backgroundColor: '#1a73e8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '14px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  boxShadow: '0 2px 6px rgba(26, 115, 232, 0.4)'
                }}
              >
                Join now
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

