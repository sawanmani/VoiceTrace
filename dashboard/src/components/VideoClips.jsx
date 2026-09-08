import { Play } from 'lucide-react';

export default function VideoClips() {
  const clips = [
    { id: 'sisnzgc73zc', title: 'Presidential Deepfake Detection', tag: 'High Risk', thumb: '/tutorials/presidential-deepfake.jpg' },
    { id: 'woQe90k7g3c', title: 'Banking Voice Auth Bypass', tag: 'High Risk', thumb: '/tutorials/banking-voice-bypass.jpg' },
    { id: 'kqxqjRsdD5E', title: 'Customer Support Scams', tag: 'Medium Risk', thumb: '/tutorials/customer-support-scam.jpg' },
    { id: 'RRRBxNXgeKQ', title: 'AASIST-L Efficacy Testing', tag: 'Low Risk', thumb: '/tutorials/aasist-efficacy.jpg' },
    { id: 'PyMx4L9mky4', title: 'Multilingual Artifact Analysis', tag: 'Medium Risk', thumb: '/tutorials/multilingual-analysis.jpg' },
    { id: '05YBqrWTLQ0', title: 'Live Latency Benchmark', tag: 'Low Risk', thumb: '/tutorials/latency-benchmark.jpg' }
  ];

  return (
    <section className="py-24 px-6 max-w-6xl mx-auto border-t border-theme-dark/5">
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-4 drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>See it in action.</h2>
        <p className="text-theme-dark/70">Watch VoiceTrace detect state-of-the-art voice clones in real-time.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {clips.map((clip, i) => (
          <a href={`https://www.youtube.com/watch?v=${clip.id}`} target="_blank" rel="noreferrer" key={i} className="group relative rounded-2xl overflow-hidden bg-white/50 backdrop-blur-md border border-white shadow-lg shadow-theme-dark/5 cursor-pointer hover:border-theme-surface transition-all block">
            <div className="aspect-video relative overflow-hidden bg-theme-bg">
              <img src={clip.thumb} alt={clip.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#432C1F]/60 via-transparent to-transparent opacity-80" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-theme-dark shadow-xl border border-white/50 group-hover:scale-110 group-hover:bg-theme-dark group-hover:text-white transition-all duration-300">
                  <Play fill="currentColor" className="ml-1" size={20} />
                </div>
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-1 rounded bg-black/60 backdrop-blur-md px-2 py-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                <span className="text-[9px] font-bold text-white uppercase tracking-wider">YouTube</span>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="font-bold text-theme-dark text-sm leading-tight line-clamp-2 group-hover:text-theme-dark transition-colors">{clip.title}</h3>
              </div>
              <div className="flex justify-between items-center mt-3">
                <p className="text-theme-dark/70 text-xs font-medium">Community Demo</p>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${clip.tag.includes('High') ? 'bg-rose-100 text-rose-600' : clip.tag.includes('Medium') ? 'bg-theme-surface text-theme-dark' : 'bg-green-100 text-green-700'}`}>
                  {clip.tag}
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
