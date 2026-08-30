import { MoreHorizontal } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

export default function RadarAttribution({ signals }) {
  const getSig = (key) => (signals && signals[key] !== undefined) ? signals[key] * 100 : 20;

  const data1 = [
    { subject: 'GAN', A: getSig('gan_artifact_score') },
    { subject: 'Spec', A: getSig('spectral_artifact_score') },
    { subject: 'Voc', A: Math.min(100, getSig('gan_artifact_score') * 1.2) },
    { subject: 'Noise', A: Math.min(100, getSig('spectral_artifact_score') * 0.8) },
  ];
  
  const data2 = [
    { subject: 'F0', A: getSig('f0_trajectory_score') },
    { subject: 'Rhythm', A: getSig('prosody_irregularity_score') },
    { subject: 'Jitter', A: Math.min(100, getSig('f0_trajectory_score') * 1.1) },
    { subject: 'Shimmer', A: Math.min(100, getSig('prosody_irregularity_score') * 0.9) },
  ];

  const data3 = [
    { subject: 'Phase', A: getSig('phase_coherence_score') },
    { subject: 'Coher', A: Math.min(100, getSig('phase_coherence_score') * 1.1) },
    { subject: 'Spec', A: getSig('spectral_artifact_score') },
    { subject: 'Flux', A: Math.min(100, getSig('spectral_artifact_score') * 0.9) },
  ];

  const data4 = [
    { subject: 'Liveness', A: getSig('liveness_score') },
    { subject: 'Identity', A: getSig('caller_identity_match_score') || 50 },
    { subject: 'Trust', A: getSig('caller_context_score') || 50 },
    { subject: 'Risk', A: getSig('transaction_context_score') || 50 },
  ];

  const ChartBox = ({ title, data }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, textAlign: 'center' }}>{title}</div>
      <div style={{ width: '100%', height: 150, display: 'flex', alignItems: 'center' }}>
        <ResponsiveContainer width="85%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: 'var(--text-secondary)' }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Score" dataKey="A" stroke="var(--accent-rust)" fill="var(--accent-peach)" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ width: '30%', display: 'flex', gap: 4, height: 80, alignItems: 'flex-end', justifyContent: 'center' }}>
           <div style={{ width: 8, height: '80%', background: 'var(--accent-rust)', borderRadius: 2 }}></div>
           <div style={{ width: 8, height: '40%', background: 'var(--border-glow)', borderRadius: 2 }}></div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>DEEP FEATURE ATTRIBUTION // SUB-SCORES</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>
      <div className="p-4 grid grid-cols-1 min-[400px]:grid-cols-2 gap-4 lg:gap-6 flex-1">
        <ChartBox title="1. Deep Fake / Artefacts" data={data1} />
        <ChartBox title="2. Prosody Irregularity" data={data2} />
        <ChartBox title="3. Phase / Spectral Anomalies" data={data3} />
        <ChartBox title="4. Context & Liveness" data={data4} />
      </div>
    </div>
  );
}
