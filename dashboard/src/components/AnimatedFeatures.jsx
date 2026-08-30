import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Cloud, Terminal, Mic, Zap, Layers } from 'lucide-react';

// ─── Lazy load wrapper ──────────────────────────────────────────────────────

function LazyLoad({ children, className, rootMargin = '200px' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : null}
    </div>
  );
}

// ─── Animation: AASIST-L Artifact Detection (Voice Cloning) ─────────────────

function AasistDetectionAnimation() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 3);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  const samples = ['Window 1', 'Window 2', 'Window 3'];
  const bars = [0.4, 0.7, 0.5, 0.9, 0.3, 0.6, 0.8, 0.4, 0.7, 0.5, 0.3, 0.6];

  return (
    <div className="h-40 w-full flex items-center justify-center overflow-hidden rounded-md bg-[#F4D2BB]/20 p-4">
      <div className="flex flex-col items-center gap-3 w-full max-w-[200px]">
        {/* Sample pills */}
        <div className="flex gap-1.5">
          {samples.map((s, i) => (
            <motion.div
              key={s}
              className="text-[9px] px-2 py-1 rounded-full border font-medium"
              animate={{
                borderColor: i === phase ? 'rgba(249, 115, 22, 0.5)' : 'rgba(67, 44, 31, 0.06)',
                backgroundColor: i === phase ? 'rgba(249, 115, 22, 0.08)' : 'rgba(67, 44, 31, 0.02)',
                color: i === phase ? '#5C3425' : 'rgba(67, 44, 31, 0.4)',
              }}
              transition={{ duration: 0.3 }}
            >
              {s}
            </motion.div>
          ))}
        </div>

        {/* Waveform visualization */}
        <div className="flex items-center gap-[2px] h-10 w-full justify-center">
          {bars.map((h, i) => (
            <motion.div
              key={i}
              className="w-[4px] rounded-full"
              animate={{
                height: `${h * 100}%`,
                backgroundColor: phase === 2 ? '#5C3425' : 'rgba(67, 44, 31, 0.15)',
              }}
              transition={{
                height: { duration: 0.6, delay: i * 0.04, ease: 'easeInOut' },
                backgroundColor: { duration: 0.3 },
              }}
            />
          ))}
        </div>

        {/* Result label */}
        <motion.div
          className="text-[9px] font-mono"
          animate={{
            opacity: phase === 2 ? 1 : 0.3,
            color: phase === 2 ? '#5C3425' : 'rgba(67, 44, 31, 0.4)',
          }}
          transition={{ duration: 0.3 }}
        >
          artifacts detected
        </motion.div>
      </div>
    </div>
  );
}

// ─── Mini waveform for clips ────────────────────────────────────────────────
const WAVEFORM_BAR_COUNT = 60;

