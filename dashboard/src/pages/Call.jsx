/**
 * dashboard/src/pages/Call.jsx
 *
 * WebRTC 1:1 in-app calling page with live voice-clone detection overlay.
 *
 * User flow:
 *   1. Arrive at /call → see "Create or Join Room" screen
 *   2. Create Room → generates a room ID → shareable link in URL
 *   3. Person B opens the link → clicks "Join" → WebRTC call establishes
 *   4. Audio captured via Web Audio API is simultaneously:
 *      a) Sent as WebRTC media to the remote peer (P2P, zero server involvement)
 *      b) Sent as binary PCM frames to /ws/call/{roomId}-local (detection side-channel)
 *   5. Server runs AASIST-L inference every ~1s window and pushes risk events back
 *   6. CloneWarningOverlay renders on top of the call based on risk_score
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Copy, Check, Shield, Users, AlertTriangle, Activity,
  RefreshCw, ExternalLink
} from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import CloneWarningOverlay from '../components/CloneWarningOverlay';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM, API_BASE, WS_BASE } from '../lib/constants';

// ── Helpers ───────────────────────────────────────────────────────────────

function genRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function bandColor(score) {
  if (score >= THRESHOLD_HIGH) return '#ef4444';
  if (score >= THRESHOLD_MEDIUM) return '#f59e0b';
  return '#10b981';
}

function bandLabel(score) {
  if (score >= THRESHOLD_HIGH) return 'HIGH';
  if (score >= THRESHOLD_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

// ── VideoTile ─────────────────────────────────────────────────────────────

function VideoTile({ stream, label, muted = false, riskScore = null, isCameraOff = false }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{
      position: 'relative',
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      overflow: 'hidden',
      background: '#0f0f0f',
      border: riskScore != null && riskScore >= THRESHOLD_HIGH
        ? '2px solid rgba(239,68,68,0.7)'
        : '1px solid rgba(255,255,255,0.08)',
      boxShadow: riskScore != null && riskScore >= THRESHOLD_HIGH
        ? '0 0 0 3px rgba(239,68,68,0.25), 0 8px 32px rgba(0,0,0,0.6)'
        : '0 8px 32px rgba(0,0,0,0.4)',
      transition: 'border-color 0.4s, box-shadow 0.4s',
      aspectRatio: '16/9',
    }}>
      {stream && !isCameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12, color: 'rgba(255,255,255,0.3)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={28} color="rgba(255,255,255,0.3)" />
          </div>
          <span style={{ fontSize: 13, letterSpacing: '0.05em' }}>
            {stream ? 'CAMERA OFF' : 'CONNECTING...'}
          </span>
        </div>
      )}

      {/* Label */}
      <div style={{
        position: 'absolute', bottom: 10, left: 12,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.9)',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          padding: '3px 8px', borderRadius: 6,
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
        {riskScore != null && (
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            color: '#fff',
            background: `${bandColor(riskScore)}cc`,
            padding: '3px 8px', borderRadius: 6,
            backdropFilter: 'blur(8px)',
            transition: 'background 0.4s',
          }}>
            RISK {riskScore}
          </span>
        )}
      </div>

      {/* Risk accent line */}
      {riskScore != null && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 3,
          background: bandColor(riskScore),
          opacity: riskScore >= THRESHOLD_MEDIUM ? 1 : 0,
          transition: 'background 0.4s, opacity 0.4s',
        }} />
      )}
    </div>
  );
}

// ── CallControls ──────────────────────────────────────────────────────────

