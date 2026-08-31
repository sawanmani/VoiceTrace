import Sidebar from '../components/Sidebar';
import { FileText, Download, Filter } from 'lucide-react';
import { useStore } from '../store/useStore';

/**
 * Download a report as a JSON file — client-side, no backend round-trip.
 * Uses URL.createObjectURL so it works even without the server running.
 */
function downloadReport(report) {
  const payload = JSON.stringify(report, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.id}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const state = useStore();
  
  // Transform recent calls into reports, plus a placeholder if empty
  const reports = state.recentCalls.map((call) => ({
    id: `REP-${call.call_id}`,
    date: call.time,
    type: call.peak_risk > 80 ? 'Incident Export' : 'Standard Audit',
    status: 'Generated',
    // Full data embedded for download
    call_id: call.call_id,
    peak_risk: call.peak_risk,
    band: call.band,
    windows: call.windows,
    duration_sec: call.duration_sec,
  }));

  if (reports.length === 0) {
    reports.push({ id: 'REP-SYS-01', date: 'Just now', type: 'System Boot Audit', status: 'Generated' });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileText size={32} color="var(--accent-peach)" />
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Reports &amp; Logs</h1>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Filter size={16} /> Filter Date Range
            </button>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>REPORT ID</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>DATE</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>TYPE</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>STATUS</th>
                  <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((rep, i) => (
                  <tr key={rep.id + i} style={{ borderBottom: i === reports.length - 1 ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '16px 24px', fontSize: 14, fontWeight: 600 }}>{rep.id}</td>
                    <td style={{ padding: '16px 24px', fontSize: 14 }}>{rep.date}</td>
                    <td style={{ padding: '16px 24px', fontSize: 14 }}>{rep.type}</td>
                    <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 600, color: rep.status === 'Generated' ? 'var(--accent-green)' : 'var(--text-muted)' }}>{rep.status}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button
                        onClick={() => downloadReport(rep)}
                        disabled={rep.status !== 'Generated'}
                        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: rep.status === 'Generated' ? 'pointer' : 'not-allowed', opacity: rep.status === 'Generated' ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Download size={14} /> Download JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}
