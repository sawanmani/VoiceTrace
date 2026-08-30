import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Mic, ShieldCheck, Globe, Activity, Play, Terminal, Code, Cpu, 
  Lock, Zap, CheckCircle2, Layers, Server, ChevronDown, Plus 
} from 'lucide-react';
import AdvancedRiskGauge from '../components/AdvancedRiskGauge';
import RadarAttribution from '../components/RadarAttribution';
import AnimatedFeatures from '../components/AnimatedFeatures';

export default function Home() {
  const [liveness, setLiveness] = useState(98.5);
  const [probs, setProbs] = useState({ genuine: 0.98, spoof: 0.02, synthetic: 0.01, cloned: 0.01 });
  const [openFaq, setOpenFaq] = useState(0);

  // Simulate live incoming stream data for the preview
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveness(prev => {
        const next = prev + (Math.random() * 3 - 1.5);
        return Math.min(99.9, Math.max(88.0, next));
      });
      const spoofVar = Math.random() * 0.06;
      setProbs({
        genuine: 0.96 - spoofVar,
        spoof: spoofVar,
        synthetic: spoofVar * 0.4,
        cloned: spoofVar * 0.6
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const faqs = [
    { q: 'Does VoiceTrace send my audio to the cloud?', a: 'No. VoiceTrace is designed to be completely local and privacy-first. All audio stream processing, including AASIST-L inference, happens entirely on your machine.' },
    { q: 'What is the expected latency for live streams?', a: 'VoiceTrace operates with ultra-low latency, typically processing 200ms audio windows in under 15ms depending on your local hardware.' },
    { q: 'Which models are supported?', a: 'VoiceTrace natively supports AASIST-L for anti-spoofing and deepfake detection, and ECAPA-TDNN for speaker identity verification.' },
    { q: 'How do I integrate this into Twilio?', a: 'You can bridge Twilio media streams via WebSockets directly into the VoiceTrace server port. See the API docs for detailed Node.js integration examples.' }
  ];

  return (
    <div className="relative overflow-x-hidden flex flex-col font-sans bg-[var(--bg-base)] text-[var(--text-primary)]">
      
      {/* ── Ambient Glowing Orbs Background ── */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-theme-dark/20 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-1/4 -left-40 w-[600px] h-[600px] bg-amber-400/15 blur-[100px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-80 -right-20 w-[600px] h-[600px] bg-rose-400/15 blur-[120px] rounded-full pointer-events-none z-0" />

      {/* ── 1. Hero Section (Pro Max Redesign) ── */}
      <section className="relative z-10 pt-32 pb-24 px-6 flex flex-col items-center text-center">
        
        {/* Freestanding Floating Icon */}
        <div className="mb-8 w-40 h-40 md:w-48 md:h-48 animate-[fadeIn_0.5s_ease_both] flex items-center justify-center relative">
          <div className="absolute inset-0 bg-[#F4D2BB]/40 blur-3xl rounded-full mix-blend-multiply -z-10"></div>
          <img src="/mic-logo.png" alt="Vintage Mic Logo" className="w-full h-full object-contain drop-shadow-[0_25px_25px_rgba(92,52,37,0.4)] relative z-10 scale-125" />
        </div>

        {/* Sleek Subtitle Pill */}
        <div className="animate-[fadeIn_0.5s_ease_both] delay-100 mb-8 inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-[#5C3425]/10 bg-white/50 backdrop-blur-md shadow-sm">
          <div className="w-2 h-2 rounded-full bg-[#f97316] animate-pulse"></div>
          <span className="text-[11px] font-black tracking-[0.25em] uppercase text-[#5C3425]">
            The Open-Source AI Voice Shield
          </span>
        </div>

        {/* Massive Editorial Headline */}
        <h1 className="animate-[fadeIn_0.5s_ease_both] delay-200 text-6xl md:text-8xl lg:text-[110px] font-black leading-[1.05] tracking-tight mb-10 max-w-5xl text-[#5C3425] drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>
          Detect, <span className="italic font-medium text-[#5C3425]/70">analyze</span> <br className="hidden md:block"/> 
          and <span className="relative inline-block ml-3 px-6 py-1 md:py-2 mt-4 md:mt-0">
            <span className="relative z-10 text-[#5C3425]">protect.</span>
            {/* Sleek Rotated Pill Highlight */}
            <div className="absolute inset-0 bg-[#F4D2BB] rounded-2xl md:rounded-[2rem] rotate-[-3deg] hover:rotate-0 transition-transform duration-500 -z-10 shadow-xl shadow-[#F4D2BB]/40 border-2 border-white"></div>
          </span>
        </h1>

        {/* Description */}
        <p className="animate-[fadeIn_0.5s_ease_both] delay-300 text-lg md:text-2xl text-[#5C3425]/80 max-w-3xl mx-auto leading-relaxed font-medium mb-12">
          Detect deepfakes, analyze audio artifacts with AASIST-L, and protect your communications. A powerful local alternative running <strong className="font-black text-[#5C3425] border-b-2 border-[#F4D2BB]">entirely on your machine.</strong>
        </p>

        {/* CTA Buttons */}
        <div className="animate-[fadeIn_0.5s_ease_both] delay-500 flex flex-col sm:flex-row gap-4 sm:gap-6 w-full sm:w-auto justify-center mt-4">
          <Link to="/dashboard" className="group relative flex items-center justify-center px-10 py-5 bg-[#5C3425] hover:bg-[#4A291D] text-white rounded-2xl font-black text-[13px] tracking-[0.2em] uppercase transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(92,52,37,0.3)] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
            Launch Dashboard
          </Link>

          <a href="https://github.com/sawanmani/VoiceTrace" target="_blank" rel="noreferrer" className="group flex items-center justify-center gap-3 px-10 py-5 bg-white backdrop-blur-md border border-[#5C3425]/10 text-[#5C3425] rounded-2xl font-bold text-[13px] tracking-wider transition-all duration-300 hover:shadow-[0_10px_30px_rgba(92,52,37,0.1)]">
            <Terminal size={18} className="text-[#5C3425] group-hover:scale-110 transition-transform" /> API Documentation
          </a>
        </div>
      </section>

      {/* ── 2. Massive Dashboard Mockup ── */}
      <section className="relative z-10 px-6 pb-32 max-w-6xl mx-auto">
        <div className="w-full rounded-3xl bg-white/40 backdrop-blur-2xl border border-white/60 p-2 shadow-2xl shadow-theme-dark/15 animate-[fadeIn_0.5s_ease_both] delay-700 relative overflow-hidden group">
          <div className="bg-white/80 rounded-2xl overflow-hidden border border-white flex flex-col">
            
            {/* Mac OS Window Controls */}
            <div className="h-12 border-b border-theme-dark/10 flex items-center px-4 bg-gradient-to-b from-white to-[#FDFBF9]">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="flex-1 text-center text-[10px] font-bold text-theme-dark/40 tracking-[0.15em] flex items-center justify-center gap-2">
                <Play size={10} className="fill-theme-dark/30" /> LIVE DEMO
              </div>
            </div>
            
            {/* Dashboard Components Preview */}
            <div className="flex flex-col lg:flex-row bg-[#FDFBF9] p-6 gap-6">
              <div className="flex-[1.2] bg-white border border-theme-dark/5 rounded-xl p-4 shadow-sm">
                <AdvancedRiskGauge score={14} liveness={liveness} />
              </div>
              <div className="flex-1 bg-white border border-theme-dark/5 rounded-xl p-4 shadow-sm">
                <RadarAttribution probabilities={probs} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Core Features Grid (Animated) ── */}
      <AnimatedFeatures />

      {/* ── 4. Developer API Snippet ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-4 drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>Integrate with 3 lines of code.</h2>
          <p className="text-theme-dark/70">REST APIs and WebSockets ready for your telephony bridge.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          
          {/* Code Editor Mock - Light Glassmorphic Theme */}
          <div className="rounded-2xl overflow-hidden border border-white bg-white/40 backdrop-blur-xl shadow-2xl shadow-theme-dark/10 group hover:shadow-[0_20px_40px_rgba(234,88,12,0.1)] transition-all duration-500">
            {/* Mac OS Header */}
            <div className="h-12 border-b border-theme-dark/10 flex items-center px-4 bg-gradient-to-b from-white/80 to-white/40 gap-4">
               <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400/80 shadow-sm"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400/80 shadow-sm"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400/80 shadow-sm"></div>
               </div>
               <div className="text-xs font-mono font-semibold tracking-wide text-theme-dark/70 flex-1 text-center pr-8">api_request.py</div>
            </div>
            {/* Code Body */}
            <div className="p-8 font-mono text-sm leading-relaxed overflow-x-auto bg-white/30 text-theme-dark selection:bg-theme-surface">
              <span className="text-rose-600 font-semibold">import</span> requests<br/><br/>
              url = <span className="text-theme-dark">"http://localhost:8000/api/analyze"</span><br/>
              audio = <span className="text-orange-800 font-semibold">open</span>(<span className="text-theme-dark">"stream.wav"</span>, <span className="text-theme-dark">"rb"</span>)<br/><br/>
              response = requests.<span className="text-orange-800 font-semibold">post</span>(<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;url,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;files=&#123;<span className="text-theme-dark">"file"</span>: audio&#125;<br/>
              )<br/><br/>
              <span className="text-rose-600 font-semibold">print</span>(response.json())
            </div>
          </div>

          {/* JSON Response Mock - Light Glassmorphic Theme */}
          <div className="rounded-2xl overflow-hidden border border-white bg-white/40 backdrop-blur-xl shadow-2xl shadow-theme-dark/10 group hover:shadow-[0_20px_40px_rgba(234,88,12,0.1)] transition-all duration-500">
            {/* Mac OS Header */}
            <div className="h-12 border-b border-theme-dark/10 flex items-center px-4 bg-gradient-to-b from-white/80 to-white/40 gap-4">
               <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-400/80 shadow-sm"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400/80 shadow-sm"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400/80 shadow-sm"></div>
               </div>
               <div className="text-xs font-mono font-semibold tracking-wide text-theme-dark/70 flex-1 text-center pr-8">response.json</div>
            </div>
            {/* Code Body */}
            <div className="p-8 font-mono text-sm leading-relaxed overflow-x-auto bg-white/30 text-theme-dark selection:bg-theme-surface">
              &#123;<br/>
              &nbsp;&nbsp;<span className="text-orange-800 font-medium">"status"</span>: <span className="text-theme-dark">"success"</span>,<br/>
              &nbsp;&nbsp;<span className="text-orange-800 font-medium">"risk_score"</span>: <span className="text-rose-600 font-bold">8.4</span>,<br/>
              &nbsp;&nbsp;<span className="text-orange-800 font-medium">"band"</span>: <span className="text-theme-dark">"low"</span>,<br/>
              &nbsp;&nbsp;<span className="text-orange-800 font-medium">"signals"</span>: &#123;<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-orange-800 font-medium">"liveness"</span>: <span className="text-rose-600 font-bold">0.985</span>,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-orange-800 font-medium">"deepfake_prob"</span>: <span className="text-rose-600 font-bold">0.021</span><br/>
              &nbsp;&nbsp;&#125;,<br/>
              &nbsp;&nbsp;<span className="text-orange-800 font-medium">"action"</span>: <span className="text-emerald-600 font-bold">"ALLOW"</span><br/>
              &#125;
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. How it Works Pipeline ── */}
      <section className="py-32 px-6 max-w-5xl mx-auto border-t border-[#5C3425]/5">
         <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-4 drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>
            Inference Pipeline
          </h2>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative">
           
           {/* Elegant Connecting Line */}
           <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#5C3425]/30 to-transparent hidden md:block -z-10 -translate-y-6"></div>
           
           {[
             { icon: Mic, label: 'Audio Stream Input' },
             { icon: Cpu, label: 'AASIST-L Extraction' },
             { icon: Activity, label: 'Risk Scoring' },
             { icon: ShieldCheck, label: 'Telemetry Output' }
           ].map((step, i) => (
             <div key={i} className="flex flex-col items-center bg-[#fdfaf6] px-4 group">
                <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(244,210,187,0.8)] border border-white group-hover:scale-110 transition-transform duration-500 text-[#5C3425]">
                  <step.icon size={28} strokeWidth={2} />
                </div>
                <div className="text-[13px] tracking-wide font-black text-[#5C3425] text-center uppercase">{step.label}</div>
             </div>
           ))}
        </div>
      </section>

      {/* ── 5.5 Video Clips & GIFs (See it in Action) ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto border-t border-theme-dark/5">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-4 drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>See it in action.</h2>
          <p className="text-theme-dark/70">Watch VoiceTrace detect state-of-the-art voice clones in real-time.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { id: 'sisnzgc73zc', title: 'Presidential Deepfake Detection', tag: 'High Risk', thumb: '/tutorials/sisnzgc73zc.jpg' },
            { id: 'woQe90k7g3c', title: 'Banking Voice Auth Bypass', tag: 'High Risk', thumb: '/tutorials/woQe90k7g3c.jpg' },
            { id: 'kqxqjRsdD5E', title: 'Customer Support Scams', tag: 'Medium Risk', thumb: '/tutorials/kqxqjRsdD5E.jpg' },
            { id: 'RRRBxNXgeKQ', title: 'AASIST-L Efficacy Testing', tag: 'Low Risk', thumb: '/tutorials/RRRBxNXgeKQ.jpg' },
            { id: 'PyMx4L9mky4', title: 'Multilingual Artifact Analysis', tag: 'Medium Risk', thumb: '/tutorials/PyMx4L9mky4.jpg' },
            { id: '05YBqrWTLQ0', title: 'Live Latency Benchmark', tag: 'Low Risk', thumb: '/tutorials/05YBqrWTLQ0.jpg' }
          ].map((clip, i) => (
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

      {/* ── 6. Integrations & Use Cases ── */}
      <section className="py-32 px-6 max-w-6xl mx-auto border-t border-[#5C3425]/5 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[300px] bg-[#F4D2BB]/20 blur-[100px] rounded-full pointer-events-none -z-10" />
        
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-6 drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>
            Works seamlessly <span className="italic font-medium text-[#5C3425]/70">with your stack.</span>
          </h2>
        </div>
        
        <div className="flex flex-wrap justify-center gap-6">
           {['TWILIO', 'WebRTC', 'SIP.js', 'ASTERISK'].map((tech) => (
             <div key={tech} className="group relative cursor-default">
                {/* Glowing border effect on hover */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#F4D2BB] to-[#5C3425] rounded-3xl opacity-0 group-hover:opacity-40 blur transition duration-500"></div>
                <div className="relative flex items-center justify-center text-xl md:text-2xl font-black tracking-[0.2em] bg-white/80 backdrop-blur-md px-12 py-6 rounded-[1.25rem] border border-white text-[#5C3425] shadow-xl shadow-[#5C3425]/5 group-hover:-translate-y-1 transition-all duration-500">
                   {tech}
                </div>
             </div>
           ))}
        </div>
      </section>

      {/* ── 7. FAQ ── */}
      <section className="py-24 px-6 max-w-3xl mx-auto border-t border-theme-dark/5">
        <h2 className="text-4xl md:text-5xl font-black text-[#5C3425] mb-12 text-center drop-shadow-sm" style={{ fontFamily: '"Playfair Display", serif' }}>Questions & Answers</h2>
        <div className="flex flex-col gap-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white border border-[#5C3425]/10 rounded-2xl overflow-hidden shadow-sm cursor-pointer hover:shadow-lg transition-all duration-300" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
              <div className="p-6 flex items-center justify-between">
                 <div className="font-bold text-theme-dark">{faq.q}</div>
                 <Plus size={20} className={`text-theme-dark transition-transform ${openFaq === i ? 'rotate-45' : ''}`} />
              </div>
              {openFaq === i && (
                <div className="px-6 pb-6 text-theme-dark/70 text-sm leading-relaxed border-t border-theme-dark/5 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 8. Bottom CTA (Pro Max Dark Card) ── */}
      <section className="py-32 px-6 max-w-6xl mx-auto relative">
        <div className="relative rounded-[3rem] overflow-hidden bg-gradient-to-br from-[#5C3425] to-[#3A1F15] px-8 py-24 md:py-32 text-center shadow-2xl shadow-[#5C3425]/20 border border-[#F4D2BB]/20 group">
          {/* Decorative glow inside the card */}
          <div className="absolute -top-1/2 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#F4D2BB]/10 blur-[100px] rounded-full pointer-events-none transition-transform duration-1000 group-hover:scale-110" />
          
          <h2 className="text-5xl md:text-7xl font-black text-white mb-8 relative z-10 tracking-tight leading-tight" style={{ fontFamily: '"Playfair Display", serif' }}>
            API is <span className="text-[#F4D2BB]">live now.</span>
          </h2>
          <p className="text-[#F3EAE1]/80 text-lg md:text-xl mb-12 relative z-10 max-w-2xl mx-auto font-medium">
            Start securing your voice channels against deepfakes today. Integrate our ultra-low latency engine with just a few lines of code.
          </p>
          
          <Link to="/dashboard" className="relative z-10 inline-block px-12 py-6 rounded-2xl bg-[#F4D2BB] hover:bg-white text-[#5C3425] font-black tracking-[0.2em] hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(244,210,187,0.2)] transition-all uppercase text-sm">
            Launch Dashboard
          </Link>
        </div>
      </section>

      {/* ── 9. Pro Max Footer ── */}
      <footer className="pt-24 pb-12 px-6 border-t border-theme-dark/10 bg-gradient-to-b from-transparent to-theme-bg/50">
         <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
            
            {/* Brand Column */}
            <div className="lg:col-span-2">
               <div className="flex items-center gap-3 mb-6">
                 <div className="w-11 h-11 rounded-full overflow-hidden shadow-lg shadow-[#5C3425]/20 border-2 border-[#5C3425]">
                   <img src="/custom-logo.jpg" alt="VoiceTrace Custom Logo" className="w-full h-full object-cover" />
                 </div>
                 <span className="font-bold text-xl text-theme-dark tracking-tight">VoiceTrace</span>
               </div>
               <p className="text-theme-dark/70 text-sm leading-relaxed max-w-sm mb-6">
                 The open-source AI voice shield. Detect deepfakes, analyze audio artifacts with AASIST-L, and protect your communications locally.
               </p>
               <div className="flex gap-4">
                 <a href="#" className="w-10 h-10 rounded-full bg-white border border-theme-dark/10 flex items-center justify-center text-theme-dark hover:text-theme-dark hover:shadow-md transition-all">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
                 </a>
                 <a href="https://github.com/sawanmani/VoiceTrace" className="w-10 h-10 rounded-full bg-white border border-theme-dark/10 flex items-center justify-center text-theme-dark hover:text-theme-dark hover:shadow-md transition-all">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                 </a>
               </div>
            </div>

            {/* Links Columns */}
            <div>
              <h4 className="font-bold text-theme-dark mb-6">Product</h4>
              <ul className="space-y-4 text-sm text-theme-dark/70">
                <li><a href="#" className="hover:text-theme-dark transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-theme-dark mb-6">Developers</h4>
              <ul className="space-y-4 text-sm text-theme-dark/70">
                <li><a href="#" className="hover:text-theme-dark transition-colors">API Documentation</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">SDKs & Libraries</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Webhooks</a></li>
                <li><a href="https://github.com/sawanmani/VoiceTrace" className="hover:text-theme-dark transition-colors">GitHub Repository</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-theme-dark mb-6">Legal</h4>
              <ul className="space-y-4 text-sm text-theme-dark/70">
                <li><a href="#" className="hover:text-theme-dark transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Cookie Policy</a></li>
                <li><a href="#" className="hover:text-theme-dark transition-colors">Security</a></li>
              </ul>
            </div>
         </div>
         
         <div className="max-w-6xl mx-auto pt-8 border-t border-[#5C3425]/10 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
           <div className="text-sm text-[#5C3425]/60 font-medium">
             VoiceTrace © {new Date().getFullYear()} - Open Source AI Voice Shield.
           </div>
           <div className="flex items-center gap-2 text-sm text-[#5C3425]/60">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> All systems operational
           </div>
         </div>
      </footer>
    </div>
  )
}
