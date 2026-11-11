import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Lock } from 'lucide-react';
import { getParticipantColor } from '../utils/colors';

export default function ChatPanel({
  chatMessages,
  isHost,
  roomSettings,
  onSendMessage,
  onClose
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  const isChatDisabled = !isHost && roomSettings && !roomSettings.allowChat;

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
          In-call messages
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

      {/* Info notice or Host Restricted notice */}
      {isChatDisabled ? (
        <div
          style={{
            margin: '12px 16px',
            padding: '12px 14px',
            backgroundColor: 'rgba(234, 67, 53, 0.12)',
            border: '1px solid rgba(234, 67, 53, 0.3)',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#F28B82',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Lock size={16} />
          <span>Chat has been turned off by the meeting host.</span>
        </div>
      ) : (
        <div
          style={{
            margin: '12px 16px',
            padding: '12px 14px',
            backgroundColor: '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#9EAB9D',
            lineHeight: '1.4'
          }}
        >
          Messages can only be seen by people in the call and are deleted when the call ends.
        </div>
      )}

      {/* Messages List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >
        {chatMessages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#8A9497',
              marginTop: '48px',
              fontSize: '13px'
            }}
          >
            No messages yet. Send a note to start the conversation!
          </div>
        ) : (
          chatMessages.map((msg, idx) => {
            const senderColor = getParticipantColor(msg.senderName || msg.senderId);
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  backgroundColor: '#2E3538',
                  border: '1px solid #3A4245',
                  borderRadius: '10px',
                  padding: '10px 12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: senderColor
                      }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: msg.isHost ? '#E5A967' : '#F4F3EF'
                      }}
                    >
                      {msg.senderName} {msg.isHost && '(Host)'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#8A9497' }}>
                    {msg.timestamp}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    color: '#F4F3EF',
                    wordBreak: 'break-word',
                    lineHeight: '1.4',
                    marginTop: '2px'
                  }}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input box */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px',
          borderTop: '1px solid #3A4245',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <input
          type="text"
          disabled={isChatDisabled}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isChatDisabled ? 'Chat is turned off by host' : 'Send a message...'}
          style={{
            flex: 1,
            backgroundColor: isChatDisabled ? '#252B2D' : '#2E3538',
            border: '1px solid #3A4245',
            borderRadius: '24px',
            padding: '10px 16px',
            color: isChatDisabled ? '#8A9497' : '#F4F3EF',
            fontSize: '14px',
            outline: 'none',
            cursor: isChatDisabled ? 'not-allowed' : 'text'
          }}
        />
        <button
          type="submit"
          disabled={isChatDisabled || !inputText.trim()}
          style={{
            backgroundColor: !isChatDisabled && inputText.trim() ? '#9EAB9D' : '#2E3538',
            color: !isChatDisabled && inputText.trim() ? '#252B2D' : '#8A9497',
            border: '1px solid #3A4245',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: !isChatDisabled && inputText.trim() ? 'pointer' : 'default',
            transition: 'background-color 0.2s, color 0.2s'
          }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
