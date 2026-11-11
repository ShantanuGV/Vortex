import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Sparkles, RefreshCw } from 'lucide-react';
import { getParticipantColor } from '../utils/colors';

export default function Lobby({ onJoinRoom }) {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);

  const videoRef = useRef(null);

  // Generate meeting code (e.g. abc-defg-hij)
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

  const avatarColor = getParticipantColor(userName || 'Vortex');

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#252B2D',
        color: '#F4F3EF',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          borderBottom: '1px solid #3A4245'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src="/vortex-logo.png"
            alt="VORTEX Logo"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              objectFit: 'contain'
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '22px',
                fontWeight: '700',
                fontFamily: "var(--font-display, 'Playfair Display', serif)",
                letterSpacing: '1.5px',
                color: '#F4F3EF'
              }}
            >
              VORTEX
            </span>
            <span style={{ fontSize: '11px', color: '#9EAB9D', letterSpacing: '0.5px' }}>
              VIDEO COLLABORATION
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

        </div>
      </div>

      {/* Main Lobby Container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px'
        }}
      >
        <div
          style={{
            display: 'flex',
            maxWidth: '1060px',
            width: '100%',
            gap: '56px',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          {/* Left Preview Box */}
          <div
            style={{
              position: 'relative',
              width: '560px',
              height: '380px',
              borderRadius: '20px',
              backgroundColor: '#2E3538',
              border: '1px solid #3A4245',
              overflow: 'hidden',
              boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
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
                  gap: '14px'
                }}
              >
                <div
                  style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    backgroundColor: avatarColor,
                    color: '#252B2D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '40px',
                    fontWeight: '700',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.3)'
                  }}
                >
                  {userName ? userName.charAt(0).toUpperCase() : 'V'}
                </div>
                <span style={{ color: '#9EAB9D', fontSize: '14px', fontWeight: '500' }}>
                  Camera is turned off
                </span>
              </div>
            )}

            {/* Bottom floating toggle buttons */}
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
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
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  border: isAudioMuted ? 'none' : '1px solid #3A4245',
                  backgroundColor: isAudioMuted ? '#EA4335' : '#252B2D',
                  color: isAudioMuted ? '#FFFFFF' : '#F4F3EF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                  transition: 'background-color 0.2s, transform 0.1s'
                }}
              >
                {isAudioMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              <button
                type="button"
                onClick={handleToggleVideo}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  border: isVideoOff ? 'none' : '1px solid #3A4245',
                  backgroundColor: isVideoOff ? '#EA4335' : '#252B2D',
                  color: isVideoOff ? '#FFFFFF' : '#F4F3EF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                  transition: 'background-color 0.2s, transform 0.1s'
                }}
              >
                {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            </div>
          </div>

          {/* Right Join Form Card */}
          <div
            style={{
              width: '380px',
              backgroundColor: '#2E3538',
              border: '1px solid #3A4245',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: '30px',
                  fontWeight: '600',
                  fontFamily: "var(--font-display, 'Playfair Display', serif)",
                  color: '#F4F3EF',
                  marginBottom: '8px',
                  letterSpacing: '0.4px'
                }}
              >
                Ready to enter?
              </h1>
              <p style={{ fontSize: '14px', color: '#9EAB9D', lineHeight: '1.4' }}>
                Join the seamless peer-to-peer workspace with high-fidelity audio & video.
              </p>
            </div>

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#9EAB9D',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontWeight: '600',
                    marginBottom: '8px'
                  }}
                >
                  Your Display Name
                </label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Shantanu V"
                  style={{
                    width: '100%',
                    backgroundColor: '#252B2D',
                    border: '1px solid #3A4245',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    color: '#F4F3EF',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#9EAB9D',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontWeight: '600',
                    marginBottom: '8px'
                  }}
                >
                  Meeting Code
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    required
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="abc-defg-hij"
                    style={{
                      flex: 1,
                      backgroundColor: '#252B2D',
                      border: '1px solid #3A4245',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      color: '#F4F3EF',
                      fontSize: '15px',
                      outline: 'none',
                      letterSpacing: '0.5px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setRoomId(generateRoomCode())}
                    title="Generate new meeting code"
                    style={{
                      backgroundColor: '#252B2D',
                      border: '1px solid #3A4245',
                      borderRadius: '10px',
                      color: '#9EAB9D',
                      padding: '0 14px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <RefreshCw size={14} /> New
                  </button>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '10px',
                  backgroundColor: '#9EAB9D',
                  color: '#252B2D',
                  border: 'none',
                  borderRadius: '28px',
                  padding: '14px',
                  fontSize: '16px',
                  fontWeight: '700',
                  letterSpacing: '0.3px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s, transform 0.1s',
                  boxShadow: '0 4px 14px rgba(158, 171, 157, 0.35)'
                }}
              >
                Join Meeting
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
