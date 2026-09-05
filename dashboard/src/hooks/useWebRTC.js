/**
 * dashboard/src/hooks/useWebRTC.js
 *
 * Encapsulates all RTCPeerConnection logic for a 1:1 WebRTC call.
 *
 * Architecture (matches locked design):
 *   - WebRTC media path (actual call audio/video) is peer-to-peer via STUN.
 *   - Signaling (offer/answer/ICE) flows through WS /ws/signal/{roomId}.
 *   - Audio side-channel detection is SEPARATE: raw PCM is captured via
 *     Web Audio API and sent as binary frames to WS /ws/call/{callId}.
 *     Detection latency NEVER affects call audio — it's a parallel pipeline.
 *
 * Detection flow:
 *   getUserMedia → MediaStreamSource → ScriptProcessor → binary WS frames
 *                                                           ↓
 *                                                  server /ws/call/{callId}
 *                                                           ↓
 *                                               BatchWorker → AASIST-L
 *                                                           ↓
 *                                                  JSON risk events pushed back
 *                                                  over the same WS connection
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { WS_BASE, MIC_SAMPLE_RATE, MIC_BUFFER_SIZE, ICE_SERVERS } from '../lib/constants';

const DEFAULT_ICE_CONFIG = {
  iceServers: ICE_SERVERS,
};

export function useWebRTC({ roomId, onRiskEvent }) {
  // ── State ─────────────────────────────────────────────────────────────
  const [callState, setCallState] = useState('idle');
  // idle | connecting | waiting | ringing | active | ended | error
  const [role, setRole] = useState(null); // 'caller' | 'callee'
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // ── Refs (stable across renders) ──────────────────────────────────────
  const sigWsRef = useRef(null);       // signaling WebSocket
  const detWsRef = useRef(null);       // detection side-channel WebSocket
  const pcRef = useRef(null);          // RTCPeerConnection
  const localStreamRef = useRef(null); // raw MediaStream
  const audioCtxRef = useRef(null);    // AudioContext for PCM capture
  const processorRef = useRef(null);   // ScriptProcessor for detection stream
  const pendingCandidatesRef = useRef([]); // ICE candidates queued before remote desc

  // ── Helpers ───────────────────────────────────────────────────────────

  const _log = (msg, ...args) => console.debug(`[WebRTC:${roomId}]`, msg, ...args);

  const _closeAll = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    sigWsRef.current?.close();
    sigWsRef.current = null;
    detWsRef.current?.close();
    detWsRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  // ── Detection side-channel setup ──────────────────────────────────────

  const _startDetection = useCallback(async (stream, callId) => {
    const apiKey = import.meta.env.VITE_API_KEY ?? '';
    // Use payload auth (not query-string) to keep tokens out of URLs/logs,
    // matching useWebSocket.js and useMicStream.js patterns.
    const ws = new WebSocket(`${WS_BASE}/ws/call/${callId}`);
    detWsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }));
      _log('detection WS open, callId=%s', callId);
    };

    ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data);
        if (onRiskEvent) onRiskEvent(event);
      } catch (_) {}
    };

    ws.onclose = (ev) => {
      if (ev.code === 1008) {
        console.error('[WebRTC] detection WS auth rejected (1008). Check VITE_API_KEY.');
      }
    };

    // Capture audio as float32 PCM and send as binary frames
    const ctx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    
    // Modern AudioWorklet instead of deprecated ScriptProcessor
    await ctx.audioWorklet.addModule('/pcm-processor.js');
    const proc = new AudioWorkletNode(ctx, 'pcm-processor');
    processorRef.current = proc;

    proc.port.onmessage = (e) => {
      const pcm = e.data; // Float32Array from processor
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      }
    };

    source.connect(proc);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    proc.connect(mute);
    mute.connect(ctx.destination);
    _log('detection side-channel started');
  }, [onRiskEvent]);

  // ── RTCPeerConnection setup ───────────────────────────────────────────

  const _createPeerConnection = useCallback((stream) => {
    const pc = new RTCPeerConnection(DEFAULT_ICE_CONFIG);
    pcRef.current = pc;

    // Add local tracks to the peer connection
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // When remote tracks arrive, expose them as remoteStream
    pc.ontrack = (ev) => {
      _log('remote track received, kind=%s', ev.track.kind);
      if (ev.streams && ev.streams[0]) {
        setRemoteStream(ev.streams[0]);
      }
    };

    // ICE candidates: send to signaling relay
    pc.onicecandidate = (ev) => {
      if (ev.candidate && sigWsRef.current?.readyState === WebSocket.OPEN) {
        sigWsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: ev.candidate,
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      _log('connection state → %s', state);
      if (state === 'connected') {
        setCallState('active');
      } else if (state === 'failed' || state === 'disconnected') {
        setCallState('ended');
        _closeAll();
      }
    };

    pc.onicegatheringstatechange = () => {
      _log('ICE gathering state → %s', pc.iceGatheringState);
    };

    return pc;
  }, [_closeAll]);

  // ── Signaling message handler ─────────────────────────────────────────

  const _handleSignal = useCallback(async (msg) => {
    const data = JSON.parse(msg);
    _log('signal received, type=%s', data.type);

    if (data.type === 'ready') {
      setRole(data.role);
      setCallState(data.role === 'caller' ? 'ringing' : 'waiting');

      if (data.role === 'caller') {
        // Caller initiates: create offer
        const offer = await pcRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pcRef.current.setLocalDescription(offer);
        sigWsRef.current.send(JSON.stringify({ type: 'offer', sdp: offer }));
        _log('offer sent');
      }
    }

    else if (data.type === 'offer' && pcRef.current) {
      // Callee receives offer, sends answer
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      // Flush any queued ICE candidates
      for (const c of pendingCandidatesRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidatesRef.current = [];
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      sigWsRef.current.send(JSON.stringify({ type: 'answer', sdp: answer }));
      setCallState('active');
      _log('answer sent');
    }

    else if (data.type === 'answer' && pcRef.current) {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      // Flush queued candidates
      for (const c of pendingCandidatesRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidatesRef.current = [];
      _log('answer received, remote desc set');
    }

    else if (data.type === 'ice-candidate' && pcRef.current) {
      if (pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        // Queue until remote description is set
        pendingCandidatesRef.current.push(data.candidate);
      }
    }

    else if (data.type === 'hangup') {
      _log('remote hangup received');
      setCallState('ended');
      _closeAll();
    }
  }, [_closeAll]);

  // ── Public API ────────────────────────────────────────────────────────

  const joinCall = useCallback(async () => {
    if (callState !== 'idle') return;
    setCallState('connecting');

    try {
      // 1. Acquire local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Create peer connection
      _createPeerConnection(stream);

      // 3. Start detection side-channel (parallel to media path)
      //    callId = roomId + '-local' to namespace each participant
      await _startDetection(stream, `${roomId}-local`);

      // 4. Open signaling WebSocket
      const sigWs = new WebSocket(`${WS_BASE}/ws/signal/${roomId}`);
      sigWsRef.current = sigWs;

      sigWs.onopen = () => {
        _log('signaling WS open, room=%s', roomId);
        setCallState('waiting'); // waiting for 2nd peer
      };

      sigWs.onmessage = (ev) => _handleSignal(ev.data);

      sigWs.onclose = (ev) => {
        if (ev.code === 1008) {
          setCallState('error');
          console.error('[WebRTC] signaling room full (1008)');
        }
        _log('signaling WS closed, code=%d', ev.code);
      };

      sigWs.onerror = (err) => {
        console.error('[WebRTC] signaling WS error', err);
        setCallState('error');
      };

    } catch (err) {
      console.error('[WebRTC] joinCall failed:', err);
      setCallState('error');
      _closeAll();
    }
  }, [callState, roomId, _createPeerConnection, _startDetection, _handleSignal, _closeAll]);

  const hangUp = useCallback(() => {
    if (sigWsRef.current?.readyState === WebSocket.OPEN) {
      sigWsRef.current.send(JSON.stringify({ type: 'hangup' }));
    }
    setCallState('ended');
    _closeAll();
  }, [_closeAll]);

  const toggleMute = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    audioTracks.forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
    videoTracks.forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOff(c => !c);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => _closeAll(), [_closeAll]);

  return {
    callState,
    role,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    joinCall,
    hangUp,
    toggleMute,
    toggleCamera,
  };
}
