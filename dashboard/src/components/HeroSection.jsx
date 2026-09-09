import { Link } from 'react-router-dom';
import { Terminal } from 'lucide-react';

export default function HeroSection() {
  return (
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
  );
}
