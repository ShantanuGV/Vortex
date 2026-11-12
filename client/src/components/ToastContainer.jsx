import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function ToastContainer({ toasts = [], onDismiss = () => {} }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '96px',
        left: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 1000,
        pointerEvents: 'none',
        maxWidth: '420px',
        width: '100%',
        fontFamily: "var(--font-ui, 'Inter', sans-serif)"
      }}
    >
      <style>{`
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';
        const isSuccess = toast.type === 'success';

        const borderColor = isError
          ? '#EA4335'
          : isWarning
          ? '#E5A967'
          : isSuccess
          ? '#9EAB9D'
          : '#3A4245';

        const iconColor = isError
          ? '#EA4335'
          : isWarning
          ? '#E5A967'
          : isSuccess
          ? '#9EAB9D'
          : '#9EAB9D';

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              backgroundColor: '#252B2D',
              border: `1px solid ${borderColor}`,
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
              animation: 'toast-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              color: '#F4F3EF',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              {isError && <AlertCircle size={18} color={iconColor} style={{ flexShrink: 0 }} />}
              {isWarning && <AlertTriangle size={18} color={iconColor} style={{ flexShrink: 0 }} />}
              {isSuccess && <CheckCircle2 size={18} color={iconColor} style={{ flexShrink: 0 }} />}
              {!isError && !isWarning && !isSuccess && <Info size={18} color={iconColor} style={{ flexShrink: 0 }} />}
              <span style={{ lineHeight: '1.4' }}>{toast.message}</span>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9EAB9D',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                transition: 'background 0.15s'
              }}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

