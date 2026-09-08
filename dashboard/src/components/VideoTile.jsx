import { useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../lib/constants';

function bandColor(score) {
  if (score >= THRESHOLD_HIGH) return '#ef4444';
  if (score >= THRESHOLD_MEDIUM) return '#f59e0b';
  return '#10b981';
}

export default function VideoTile({ stream, label, muted = false, riskScore = null, isCameraOff = false }) {
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
          <span style={{ fontSize: 17, letterSpacing: '0.05em' }}>
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
          fontSize: 15, fontWeight: 700, letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.9)',
          background: 'rgba(0,0,0,0.85)',
          padding: '3px 8px', borderRadius: 6,
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
        {riskScore != null && (
          <span style={{
            fontSize: 15, fontWeight: 800, letterSpacing: '0.08em',
            color: '#fff',
            background: `${bandColor(riskScore)}f2`,
            padding: '3px 8px', borderRadius: 6,
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
