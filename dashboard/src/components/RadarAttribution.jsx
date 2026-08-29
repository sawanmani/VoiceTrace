import { MoreHorizontal } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

export default function RadarAttribution({ probabilities }) {
  // Use probabilities to dynamically shift the radar graphs to simulate real-time analysis
  const spoofVal = probabilities?.spoof ? probabilities.spoof * 150 : 30;
  const genVal = probabilities?.genuine ? probabilities.genuine * 100 : 80;

  const data1 = [
    { subject: 'PO', A: spoofVal },
    { subject: 'P1', A: spoofVal * 0.8 },
    { subject: 'Pood', A: genVal },
    { subject: 'Pow', A: genVal * 1.2 },
  ];
  
  const data2 = [
    { subject: 'Freq', A: spoofVal * 1.1 },
    { subject: 'Phase', A: genVal * 0.5 },
    { subject: 'Amp', A: spoofVal * 0.6 },
    { subject: 'Pitch', A: genVal },
  ];

  const ChartBox = ({ title, data }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center' }}>
        <ResponsiveContainer width="70%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: 'var(--text-secondary)' }} />
            <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
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
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', flex: 1 }}>
        <ChartBox title="1. Codec Degradation Signature (PO)" data={data1} />
        <ChartBox title="2. Passive Liveness (2CR/Clipping)" data={data2} />
        <ChartBox title="3. Spectral/Prosody Anomalies" data={data1} />
        <ChartBox title="4. Caller Identity Match (P1)" data={data2} />
      </div>
    </div>
  );
}
