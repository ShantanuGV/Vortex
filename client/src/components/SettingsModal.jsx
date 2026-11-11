import React, { useState, useEffect } from 'react';
import {
  X,
  Mic,
  Video,
  Settings as GearIcon,
  ShieldAlert,
  Volume2,
  Check,
  Lock,
  Radio,
  Sliders
} from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  isHost,
  roomSettings,
  onUpdateRoomSettings,
  onHostMuteAll,
  personalSettings,
  onUpdatePersonalSettings
}) {
  const [activeTab, setActiveTab] = useState('audio'); // 'audio' | 'video' | 'general' | 'host'
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [testAudioPlaying, setTestAudioPlaying] = useState(false);

  // Enumerate actual hardware media devices
  useEffect(() => {
    if (!isOpen) return;

    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      const audioIns = devices.filter((d) => d.kind === 'audioinput');
      const videoIns = devices.filter((d) => d.kind === 'videoinput');
      const audioOuts = devices.filter((d) => d.kind === 'audiooutput');

      setAudioDevices(audioIns);
      setVideoDevices(videoIns);
      setOutputDevices(audioOuts);
    }).catch((err) => {
      console.warn('Device enumeration error:', err);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestSpeaker = () => {
    setTestAudioPlaying(true);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime); // 440Hz A tone
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      audioCtx.close();
      setTestAudioPlaying(false);
    }, 800);
  };

  const handleHostToggle = (key) => {
    if (!isHost) return;
    const next = { ...roomSettings, [key]: !roomSettings[key] };
    onUpdateRoomSettings(next);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '760px',
          height: '520px',
          backgroundColor: '#202124',
          borderRadius: '16px',
          border: '1px solid #3c4043',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            height: '60px',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #3c4043'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <GearIcon size={20} color="#8ab4f8" />
            <h2 style={{ fontSize: '18px', fontWeight: '500', color: '#ffffff' }}>
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#bdc1c6',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body (Sidebar + Content) */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Tabs Sidebar */}
          <div
            style={{
              width: '200px',
              borderRight: '1px solid #3c4043',
              padding: '12px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <button
              onClick={() => setActiveTab('audio')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                border: 'none',
                background: activeTab === 'audio' ? 'rgba(138, 180, 248, 0.15)' : 'none',
                color: activeTab === 'audio' ? '#8ab4f8' : '#e8eaed',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                textAlign: 'left',
                borderLeft: activeTab === 'audio' ? '3px solid #8ab4f8' : '3px solid transparent'
              }}
            >
              <Mic size={18} /> Audio
            </button>

            <button
              onClick={() => setActiveTab('video')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                border: 'none',
                background: activeTab === 'video' ? 'rgba(138, 180, 248, 0.15)' : 'none',
                color: activeTab === 'video' ? '#8ab4f8' : '#e8eaed',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                textAlign: 'left',
                borderLeft: activeTab === 'video' ? '3px solid #8ab4f8' : '3px solid transparent'
              }}
            >
              <Video size={18} /> Video
            </button>

            <button
              onClick={() => setActiveTab('general')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                border: 'none',
                background: activeTab === 'general' ? 'rgba(138, 180, 248, 0.15)' : 'none',
                color: activeTab === 'general' ? '#8ab4f8' : '#e8eaed',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                textAlign: 'left',
                borderLeft: activeTab === 'general' ? '3px solid #8ab4f8' : '3px solid transparent'
              }}
            >
              <Sliders size={18} /> General
            </button>

            <div style={{ margin: '8px 16px', borderTop: '1px solid #3c4043' }} />

            {/* Host Controls Tab */}
            <button
              onClick={() => setActiveTab('host')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                border: 'none',
                background: activeTab === 'host' ? 'rgba(234, 67, 53, 0.15)' : 'none',
                color: activeTab === 'host' ? '#ea4335' : isHost ? '#f28b82' : '#9aa0a6',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                textAlign: 'left',
                borderLeft: activeTab === 'host' ? '3px solid #ea4335' : '3px solid transparent'
              }}
            >
              <ShieldAlert size={18} />
              <span>Host controls</span>
              {!isHost && <Lock size={12} style={{ marginLeft: 'auto' }} />}
            </button>
          </div>

          {/* Content Pane */}
          <div
            style={{
              flex: 1,
              padding: '24px 32px',
              overflowY: 'auto'
            }}
          >
            {/* --- AUDIO TAB --- */}
            {activeTab === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9aa0a6', marginBottom: '8px', fontWeight: '500' }}>
                    MICROPHONE
                  </label>
                  <select
                    value={personalSettings.audioInputDeviceId || ''}
                    onChange={(e) => onUpdatePersonalSettings({ audioInputDeviceId: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#303134',
                      border: '1px solid #5f6368',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    {audioDevices.length === 0 ? (
                      <option value="">Default - System Microphone</option>
                    ) : (
                      audioDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Microphone ${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', color: '#9aa0a6', fontWeight: '500' }}>
                      SPEAKERS
                    </label>
                    <button
                      type="button"
                      onClick={handleTestSpeaker}
                      style={{
                        backgroundColor: '#303134',
                        border: '1px solid #5f6368',
                        color: '#8ab4f8',
                        borderRadius: '16px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Volume2 size={14} /> {testAudioPlaying ? 'Testing...' : 'Test speakers'}
                    </button>
                  </div>
                  <select
                    value={personalSettings.audioOutputDeviceId || ''}
                    onChange={(e) => onUpdatePersonalSettings({ audioOutputDeviceId: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#303134',
                      border: '1px solid #5f6368',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    {outputDevices.length === 0 ? (
                      <option value="">Default - System Speakers</option>
                    ) : (
                      outputDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Speaker ${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Noise Cancellation Toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: '#303134',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>
                      Noise cancellation
                    </div>
                    <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px' }}>
                      Filters out sound that isn’t speech
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={personalSettings.noiseCancellation ?? true}
                    onChange={(e) => onUpdatePersonalSettings({ noiseCancellation: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                  />
                </div>
              </div>
            )}

            {/* --- VIDEO TAB --- */}
            {activeTab === 'video' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9aa0a6', marginBottom: '8px', fontWeight: '500' }}>
                    CAMERA
                  </label>
                  <select
                    value={personalSettings.videoInputDeviceId || ''}
                    onChange={(e) => onUpdatePersonalSettings({ videoInputDeviceId: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#303134',
                      border: '1px solid #5f6368',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    {videoDevices.length === 0 ? (
                      <option value="">Default - Integrated Camera</option>
                    ) : (
                      videoDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9aa0a6', marginBottom: '8px', fontWeight: '500' }}>
                    SEND RESOLUTION (MAXIMUM)
                  </label>
                  <select
                    value={personalSettings.sendResolution || '720p'}
                    onChange={(e) => onUpdatePersonalSettings({ sendResolution: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#303134',
                      border: '1px solid #5f6368',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    <option value="720p">High definition (720p)</option>
                    <option value="360p">Standard definition (360p)</option>
                    <option value="180p">Low definition (180p - Data Saver)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9aa0a6', marginBottom: '8px', fontWeight: '500' }}>
                    RECEIVE RESOLUTION (MAXIMUM)
                  </label>
                  <select
                    value={personalSettings.receiveResolution || 'auto'}
                    onChange={(e) => onUpdatePersonalSettings({ receiveResolution: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#303134',
                      border: '1px solid #5f6368',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  >
                    <option value="auto">Auto (SFU Selective Adaptation)</option>
                    <option value="720p">High definition (720p)</option>
                    <option value="360p">Standard definition (360p)</option>
                    <option value="audio-only">Audio only (Ultra Low Bandwidth)</option>
                  </select>
                </div>
              </div>
            )}

            {/* --- GENERAL TAB --- */}
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: '#303134',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>
                      Mirror my video
                    </div>
                    <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px' }}>
                      Flips your webcam view like a mirror
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={personalSettings.mirrorVideo ?? true}
                    onChange={(e) => onUpdatePersonalSettings({ mirrorVideo: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: '#303134',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>
                      Mute microphone upon joining
                    </div>
                    <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px' }}>
                      Always join calls with audio muted
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={personalSettings.defaultAudioMuted ?? false}
                    onChange={(e) => onUpdatePersonalSettings({ defaultAudioMuted: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: '#303134',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>
                      Turn off camera upon joining
                    </div>
                    <div style={{ fontSize: '12px', color: '#9aa0a6', marginTop: '2px' }}>
                      Always join calls with camera off
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={personalSettings.defaultVideoOff ?? false}
                    onChange={(e) => onUpdatePersonalSettings({ defaultVideoOff: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                  />
                </div>
              </div>
            )}

            {/* --- HOST CONTROLS (ADMIN ONLY) TAB --- */}
            {activeTab === 'host' && (
              <div>
                {!isHost ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        backgroundColor: '#303134',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9aa0a6'
                      }}
                    >
                      <Lock size={28} />
                    </div>
                    <h3 style={{ fontSize: '16px', color: '#ffffff', fontWeight: '500' }}>
                      Host controls are restricted
                    </h3>
                    <p style={{ fontSize: '13px', color: '#9aa0a6', maxWidth: '360px', lineHeight: '1.4' }}>
                      Only the meeting host or designated administrators have authority to modify meeting-wide policies and controls.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'rgba(234, 67, 53, 0.1)',
                        border: '1px solid rgba(234, 67, 53, 0.3)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#f28b82'
                      }}
                    >
                      👑 <strong>Host Authority Active:</strong> Settings you change here apply immediately to all participants in this meeting.
                    </div>

                    <div style={{ fontSize: '12px', color: '#9aa0a6', fontWeight: '600', letterSpacing: '0.8px' }}>
                      PARTICIPANT PERMISSIONS
                    </div>

                    {/* Allow Screen Share */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>Share their screen</div>
                        <div style={{ fontSize: '12px', color: '#9aa0a6' }}>Let participants present their screen</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={roomSettings.allowScreenShare ?? true}
                        onChange={() => handleHostToggle('allowScreenShare')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                      />
                    </div>

                    {/* Allow Chat Messages */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>Send chat messages</div>
                        <div style={{ fontSize: '12px', color: '#9aa0a6' }}>Let participants send in-call messages</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={roomSettings.allowChat ?? true}
                        onChange={() => handleHostToggle('allowChat')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                      />
                    </div>

                    {/* Allow Microphones */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>Turn on their microphone</div>
                        <div style={{ fontSize: '12px', color: '#9aa0a6' }}>When off, only hosts can unmute</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={roomSettings.allowMic ?? true}
                        onChange={() => handleHostToggle('allowMic')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                      />
                    </div>

                    {/* Allow Cameras */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>Turn on their video</div>
                        <div style={{ fontSize: '12px', color: '#9aa0a6' }}>When off, participants cannot turn on camera</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={roomSettings.allowCamera ?? true}
                        onChange={() => handleHostToggle('allowCamera')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1a73e8' }}
                      />
                    </div>

                    {/* Lock Meeting */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3c4043', paddingBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>Lock meeting</div>
                        <div style={{ fontSize: '12px', color: '#9aa0a6' }}>Prevent any new participants from joining</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={roomSettings.isLocked ?? false}
                        onChange={() => handleHostToggle('isLocked')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ea4335' }}
                      />
                    </div>

                    {/* Host Quick Actions */}
                    <div style={{ paddingTop: '8px' }}>
                      <button
                        type="button"
                        onClick={onHostMuteAll}
                        style={{
                          backgroundColor: '#303134',
                          border: '1px solid #ea4335',
                          color: '#f28b82',
                          borderRadius: '8px',
                          padding: '10px 16px',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <Mic size={16} /> Mute all participants
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

