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
  RefreshCw, ExternalLink, ArrowLeft
} from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import CloneWarningOverlay from '../components/CloneWarningOverlay';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM, API_BASE, WS_BASE } from '../lib/constants';

import VideoTile from '../components/VideoTile';
import CallControls from '../components/CallControls';
import CallRiskDisplay from '../components/CallRiskDisplay';

// ── Helpers ───────────────────────────────────────────────────────────────

function genRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Lobby (room create / join) ────────────────────────────────────────────

function Lobby({ onJoin }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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
      const res = await fetch(`${API_BASE}/rooms/${id}/exists`, {
        headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY || '' }
      });
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
      background: 'var(--bg-base)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)',
      padding: 24, position: 'relative'
    }}>
      <button 
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute', top: 24, left: 24,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', padding: '10px 16px', borderRadius: 8,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          fontWeight: 600, transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(92,52,37,0.05)'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
      >
        <ArrowLeft size={18} /> Back to Dashboard
      </button>

      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(92,52,37,0.08)',
        position: 'relative',
      }}>
        {/* VoiceTrace badge */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(92,52,37,0.08)',
            border: '1px solid rgba(92,52,37,0.2)',
            borderRadius: 100, padding: '6px 16px', marginBottom: 16,
          }}>
            <Shield size={14} color="var(--accent-rust)" />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent-rust)', textTransform: 'uppercase' }}>
              VoiceTrace Live Call
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            AI Clone Detection
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
            Start a WebRTC call with real-time voice-clone risk scoring.
          </p>
        </div>

        {/* Room ID input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
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
                background: 'rgba(0,0,0,0.02)',
                border: error ? '1px solid #ef4444' : '1px solid var(--border)',
                color: 'var(--text-primary)', fontSize: 19, fontWeight: 700,
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
                background: 'rgba(92,52,37,0.05)',
                border: '1px solid rgba(92,52,37,0.2)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-rust)', transition: 'all 0.2s',
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {error && (
            <div style={{ color: '#f87171', fontSize: 15, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={11} /> {error}
            </div>
          )}
        </div>

        {/* Share link */}
        {urlForShare && (
          <div style={{
            marginBottom: 16,
            background: 'rgba(92,52,37,0.03)',
            border: '1px solid rgba(92,52,37,0.1)',
            borderRadius: 10, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <ExternalLink size={12} color="var(--accent-rust)" style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 15, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {urlForShare}
            </span>
            <button
              onClick={handleCopyLink}
              title="Copy join link"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: copied ? '#10b981' : 'var(--accent-rust)', display: 'flex',
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
            background: 'linear-gradient(135deg, var(--accent-rust), #A26B49)',
            border: 'none', cursor: 'pointer', color: '#fff',
            fontSize: 18, fontWeight: 800, letterSpacing: '0.05em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 14px rgba(196,138,102,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(196,138,102,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(196,138,102,0.3)'; }}
        >
          <Phone size={16} />
          {roomInput ? 'Join Room' : 'Create & Join'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.6 }}>
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

  const handleBackToDashboard = useCallback(() => {
    if (callState !== 'idle' && callState !== 'ended') {
      hangUp();
    }
    navigate('/dashboard');
  }, [callState, hangUp, navigate]);

  // ── Lobby ──
  if (!activeRoomId || callState === 'idle') {
    return <Lobby onJoin={handleLobbyJoin} />;
  }

  // ── Call UI ──
  const inCall = callState === 'active' || callState === 'connecting' || callState === 'waiting' || callState === 'ringing';

  return (
    <div style={{
      height: '100vh', background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-sans)', color: 'var(--text-primary)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            onClick={handleBackToDashboard}
            title="Back to Dashboard"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
              padding: '4px', borderRadius: '4px'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <Shield size={16} color="var(--accent-rust)" />
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            VoiceTrace
          </span>
          <span style={{
            fontSize: 14, color: 'var(--text-secondary)',
            background: 'rgba(92,52,37,0.05)',
            border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 7px', fontFamily: 'monospace',
          }}>
            ROOM {activeRoomId}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Connection state pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 100, padding: '4px 10px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: callState === 'active' ? '#10b981' : callState === 'error' ? '#ef4444' : '#f59e0b',
              animation: callState === 'waiting' || callState === 'connecting' ? 'vt-blink 1.2s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              {callState === 'idle' ? 'Ready' :
               callState === 'connecting' ? 'Connecting...' :
               callState === 'waiting' ? 'Waiting for peer...' :
               callState === 'ringing' ? 'Calling...' :
               callState === 'active' ? 'Connected' :
               callState === 'ended' ? 'Call Ended' : 'Error'}
            </span>
          </div>
          <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
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
              <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>Call ended</div>
              <button
                onClick={() => { setActiveRoomId(null); navigate('/call'); }}
                style={{
                  background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                  color: '#a78bfa', borderRadius: 10, padding: '10px 24px',
                  cursor: 'pointer', fontSize: 17, fontWeight: 700,
                }}
              >
                Return to Lobby
              </button>
            </div>
          )}

          {/* Error state */}
          {callState === 'error' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <AlertTriangle size={48} color="#ef4444" />
              <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>Connection failed. Could not establish call.</div>
              <button
                onClick={() => { setActiveRoomId(null); navigate('/call'); }}
                style={{
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', borderRadius: 10, padding: '10px 24px',
                  cursor: 'pointer', fontSize: 17, fontWeight: 700,
                }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Active call: video tiles */}
          {callState !== 'ended' && callState !== 'error' && (
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
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
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
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-card)',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.15em',
            color: 'var(--text-secondary)', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Activity size={11} />
            Detection Panel
          </div>
          <CallRiskDisplay riskEvent={riskEvent} windowCount={windowCount} />
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
