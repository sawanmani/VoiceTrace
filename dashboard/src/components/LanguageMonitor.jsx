import { MoreHorizontal } from 'lucide-react';

export default function LanguageMonitor() {
  const data = [
    { name: 'HINDI', value: 100, flag: '🇮🇳' },
    { name: 'INDIA', value: 91, flag: '🇮🇳' },
    { name: 'PRIA', value: 60, flag: '🇶🇦' },
    { name: 'BRAZIL', value: 55, flag: '🇧🇷' },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>MULTILINGUAL adaptation monitor</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>LANGUAGE DETECTION: HINDI (Verified)</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>[cite: Regional Accents: NCRTH]</div>
        </div>

        {data.map(item => (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 16 }}>{item.flag}</div>
            <div style={{ width: 60, fontSize: 12, fontWeight: 700 }}>{item.name}</div>
            <div style={{ flex: 1, background: 'var(--border-glow)', height: 6, borderRadius: 3, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${item.value}%`, background: 'var(--accent-rust)', borderRadius: 3 }}></div>
            </div>
            <div style={{ width: 40, textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{item.value}%</div>
          </div>
        ))}

      </div>
    </div>
  );
}
