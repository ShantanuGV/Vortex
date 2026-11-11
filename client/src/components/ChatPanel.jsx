import React, { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';

export default function ChatPanel({
  chatMessages,
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
          In-call messages
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

      {/* Info notice */}
      <div
        style={{
          margin: '12px 16px',
          padding: '12px',
          backgroundColor: '#303134',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#9aa0a6',
          lineHeight: '1.4'
        }}
      >
        Messages can only be seen by people in the call and are deleted when the call ends.
      </div>

      {/* Messages List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        {chatMessages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#80868b',
              marginTop: '40px',
              fontSize: '14px'
            }}
          >
            No messages yet. Send a message to start chatting!
          </div>
        ) : (
          chatMessages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#e8eaed'
                  }}
                >
                  {msg.senderName}
                </span>
                <span style={{ fontSize: '11px', color: '#9aa0a6' }}>
                  {msg.timestamp}
                </span>
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: '#ffffff',
                  wordBreak: 'break-word',
                  lineHeight: '1.4'
                }}
              >
                {msg.message}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input box */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px',
          borderTop: '1px solid #3c4043',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message..."
          style={{
            flex: 1,
            backgroundColor: '#303134',
            border: '1px solid #5f6368',
            borderRadius: '24px',
            padding: '10px 16px',
            color: '#ffffff',
            fontSize: '14px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          style={{
            backgroundColor: inputText.trim() ? '#1a73e8' : '#3c4043',
            color: inputText.trim() ? '#ffffff' : '#80868b',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() ? 'pointer' : 'default',
            transition: 'background-color 0.2s'
          }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