function MiniWaveform({ seed, color }) {
  const bars = useMemo(() => {
    let s = seed * 9301 + 49297;
    const rand = () => {
      s = (s * 16807 + 0) % 2147483647;
      return s / 2147483647;
    };
    const r = Array.from({ length: WAVEFORM_BAR_COUNT }, () => rand());

    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => {
      const t = i / WAVEFORM_BAR_COUNT;
      const envelope =
        0.3 +
        0.35 *
          Math.sin(t * Math.PI * (2 + (seed % 3))) *
          Math.sin(t * Math.PI * (1.3 + seed * 0.7)) +
        0.2 * Math.sin(t * Math.PI * (4.7 + seed * 1.3));
      const mid = 0.15 * Math.sin(i * 0.8 + seed * 3.1) * Math.cos(i * 1.3 + seed);
      const noise = (r[i] - 0.5) * 0.25;
      const raw = envelope + mid + noise;
      return Math.max(0.06, Math.min(1, raw));
    });
  }, [seed]);

  return (
    <div className="flex items-center h-full overflow-hidden">
      {bars.map((h, i) => (
        <div
          key={`w-${seed}-${i}`}
          className="shrink-0 rounded-full opacity-50"
          style={{
            width: 2,
            marginRight: 1,
            height: `${h * 100}%`,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}

// ─── Animation: Multi-stream Telemetry (Stories Editor) ──────────────────────

const INITIAL_CLIPS = [
  { id: 'n1', profile: 'Caller 1', track: 0, x: 4, w: 70, seed: 1 },
  { id: 'n2', profile: 'Caller 1', track: 0, x: 135, w: 35, seed: 2 },
  { id: 'a1', profile: 'Agent', track: 1, x: 25, w: 40, seed: 3 },
  { id: 'a2', profile: 'Agent', track: 1, x: 120, w: 35, seed: 4 },
  { id: 'b1', profile: 'Bot', track: 2, x: 70, w: 45, seed: 5 },
];

const TL_W = 220;
const ACTIONS = [
  { label: 'Analyze segment', apply: (c) => c.map((cl) => (cl.id === 'b1' ? { ...cl, x: 55 } : cl)) },
  {
    label: 'Flag deepfake',
    apply: (c) => {
      if (c.some((cl) => cl.id === 'n1b')) return c;
      const clip = c.find((cl) => cl.id === 'n1');
      if (!clip) return c;
      const leftW = 25;
      const gap = 8;
      const rightW = clip.w - leftW - gap;
      return [
        ...c.filter((cl) => cl.id !== 'n1'),
        { ...clip, w: leftW, id: 'n1' },
        { id: 'n1b', profile: clip.profile, track: clip.track, x: clip.x + leftW + gap, w: rightW, seed: 6 },
      ];
    },
  },
  { label: 'Verify identity', apply: (c) => c.map((cl) => (cl.id === 'a2' ? { ...cl, w: 25 } : cl)) },
  {
    label: 'Match voiceprint',
    apply: (c) => {
      if (c.some((cl) => cl.id === 'b1d')) return c;
      const clip = c.find((cl) => cl.id === 'b1');
      if (!clip) return c;
      return [...c, { ...clip, id: 'b1d', track: 0, x: 180, w: 35, seed: 7 }];
    },
  },
  { label: '', apply: () => INITIAL_CLIPS },
];

function TelemetryAnimation() {
  const [clips, setClips] = useState(INITIAL_CLIPS);
  const [actionIndex, setActionIndex] = useState(-1);
  const [playheadX, setPlayheadX] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const playheadRef = useRef(0);

  useEffect(() => {
    let start = null;
    const speed = 12; // px per second
    const animate = (ts) => {
      if (start === null) start = ts;
      const elapsed = (ts - start) / 1000;
      setPlayheadX((elapsed * speed) % TL_W);
      playheadRef.current = requestAnimationFrame(animate);
    };
    playheadRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(playheadRef.current);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActionIndex((prev) => {
        const next = (prev + 1) % ACTIONS.length;
        setClips((current) => ACTIONS[next].apply(current));
        if (next === 0) setSelectedId('b1');
        else if (next === 1) setSelectedId('n1');
        else if (next === 2) setSelectedId('a2');
        else if (next === 3) setSelectedId('b1');
        else setSelectedId(null);
        return next;
      });
    }, 2600);
    return () => clearInterval(interval);
  }, []);

  const trackLabels = ['1', '0', '-1'];
  const timeMarkers = [0, 2, 4, 6, 8];
  const accentColor = '#5C3425';
  const accentFg = '#fff';

  return (
    <div className="h-40 w-full flex flex-col overflow-hidden rounded-md bg-[#F4D2BB]/20">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[#5C3425]/5 bg-white/40 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-[#5C3425]/30" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded flex items-center justify-center bg-white shadow-sm border border-[#5C3425]/5">
            <div className="border-l-[4px] border-l-[#5C3425]/40 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent ml-0.5" />
          </div>
          <div className="w-4 h-4 rounded flex items-center justify-center bg-white shadow-sm border border-[#5C3425]/5">
            <div className="w-2 h-2 rounded-sm bg-[#5C3425]/30" />
          </div>
        </div>
        <span className="text-[8px] text-[#5C3425]/40 font-mono ml-1 tabular-nums">0:03 / 0:10</span>
        <div className="flex-1" />
        {actionIndex >= 0 && actionIndex < ACTIONS.length - 1 && (
          <motion.span
            key={actionIndex}
            className="text-[7px] font-medium px-1.5 py-0.5 rounded-full bg-[#F4D2BB]/80 text-[#5C3425]"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {ACTIONS[actionIndex].label}
          </motion.span>
        )}
        <div className="flex items-center gap-0.5">
          <span className="text-[7px] text-[#5C3425]/40">Zoom</span>
          <div className="w-3 h-3 rounded flex items-center justify-center bg-white shadow-sm border border-[#5C3425]/5 text-[8px] text-[#5C3425]/50">-</div>
          <div className="w-3 h-3 rounded flex items-center justify-center bg-white shadow-sm border border-[#5C3425]/5 text-[8px] text-[#5C3425]/50">+</div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-7 shrink-0 border-r border-[#5C3425]/5 bg-white/20 flex flex-col">
          <div className="h-5 border-b border-[#5C3425]/5" />
          {trackLabels.map((label) => (
            <div key={label} className="flex-1 flex items-center justify-center border-b border-[#5C3425]/5">
              <span className="text-[7px] text-[#5C3425]/40 select-none">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 relative overflow-hidden flex flex-col">
          <div className="h-5 shrink-0 border-b border-[#5C3425]/5 bg-white/20 relative">
            {timeMarkers.map((t) => (
              <div key={`tm-${t}`} className="absolute top-0 h-full flex flex-col justify-end pb-0.5" style={{ left: `${(t / 10) * 100}%` }}>
                <div className="h-1.5 w-px bg-[#5C3425]/20" />
                <span className="text-[7px] text-[#5C3425]/40 ml-0.5 select-none">{`0:0${t}`}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 relative min-h-0">
            {trackLabels.map((label, i) => (
              <div
                key={`bg-${label}`}
                className="border-b border-[#5C3425]/5 absolute left-0 right-0"
                style={{
                  height: `${100 / 3}%`,
                  top: `${(i * 100) / 3}%`,
                  backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}

            {clips.map((clip) => {
              const trackIdx = clip.track;
              const isSelected = clip.id === selectedId;
              const clipTop = `calc(${(trackIdx * 100) / 3}% + 2px)`;
              const clipHeight = `calc(${100 / 3}% - 4px)`;
              return (
                <motion.div
                  key={clip.id}
                  className="absolute rounded overflow-hidden"
                  initial={false}
                  style={{ height: clipHeight, left: `${(clip.x / TL_W) * 100}%`, width: `${(clip.w / TL_W) * 100}%`, top: clipTop }}
                  animate={{ left: `${(clip.x / TL_W) * 100}%`, width: `${(clip.w / TL_W) * 100}%`, top: clipTop }}
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                >
                  <div
                    className="w-full h-full rounded overflow-hidden flex flex-col"
                    style={{
                      backgroundColor: isSelected ? '#5C3425' : '#5C3425',
                      boxShadow: isSelected ? 'inset 0 0 0 1px #F4D2BB, 0 0 0 1px rgba(0,0,0,0.1)' : 'inset 0 0 0 1px rgba(255,255,255,0.2)',
                    }}
                  >
                    <div className="shrink-0 relative" style={{ height: 9 }}>
                      <span className="text-[10px] font-medium leading-none absolute top-0 left-0.5 origin-top-left opacity-90 whitespace-nowrap" style={{ color: accentFg, transform: 'scale(0.75)' }}>
                        {clip.profile}
                      </span>
                    </div>
                    <div className="absolute left-0 right-0 bottom-0" style={{ top: 9 }}>
                      <MiniWaveform seed={clip.seed} color="rgba(255,255,255,0.7)" />
                    </div>
                  </div>
                  {isSelected && (
                    <>
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-white/40" />
                      <div className="absolute right-0 top-0 bottom-0 w-1 rounded-r bg-white/40" />
                    </>
                  )}
                </motion.div>
              );
            })}

            <motion.div
              className="absolute top-0 bottom-0 w-[2px] rounded-full z-20 pointer-events-none"
              style={{ backgroundColor: accentColor }}
              animate={{ left: `${(playheadX / TL_W) * 100}%` }}
              transition={{ duration: 0.05, ease: 'linear' }}
            >
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animation: Real-time Risk Scoring (Effects Pipeline) ──────────────────

function RiskScoringAnimation() {
  const [activeEffect, setActiveEffect] = useState(0);
  const effects = [
    { name: 'Acoustic', param: 'Extract', color: '#3b82f6' },
    { name: 'Spectral', param: 'Analyze', color: '#8b5cf6' },
    { name: 'Liveness', param: 'Check', color: '#ec4899' },
    { name: 'Risk', param: 'Score 8.4', color: '#5C3425' },
  ];

  const rawBars = [0.3, 0.6, 0.8, 0.5, 0.9, 0.4, 0.7, 0.3, 0.6, 0.5, 0.8, 0.4, 0.7, 0.9, 0.3];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveEffect((p) => (p + 1) % effects.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [effects.length]);

  return (
    <div className="h-40 w-full flex flex-col items-center justify-center overflow-hidden rounded-md bg-[#F4D2BB]/20 p-4 gap-3">
      <div className="flex items-center gap-1">
        {effects.map((fx, i) => (
          <div key={fx.name} className="flex items-center gap-1">
            <motion.div
              className="text-[8px] px-2 py-0.5 rounded-full border font-medium"
              animate={{
                borderColor: i <= activeEffect ? `${fx.color}40` : 'rgba(67, 44, 31, 0.06)',
                backgroundColor: i <= activeEffect ? `${fx.color}15` : 'rgba(67, 44, 31, 0.02)',
                color: i <= activeEffect ? fx.color : 'rgba(67, 44, 31, 0.4)',
              }}
              transition={{ duration: 0.3 }}
            >
              {fx.name}
            </motion.div>
            {i < effects.length - 1 && (
              <motion.span
                className="text-[8px]"
                animate={{ color: i < activeEffect ? 'rgba(67, 44, 31, 0.4)' : 'rgba(67, 44, 31, 0.1)' }}
                transition={{ duration: 0.3 }}
              >
                &rarr;
              </motion.span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-[2px] h-10 w-full max-w-[200px] justify-center">
        {rawBars.map((h, i) => {
          const shifted = activeEffect >= 0 ? h * (0.7 + 0.3 * Math.sin(i * 0.8)) : h;
          const dampened = activeEffect >= 1 ? shifted * (0.6 + 0.4 * Math.cos(i * 0.3)) : shifted;
          const compressed = activeEffect >= 2 ? 0.3 + dampened * 0.5 : dampened;
          const filtered = activeEffect >= 3 ? compressed * (1 - i * 0.03) : compressed;
          const finalH = Math.max(0.08, Math.min(1, filtered));

          return (
            <motion.div
              key={`bar-${i}`}
              className="w-[3px] rounded-full"
              animate={{ height: `${finalH * 100}%`, backgroundColor: effects[activeEffect].color }}
              transition={{ height: { duration: 0.5, delay: i * 0.02, ease: 'easeInOut' }, backgroundColor: { duration: 0.4 } }}
            />
          );
        })}
      </div>

      <motion.div
        className="text-[9px] font-mono text-[#755949]"
        key={activeEffect}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {effects[activeEffect].name}: {effects[activeEffect].param}
      </motion.div>
    </div>
  );
}

// ─── Animation: Local Inference Engine ───────────────────────────────────────

function LocalRemoteAnimation() {
  const [mode, setMode] = useState(0);
  const modes = ['Local GPU', 'Remote API'];

  useEffect(() => {
    const interval = setInterval(() => {
      setMode((p) => (p + 1) % 2);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-40 w-full flex items-center justify-center overflow-hidden rounded-md bg-[#F4D2BB]/20 p-4">
      <div className="flex flex-col items-center gap-4 w-full max-w-[180px]">
        <div className="flex gap-1 p-0.5 rounded-full border border-[#5C3425]/5 bg-white shadow-sm">
          {modes.map((m, i) => (
            <motion.div
              key={m}
              className="text-[9px] px-3 py-1 rounded-full font-medium"
              animate={{
                backgroundColor: i === mode ? '#5C3425' : 'transparent',
                color: i === mode ? '#fff' : 'rgba(67, 44, 31, 0.4)',
              }}
              transition={{ duration: 0.25 }}
            >
              {m}
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            animate={{
              backgroundColor: mode === 0 ? '#5C3425' : '#3b82f6',
              boxShadow: mode === 0 ? '0 0 8px rgba(234,88,12,0.4)' : '0 0 8px rgba(59,130,246,0.4)',
            }}
            transition={{ duration: 0.3 }}
          />
          <span className="text-[9px] text-[#755949] font-mono">
            {mode === 0 ? 'ONNX runtime active' : 'Connected to API endpoint'}
          </span>
          <span className="text-[8px] text-[#5C3425]/40 font-mono">
            {mode === 0 ? 'Latency: 12ms | CUDA' : 'Ping: 105ms | TCP'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Animation: Feature Extraction (Transcription) ──────────────────────────

function ExtractionAnimation() {
  const [charIndex, setCharIndex] = useState(0);
  const text = 'Subject is exhibiting synthetic audio markers indicative of cloning.';

  useEffect(() => {
    const interval = setInterval(() => {
      setCharIndex((p) => {
        if (p >= text.length) return 0;
        return p + 1;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [text.length]);

  return (
    <div className="h-40 w-full flex flex-col items-center justify-center overflow-hidden rounded-md bg-[#F4D2BB]/20 p-4 gap-3">
      <div className="flex items-center gap-[1px] h-6 w-full max-w-[180px] justify-center">
        {Array.from({ length: 30 }, (_, i) => {
          const h = 0.2 + 0.8 * Math.abs(Math.sin(i * 0.5 + charIndex * 0.1));
          const active = i < (charIndex / text.length) * 30;
          return (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-colors duration-100 ${
                active ? 'bg-[#5C3425]' : 'bg-[#5C3425]/10'
              }`}
              style={{ height: `${h * 100}%` }}
            />
          );
        })}
      </div>

      <div className="text-[10px] text-[#755949] font-mono max-w-[200px] text-center leading-relaxed min-h-[32px]">
        {text.slice(0, charIndex)}
        {charIndex < text.length && (
          <span className="inline-block w-[2px] h-3 bg-[#5C3425] animate-pulse ml-[1px] align-middle" />
        )}
      </div>
    </div>
  );
}

// ─── Animation: Continuous Stream (Unlimited Length) ────────────────────────

function ContinuousStreamAnimation() {
  const [phase, setPhase] = useState(0);

  const chunks = [
    'Analyzing audio packet 0x4A1...',
    'Performing spectral breakdown...',
    'Cross-referencing voice model...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-40 w-full flex flex-col items-center justify-center overflow-hidden rounded-md bg-[#F4D2BB]/20 p-4 gap-2.5">
      <div className="flex flex-col gap-1 w-full max-w-[220px]">
        {chunks.map((chunk, i) => (
          <motion.div
            key={`chunk-${i}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded border text-[8px]"
            animate={{
              borderColor: phase === 3 ? 'rgba(234, 88, 12, 0.3)' : i === phase ? 'rgba(234, 88, 12, 0.5)' : i < phase ? 'rgba(67, 44, 31, 0.1)' : 'rgba(67, 44, 31, 0.05)',
              backgroundColor: phase === 3 ? 'rgba(234, 88, 12, 0.04)' : i === phase ? 'rgba(234, 88, 12, 0.08)' : i < phase ? 'rgba(67, 44, 31, 0.02)' : 'rgba(67, 44, 31, 0.01)',
            }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              animate={{
                backgroundColor: phase === 3 ? '#5C3425' : i === phase ? '#5C3425' : i < phase ? 'rgba(67, 44, 31, 0.2)' : 'rgba(67, 44, 31, 0.05)',
                boxShadow: i === phase && phase < 3 ? '0 0 6px #5C3425' : '0 0 0px transparent',
              }}
              transition={{ duration: 0.3 }}
            />
            <span className={`truncate font-mono ${phase === 3 || i <= phase ? 'text-[#755949]' : 'text-[#5C3425]/40'}`}>
              {chunk}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-1 w-full max-w-[220px]">
        {chunks.map((_, i) => (
          <motion.div
            key={`seg-${i}`}
            className="h-1.5 flex-1 rounded-full"
            animate={{
              backgroundColor: phase === 3 ? '#5C3425' : i < phase ? 'rgba(67, 44, 31, 0.15)' : i === phase ? 'rgba(234, 88, 12, 0.5)' : 'rgba(67, 44, 31, 0.05)',
            }}
            transition={{ duration: 0.4 }}
          />
        ))}
      </div>

      <motion.div
        className="text-[9px] font-mono"
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <span className={phase === 3 ? 'text-[#5C3425]' : 'text-[#5C3425]/50'}>
          {phase < 3 ? `Processing stream chunk ${phase + 1} of ${chunks.length}...` : 'Stream chunk verified'}
        </span>
      </motion.div>
    </div>
  );
}

// ─── Feature data ───────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: 'AASIST-L Artifact Detection',
    description: 'Utilizes state-of-the-art Anti-Spoofing models to detect synthetic artifacts and voice cloning in milliseconds.',
    icon: Mic,
    animation: AasistDetectionAnimation,
  },
  {
    title: 'Multi-stream Telemetry',
    description: 'Simultaneously process and analyze multiple voice streams. Perfect for multi-party call centers and VOIP integrations.',
    icon: Activity,
    animation: TelemetryAnimation,
  },
  {
    title: 'Real-time Risk Scoring',
    description: 'Acoustic and spectral signals are combined to generate a live, rolling risk score to immediately flag suspicious callers.',
    icon: Zap,
    animation: RiskScoringAnimation,
  },
  {
    title: 'Local Inference Engine',
    description: 'Run completely locally via ONNX runtime for absolute data privacy and zero latency. Connect to cloud APIs only when needed.',
    icon: Cloud,
    animation: LocalRemoteAnimation,
  },
  {
    title: 'Feature Extraction',
    description: 'Continuous extraction of acoustic features and liveness markers seamlessly mapped to voice streams.',
    icon: Terminal,
    animation: ExtractionAnimation,
  },
  {
    title: 'Continuous Stream Processing',
    description: 'Handle infinite stream lengths without memory bloat. Audio is chunked and analyzed in overlapping windows for maximum accuracy.',
    icon: Layers,
    animation: ContinuousStreamAnimation,
  },
];

// ─── Feature Card ───────────────────────────────────────────────────────────

function FeatureCard({ feature }) {
  const Icon = feature.icon;
  const Animation = feature.animation;

  return (
    <div className="rounded-2xl border border-white bg-white/60 backdrop-blur-md shadow-xl shadow-[#5C3425]/5 overflow-hidden transition-all hover:shadow-2xl hover:border-[#F4D2BB]">
      <LazyLoad>
        <div className="pointer-events-none select-none border-b border-[#5C3425]/5">
          <Animation />
        </div>
      </LazyLoad>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-[#F4D2BB] text-[#5C3425] flex items-center justify-center shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-[15px] font-bold text-[#432C1F]">{feature.title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-[#755949]">{feature.description}</p>
      </div>
    </div>
  );
}

// ─── Features Section ───────────────────────────────────────────────────────

export default function AnimatedFeatures() {
  return (
    <section id="features" className="border-t border-[#5C3425]/5 py-24 relative z-10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-4 drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>
            Professional voice protection, zero compromise
          </h2>
          <p className="text-[#755949] max-w-2xl mx-auto">
            Everything you need to detect deepfakes, analyze streams, and authenticate identities —
            running entirely on your machine.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
