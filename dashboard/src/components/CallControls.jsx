import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

function CtrlBtn({ onClick, icon: Icon, active, activeColor, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 48, height: 48, borderRadius: '50%',
        background: active ? `${activeColor}22` : 'rgba(255,255,255,0.08)',
        border: `1px solid ${active ? activeColor : 'rgba(255,255,255,0.12)'}`,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
        color: active ? activeColor : 'rgba(255,255,255,0.7)',
      }}
    >
      <Icon size={18} />
    </button>
  );
}

export default function CallControls({ isMuted, isCameraOff, onMute, onCamera, onHangUp }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
      padding: '16px 24px',
    }}>
      <CtrlBtn
        onClick={onMute}
        icon={isMuted ? MicOff : Mic}
        active={isMuted}
        activeColor="#ef4444"
        title={isMuted ? 'Unmute' : 'Mute'}
      />
      <CtrlBtn
        onClick={onCamera}
        icon={isCameraOff ? VideoOff : Video}
        active={isCameraOff}
        activeColor="#ef4444"
        title={isCameraOff ? 'Enable Camera' : 'Disable Camera'}
      />
      <button
        onClick={onHangUp}
        title="Hang Up"
        style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'linear-gradient(135deg, #dc2626, #991b1b)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 3px rgba(220,38,38,0.3), 0 4px 16px rgba(0,0,0,0.4)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <PhoneOff size={22} color="#fff" />
      </button>
    </div>
  );
}