function CallControls({ isMuted, isCameraOff, onMute, onCamera, onHangUp }) {
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

// ── Risk Panel ────────────────────────────────────────────────────────────

function RiskSidebar({ riskEvent, windowCount }) {
  if (!riskEvent) {
    return (
      <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>
        <Activity size={20} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>Waiting for analysis...</div>
        <div style={{ marginTop: 4, fontSize: 11 }}>Voice detection starts after ~1 second of audio</div>
      </div>
    );
  }

  const { risk_score, band, signals, recommendation, latency_ms } = riskEvent;

  const topSignals = Object.entries(signals || {})
    .filter(([k]) => !k.includes('context'))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Score */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em',
          color: bandColor(risk_score), lineHeight: 1,
          textShadow: `0 0 30px ${bandColor(risk_score)}55`,
        }}>
          {risk_score}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.15em',
          color: bandColor(risk_score), textTransform: 'uppercase', marginTop: 4,
        }}>
          {bandLabel(risk_score)} RISK
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          Window #{windowCount} · {Math.round(latency_ms)}ms
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          width: `${risk_score}%`,
          background: `linear-gradient(90deg, #10b981, ${bandColor(risk_score)})`,
          transition: 'width 0.5s, background 0.4s',
        }} />
      </div>

      {/* Sub-scores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2 }}>
          Signal Breakdown
        </div>
        {topSignals.map(([key, val]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                {key.replace(/_score$/, '').replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                {Math.round(val * 100)}%
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
              <div style={{
                height: '100%', borderRadius: 3, background: bandColor(risk_score),
                width: `${val * 100}%`, transition: 'width 0.5s',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, padding: '8px 10px',
        fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
      }}>
        {recommendation}
      </div>
    </div>
  );
}

// ── Lobby (room create / join) ────────────────────────────────────────────

function Lobby({ onJoin }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [roomInput, setRoomInput] = useState(searchParams.get('room') ?? '');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = () => {
    const id = genRoomId();
    setRoomInput(id);
    setSearchParams({ room: id });
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/call?room=${roomInput}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleJoin = async () => {
    const id = roomInput.trim().toUpperCase();
    if (!id || id.length < 4) {
      setError('Enter a valid Room ID (at least 4 characters)');
      return;
    }
    setError('');

    // Check if room exists and has space before opening the WebSocket
    try {
      const res = await fetch(`${API_BASE}/rooms/${id}/exists`);
      if (res.ok) {
        const data = await res.json();
        if (data.full) {
          setError('Room is full (2 participants already connected). Try a different room.');
          return;
        }
      }
      // If the endpoint fails (server down / CORS), fall through and let
      // the WebSocket handle it — graceful degradation.
    } catch (_) {
      // Server unreachable — attempt join anyway
    }

    onJoin(id);
  };

  const urlForShare = roomInput
    ? `${window.location.origin}/call?room=${roomInput.toUpperCase()}`
    : null;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #0d1117 0%, #090c12 100%)',
      padding: 24,
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 400, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        position: 'relative',
      }}>
        {/* VoiceTrace badge */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 100, padding: '6px 16px', marginBottom: 16,
          }}>
            <Shield size={14} color="#a78bfa" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', color: '#a78bfa', textTransform: 'uppercase' }}>
              VoiceTrace Live Call
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
            AI Clone Detection
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8, lineHeight: 1.6 }}>
            Start a WebRTC call with real-time voice-clone risk scoring.
          </p>
        </div>

        {/* Room ID input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            Room ID
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={roomInput}
              onChange={e => { setRoomInput(e.target.value.toUpperCase()); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="e.g. A1B2C3"
              maxLength={12}
              style={{
                flex: 1, height: 44, borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: error ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 15, fontWeight: 700,
                letterSpacing: '0.1em', padding: '0 14px',
                outline: 'none', transition: 'border 0.2s',
                fontFamily: 'monospace',
              }}
              id="room-id-input"
            />
            <button
              onClick={handleCreate}
              title="Generate new Room ID"
              style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'rgba(139,92,246,0.15)',
                border: '1px solid rgba(139,92,246,0.3)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#a78bfa', transition: 'all 0.2s',
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {error && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={11} /> {error}
            </div>
          )}
        </div>

        {/* Share link */}
        {urlForShare && (
          <div style={{
            marginBottom: 16,
            background: 'rgba(139,92,246,0.06)',
            border: '1px solid rgba(139,92,246,0.15)',
            borderRadius: 10, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <ExternalLink size={12} color="#a78bfa" style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.4)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {urlForShare}
            </span>
            <button
              onClick={handleCopyLink}
              title="Copy join link"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: copied ? '#10b981' : '#a78bfa', display: 'flex',
                transition: 'color 0.2s',
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {/* Join button */}
        <button
          id="join-call-btn"
          onClick={handleJoin}
          style={{
            width: '100%', height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            border: 'none', cursor: 'pointer', color: '#fff',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(139,92,246,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(139,92,246,0.4)'; }}
        >
          <Phone size={16} />
          {roomInput ? 'Join Room' : 'Create & Join'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 16, lineHeight: 1.6 }}>
          Audio is processed locally. Raw audio is never stored on the server.
          <br />SIH 2026 · PSID 260104
        </p>
      </div>
    </div>
  );
}

// ── Main Call Page ────────────────────────────────────────────────────────

export default function Call() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeRoomId, setActiveRoomId] = useState(null);
  const [riskEvent, setRiskEvent] = useState(null);
  const [windowCount, setWindowCount] = useState(0);

  const handleRiskEvent = useCallback((event) => {
    if (event?.risk_score != null) {
      setRiskEvent(event);
      setWindowCount(w => w + 1);
    }
  }, []);

  const {
    callState, role, localStream, remoteStream,
    isMuted, isCameraOff,
    joinCall, hangUp, toggleMute, toggleCamera,
  } = useWebRTC({ roomId: activeRoomId, onRiskEvent: handleRiskEvent });

  const handleLobbyJoin = useCallback((roomId) => {
    setActiveRoomId(roomId);
  }, []);

  // Start call once roomId is set
  useEffect(() => {
    if (activeRoomId && callState === 'idle') {
      joinCall();
    }
  }, [activeRoomId, callState, joinCall]);

  const handleHangUp = useCallback(() => {
    hangUp();
    setActiveRoomId(null);
    setRiskEvent(null);
    setWindowCount(0);
    navigate('/call', { replace: true });
  }, [hangUp, navigate]);

  // ── Lobby ──
  if (!activeRoomId || callState === 'idle') {
    return <Lobby onJoin={handleLobbyJoin} />;
  }

  // ── Call UI ──
  const inCall = callState === 'active' || callState === 'connecting' || callState === 'waiting' || callState === 'ringing';

  return (
    <div style={{
      height: '100vh', background: '#080a0e',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={16} color="#a78bfa" />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
            VoiceTrace
          </span>
          <span style={{
            fontSize: 10, color: 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4, padding: '2px 7px', fontFamily: 'monospace',
          }}>
            ROOM {activeRoomId}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Connection state pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 100, padding: '4px 10px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: callState === 'active' ? '#10b981' : callState === 'error' ? '#ef4444' : '#f59e0b',
              animation: callState === 'waiting' || callState === 'connecting' ? 'vt-blink 1.2s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
              {callState === 'idle' ? 'Ready' :
               callState === 'connecting' ? 'Connecting...' :
               callState === 'waiting' ? 'Waiting for peer...' :
               callState === 'ringing' ? 'Calling...' :
               callState === 'active' ? 'Connected' :
               callState === 'ended' ? 'Call Ended' : 'Error'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
            {role ? `(${role})` : ''}
          </span>
        </div>
      </div>

      {/* Main body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Video area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, minWidth: 0 }}>

          {/* Call Ended state */}
          {callState === 'ended' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <PhoneOff size={48} color="rgba(255,255,255,0.2)" />
              <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>Call ended</div>
              <button
                onClick={() => { setActiveRoomId(null); navigate('/call'); }}
                style={{
                  background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                  color: '#a78bfa', borderRadius: 10, padding: '10px 24px',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                Return to Lobby
              </button>
            </div>
          )}

          {/* Active call: video tiles */}
          {callState !== 'ended' && (
            <>
              <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0, position: 'relative' }}>
                {/* Remote peer (large) */}
                <div style={{ flex: 2, minWidth: 0, position: 'relative' }}>
                  <VideoTile
                    stream={remoteStream}
                    label="Remote"
                    riskScore={riskEvent?.risk_score ?? null}
                  />
                  {/* Overlay lives here, positioned inside the remote tile area */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none', zIndex: 10 }}>
                    <CloneWarningOverlay
                      riskScore={riskEvent?.risk_score ?? 0}
                      signals={riskEvent?.signals ?? {}}
                      latencyMs={riskEvent?.latency_ms}
                    />
                  </div>
                </div>
                {/* Local (small, picture-in-picture style) */}
                <div style={{ flex: 1, minWidth: 0, maxWidth: 240 }}>
                  <VideoTile
                    stream={localStream}
                    label="You"
                    muted
                    isCameraOff={isCameraOff}
                  />
                </div>
              </div>

              {/* Controls */}
              <CallControls
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                onMute={toggleMute}
                onCamera={toggleCamera}
                onHangUp={handleHangUp}
              />
            </>
          )}
        </div>

        {/* Risk sidebar */}
        <div style={{
          width: 240, flexShrink: 0,
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.015)',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Activity size={11} />
            Detection Panel
          </div>
          <RiskSidebar riskEvent={riskEvent} windowCount={windowCount} />
        </div>
      </div>

      {/* Keyframe animations injected as style tag */}
      <style>{`
        @keyframes vt-pulse-red {
          0%, 100% { box-shadow: 0 0 0 2px rgba(220,38,38,0.4), 0 8px 32px rgba(0,0,0,0.5); }
          50%       { box-shadow: 0 0 0 5px rgba(220,38,38,0.6), 0 8px 40px rgba(220,38,38,0.25); }
        }
        @keyframes vt-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
