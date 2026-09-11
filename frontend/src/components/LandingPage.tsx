import React, { useState, useRef, useEffect } from 'react';

interface LandingPageProps {
  onLaunchConsole: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchConsole }) => {
  // Hero 3D Perspective Tracking
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [tiltMode, setTiltMode] = useState<'hero' | 'isometric' | 'front'>('hero');
  const [activeLayer, setActiveLayer] = useState<'thermal' | 'vectors' | 'evac'>('thermal');
  const [inspectedZone, setInspectedZone] = useState<number>(3);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [demoRequested, setDemoRequested] = useState(false);

  // Interactive Particle Simulation State
  const [simStatus, setSimStatus] = useState<'nominal' | 'bottleneck' | 'diverted'>('nominal');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Calculator State
  const [venueCapacity, setVenueCapacity] = useState<number>(75000);
  const [cctvCount, setCctvCount] = useState<number>(32);
  const [marshalCount, setMarshalCount] = useState<number>(24);

  // Active Hardware Teardown Hotspot
  const [activeHotspot, setActiveHotspot] = useState<'lens' | 'cpu' | 'audio'>('lens');

  // Scroll Tracking for Continuous 3D Motion
  const [scrollY, setScrollY] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<'hero' | 'hologram' | 'simulation' | 'hardware' | 'calculator'>('hero');
  const [heroActiveCam, setHeroActiveCam] = useState<number>(3);
  const [heroPlayingAudio, setHeroPlayingAudio] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Track global scroll position for 3D motion parallax
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const sy = window.scrollY;
          setScrollY(sy);

          if (sy < 800) setActiveSection('hero');
          else if (sy < 1700) setActiveSection('hologram');
          else if (sy < 2600) setActiveSection('simulation');
          else if (sy < 3500) setActiveSection('hardware');
          else setActiveSection('calculator');

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const getConsoleTransform = () => {
    if (tiltMode === 'front') return 'rotateX(0deg) rotateY(0deg) scale(0.98)';
    if (tiltMode === 'isometric') return 'rotateX(24deg) rotateY(-14deg) rotateZ(3deg) scale(0.92)';
    
    // Dynamic continuous 3D motion: console translates into depth on scroll
    const scrollSink = Math.min(24, scrollY * 0.035);
    const scrollZ = Math.min(350, scrollY * 0.45);
    const rotX = 14 + scrollSink - mousePos.y * 18;
    const rotY = mousePos.x * 20;
    return `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(-${scrollZ}px) scale(${isHovered ? 0.97 : 0.95})`;
  };

  // Play Hero Voice Broadcast directly
  const handlePlayHeroVoice = async () => {
    setHeroPlayingAudio(true);
    try {
      const res = await fetch('/api/demo/trigger-alert', { method: 'POST' });
      const data = await res.json();
      if (data.audio_url) {
        const audio = new Audio(data.audio_url);
        audio.onended = () => setHeroPlayingAudio(false);
        audio.play().catch(() => setHeroPlayingAudio(false));
      } else {
        setTimeout(() => setHeroPlayingAudio(false), 4000);
      }
    } catch {
      setTimeout(() => setHeroPlayingAudio(false), 3000);
    }
  };

  // Calculator outputs
  const leadTimeSeconds = Math.round(180 + (cctvCount * 7.5) + (marshalCount * 4));
  const leadTimeFormatted = `${Math.floor(leadTimeSeconds / 60)}m ${leadTimeSeconds % 60}s`;
  const riskReduction = Math.min(94, Math.round(55 + (cctvCount * 0.7) + (marshalCount * 0.5)));
  const throughput = Math.round((venueCapacity * 0.04) + marshalCount * 65);

  // Real-time Particle Flow Simulation (Throttled to 24fps, pauses when offscreen or hidden)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isVisible = false;

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? false;
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);

    const width = canvas.width;
    const height = canvas.height;

    // Create 75 crowd particles (lightweight & fluid)
    const particles = Array.from({ length: 75 }, () => ({
      x: Math.random() * (width * 0.4),
      y: 80 + Math.random() * (height - 160),
      vx: 1.2 + Math.random() * 0.8,
      vy: (Math.random() - 0.5) * 0.4,
      radius: 2.2 + Math.random() * 1.2,
    }));

    let lastTime = performance.now();
    const frameInterval = 1000 / 24; // 24 FPS throttle

    const render = (now: number) => {
      if (!isVisible || document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }

      const elapsed = now - lastTime;
      if (elapsed >= frameInterval) {
        lastTime = now - (elapsed % frameInterval);

        ctx.clearRect(0, 0, width, height);

        // Draw Corridor Walls
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        // Main corridor
        ctx.beginPath();
        ctx.moveTo(20, 60);
        ctx.lineTo(width * 0.45, 60);
        ctx.lineTo(width * 0.55, 90);
        ctx.lineTo(width - 20, 90);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(20, height - 60);
        ctx.lineTo(width * 0.45, height - 60);
        ctx.lineTo(width * 0.55, height - 90);
        ctx.lineTo(width - 20, height - 90);
        ctx.stroke();

        // Diversion Gate (Side Passage)
        ctx.strokeStyle = simStatus === 'diverted' ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(width * 0.5, height - 75);
        ctx.lineTo(width * 0.75, height - 15);
        ctx.lineTo(width - 20, height - 15);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bottleneck Zone Highlight (Center)
        const isCritical = simStatus === 'bottleneck';
        ctx.fillStyle = isCritical ? 'rgba(244, 63, 94, 0.18)' : 'rgba(0, 229, 255, 0.06)';
        ctx.fillRect(width * 0.48, 80, width * 0.2, height - 160);

        ctx.strokeStyle = isCritical ? 'rgba(244, 63, 94, 0.8)' : 'rgba(0, 229, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(width * 0.48, 80, width * 0.2, height - 160);

        // Update & Draw Particles (without costly per-particle shadowBlur)
        particles.forEach((p) => {
          // Normal flow vs bottleneck slowdown
          if (p.x > width * 0.48 && p.x < width * 0.68) {
            if (simStatus === 'bottleneck') {
              p.vx = 0.15;
            } else if (simStatus === 'diverted') {
              if (p.y > height * 0.45) {
                p.vy = 1.0;
              }
              p.vx = 1.8;
            } else {
              p.vx = 1.4;
            }
          } else {
            p.vx = 1.4 + Math.random() * 0.4;
          }

          p.x += p.vx;
          p.y += p.vy;

          if (p.x > width) {
            p.x = 20;
            p.y = 80 + Math.random() * (height - 160);
          }

          let pColor = '#00e5ff';
          if (simStatus === 'bottleneck' && p.x > width * 0.45 && p.x < width * 0.7) {
            pColor = '#f43f5e';
          } else if (simStatus === 'diverted' && p.y > height * 0.5) {
            pColor = '#10b981';
          }

          ctx.fillStyle = pColor;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, [simStatus]);

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black overflow-x-hidden relative">
      
      {/* ========================================================================= */}
      {/* FLOATING 3D SCI-FI WAYPOINT HUD (Right Edge Navigation) */}
      {/* ========================================================================= */}
      <aside className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col items-end gap-2 pointer-events-auto">
        <div className="p-2 rounded-2xl bg-[#090F1E]/90 border border-cyan-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-1.5 text-[10px] font-mono">
          {[
            { id: 'hero', label: '01 · 3D COCKPIT', href: '#hero' },
            { id: 'hologram', label: '02 · SPATIAL HOLOGRAM', href: '#hologram' },
            { id: 'simulation', label: '03 · FLUID PHYSICS', href: '#simulation' },
            { id: 'hardware', label: '04 · EDGE HARDWARE', href: '#hardware' },
            { id: 'calculator', label: '05 · ROI CALCULATOR', href: '#calculator' },
          ].map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                activeSection === item.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-lg shadow-cyan-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  activeSection === item.id ? 'bg-cyan-400 scale-125 shadow-[0_0_8px_#00e5ff]' : 'bg-slate-600'
                }`}
              />
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* LUMINOUS NEON CYAN SPINE RAIL (Continuous Scroll Progress Indicator) */}
      {/* ========================================================================= */}
      <div className="fixed left-6 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent z-40 hidden 2xl:block pointer-events-none">
        <div
          className="w-[2px] -ml-[0.5px] bg-cyan-400 shadow-[0_0_12px_#00e5ff] rounded-full transition-all duration-100"
          style={{
            height: `${Math.min(100, Math.max(2, (scrollY / 3600) * 100))}%`,
          }}
        />
      </div>

      {/* ========================================================================= */}
      {/* 1. HERO SECTION WITH AERIAL TEMPLE CROWD CITY BACKGROUND (Continuous 3D Space) */}
      {/* ========================================================================= */}
      <div id="hero" className="relative overflow-hidden">
        {/* Full-bleed Aerial Temple City Night Crowd Background Image */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <img
            src="/images/temple_crowd_aerial.jpg"
            alt="Aerial view of illuminated temple complex and massive night crowd"
            className="w-full h-full object-cover object-center filter brightness-[0.70] contrast-[1.12] scale-105"
          />
          {/* Atmospheric gradient vignettes to ensure extreme contrast and seamless continuum */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#070B14]/85 via-[#070B14]/45 to-[#060913]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070B14]/75 via-transparent to-[#070B14]/75" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[650px] bg-cyan-500/15 blur-[150px] pointer-events-none rounded-full" />
        </div>

        {/* TOP NAVBAR (Glassy Translucent over Aerial Background) */}
        <header className="relative z-50 border-b border-white/10 backdrop-blur-md bg-[#070B14]/40 sticky top-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            {/* Brand Logo */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-400 p-[1.5px] shadow-lg shadow-cyan-500/30">
                <div className="w-full h-full bg-[#080D1A] rounded-[10px] flex items-center justify-center">
                  <svg className="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12c2.5-3 5.5-3 8 0s5.5 3 8 0" />
                    <path d="M2 7c2.5-3 5.5-3 8 0s5.5 3 8 0" />
                    <path d="M2 17c2.5-3 5.5-3 8 0s5.5 3 8 0" />
                  </svg>
                </div>
              </div>
              <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1">
                Pravah<span className="text-cyan-400">AI</span>
                <span className="text-[10px] font-mono font-normal uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 ml-1">
                  प्रवाही
                </span>
              </span>
            </div>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
              <a href="#features" className="hover:text-cyan-400 transition-colors">Features</a>
              <a href="#hologram" className="hover:text-cyan-400 transition-colors">3D Hologram</a>
              <a href="#simulation" className="hover:text-cyan-400 transition-colors">Live Simulation</a>
              <a href="#hardware" className="hover:text-cyan-400 transition-colors">Edge Optics</a>
              <a href="#calculator" className="hover:text-cyan-400 transition-colors">Impact Calculator</a>
            </nav>

            {/* Action CTAs */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsModalOpen(true)}
                className="hidden sm:inline-flex items-center px-4 py-2 rounded-full border border-cyan-500/40 text-cyan-300 bg-cyan-950/30 hover:bg-cyan-900/50 text-sm font-semibold transition-all hover:border-cyan-400 shadow-sm"
              >
                Book a Demo
              </button>
              <button
                onClick={onLaunchConsole}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/30 hover:shadow-cyan-400/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-950"></span>
                </span>
                Live Command Center
              </button>
            </div>
          </div>
        </header>

        {/* HERO CONTENT */}
        <section className="relative pt-12 pb-24 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            
            {/* Trust Pill Badge */}
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-md mb-8 shadow-xl text-xs font-medium text-slate-300">
              <span className="text-cyan-400 flex items-center gap-1.5 font-semibold">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Trusted by
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="flex items-center gap-1.5">🏛️ Temple Trusts</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="flex items-center gap-1.5">🚆 Indian Railways</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="flex items-center gap-1.5">🎪 Event Authorities</span>
            </div>

            {/* Main Hero Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.08] mb-6">
              Predict crowd crushes{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(0,229,255,0.4)]">
                before they happen.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal mb-9 leading-relaxed">
              Plug into your existing CCTV. Get a countdown to danger, real-time Farneback surge physics, and automated Hindi walkie-talkie dispatch.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 font-extrabold text-base shadow-xl shadow-cyan-500/25 hover:shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all"
              >
                Book a Demo
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>

              <button
                onClick={onLaunchConsole}
                className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-white font-bold text-base shadow-xl backdrop-blur-md hover:scale-105 active:scale-95 transition-all"
              >
                <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
                Watch how it works
              </button>
            </div>

            {/* 3D Perspective Tilt Controls */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-xs uppercase tracking-widest text-slate-500 font-mono mr-2">3D Perspective:</span>
              <button
                onClick={() => setTiltMode('hero')}
                className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                  tiltMode === 'hero' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Hero Tilt (Interactive)
              </button>
              <button
                onClick={() => setTiltMode('isometric')}
                className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                  tiltMode === 'isometric' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Isometric 3D
              </button>
              <button
                onClick={() => setTiltMode('front')}
                className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                  tiltMode === 'front' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Flat Frontal
              </button>
            </div>

            {/* 3D FLOATING CONSOLE (Exact Match to Reference Screenshot) */}
            <div
              ref={containerRef}
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
                setMousePos({ x: 0, y: 0 });
              }}
              className="relative max-w-6xl mx-auto preserve-3d transition-transform duration-300 ease-out cursor-pointer"
              style={{ transform: getConsoleTransform() }}
            >
              {/* Outer Neon Glow Bezel */}
              <div className="absolute -inset-1.5 rounded-[28px] bg-gradient-to-b from-cyan-500/40 via-cyan-900/10 to-rose-600/30 blur-xl opacity-70 pointer-events-none" />

              {/* Floating Orbiting 3D Chips */}
              <div className="hidden lg:block absolute -top-8 -left-12 z-30 animate-float-slow">
                <div className="px-4 py-2.5 rounded-xl bg-[#0A0F1D]/90 border border-cyan-500/60 shadow-xl shadow-cyan-950/80 backdrop-blur-xl flex items-center gap-2.5 text-xs font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-white font-bold">+8.5 Min</span>
                  <span className="text-slate-400">Early Warning Lead Time</span>
                </div>
              </div>

              <div className="hidden lg:block absolute -bottom-6 -right-10 z-30 animate-float-slow" style={{ animationDelay: '2s' }}>
                <div className="px-4 py-2.5 rounded-xl bg-[#0A0F1D]/90 border border-rose-500/60 shadow-xl shadow-rose-950/80 backdrop-blur-xl flex items-center gap-2.5 text-xs font-mono">
                  <span className="text-rose-400">📢</span>
                  <span className="text-white font-bold">Hindi Marshal Dispatch</span>
                  <span className="text-cyan-400">(Sarvam AI)</span>
                </div>
              </div>

              {/* MAIN FLOATING COMMAND CONSOLE */}
              <div className="relative rounded-2xl border border-cyan-500/40 bg-[#0A0E1A] shadow-[0_30px_100px_rgba(0,0,0,0.9)] overflow-hidden text-left">
                
                {/* Console Chrome Header */}
                <div className="bg-[#080D18] border-b border-cyan-950/80 px-4 py-3 flex items-center justify-between text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="text-slate-200 font-semibold flex items-center gap-2 ml-2">
                      Live Crowd Monitoring
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80 text-[10px] font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    {/* Interactive Camera Switcher */}
                    <div className="hidden sm:flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 font-mono text-[10px]">
                      {[1, 2, 3, 4, 5, 6].map((num) => (
                        <button
                          key={num}
                          onClick={() => setHeroActiveCam(num)}
                          className={`px-2 py-0.5 rounded transition-all ${
                            heroActiveCam === num
                              ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          CAM {num}
                        </button>
                      ))}
                    </div>

                    {/* Test Audio Button */}
                    <button
                      onClick={handlePlayHeroVoice}
                      className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700/60 font-mono text-[10px] font-bold flex items-center gap-1.5 transition-all"
                    >
                      <span className={heroPlayingAudio ? 'animate-spin' : ''}>🔊</span>
                      <span>{heroPlayingAudio ? 'Transmitting...' : 'Test Voice'}</span>
                    </button>
                  </div>
                </div>

                {/* Console Body Grid */}
                <div className="grid grid-cols-12 min-h-[540px]">
                  
                  {/* Left Mini Sidebar */}
                  <div className="hidden md:flex col-span-2 bg-[#070B14] border-r border-slate-800/80 p-3.5 flex-col justify-between text-xs">
                    <div className="space-y-4">
                      <div className="text-slate-400 font-mono text-[11px] uppercase tracking-wider font-semibold px-2">
                        Navigation
                      </div>
                      <div className="space-y-1">
                        <div className="px-3 py-2 rounded-lg bg-cyan-950/70 border border-cyan-700/60 text-cyan-300 font-medium flex items-center gap-2.5">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                          Live View
                        </div>
                        <div className="px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 flex items-center gap-2.5 transition-colors">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                          Analytics
                        </div>
                        <div className="px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 flex items-center justify-between transition-colors">
                          <span className="flex items-center gap-2.5">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                            Alerts
                          </span>
                          <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                            3
                          </span>
                        </div>
                        <div className="px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 flex items-center gap-2.5 transition-colors">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          Reports
                        </div>
                        <div className="px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 flex items-center gap-2.5 transition-colors">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                          Settings
                        </div>
                      </div>
                    </div>

                    {/* System Online Status Card */}
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300 mb-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        System Online
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight mb-2">
                        All 8 CCTV cameras operational at 30 FPS.
                      </p>
                      <svg className="w-full h-5 text-cyan-400" viewBox="0 0 100 20" fill="none">
                        <path d="M0 10 Q 15 2, 30 10 T 60 10 T 90 10 T 100 10" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                  </div>

                  {/* Center Live Aerial View with Heatmap Overlay */}
                  <div className="col-span-12 md:col-span-7 relative flex flex-col">
                    
                    {/* Flashing Red Alert Bar across top of camera feed */}
                    <div className="bg-gradient-to-r from-rose-950 via-rose-900 to-rose-950 border-b border-rose-600/70 p-3 px-4 flex items-center justify-between text-rose-200">
                      <div className="flex items-center gap-2.5 font-mono text-xs font-black">
                        <span className="animate-ping w-2 h-2 rounded-full bg-rose-400" />
                        <span>{heroActiveCam === 3 ? 'ZONE 3 — CRITICAL IN 04:20' : `ZONE ${heroActiveCam} — ACTIVE SENTINEL`}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        heroActiveCam === 3
                          ? 'bg-rose-900/80 border-rose-600 text-rose-300'
                          : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                      }`}>
                        {heroActiveCam === 3 ? 'HIGH DENSITY SURGE' : 'FREE FLOW MONITORING'}
                      </span>
                    </div>

                    {/* Video Viewport / Aerial View */}
                    <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
                      <img
                        src={heroActiveCam === 3 ? '/images/temple_crowd_aerial.jpg' : `/images/cctv_${heroActiveCam}.jpg`}
                        alt={`Live CCTV Camera ${heroActiveCam}`}
                        className="absolute inset-0 w-full h-full object-cover opacity-85 transition-opacity duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

                      {/* SVG Multi-Zone Heatmap */}
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
                        <defs>
                          <radialGradient id="heat-z3" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#ff0044" stop-opacity="0.85" />
                            <stop offset="40%" stop-color="#ff5500" stop-opacity="0.7" />
                            <stop offset="75%" stop-color="#ffbb00" stop-opacity="0.4" />
                            <stop offset="100%" stop-color="#00ff88" stop-opacity="0.1" />
                          </radialGradient>
                        </defs>

                        {/* Z1 */}
                        <polygon points="50,50 320,50 300,260 50,260" fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
                        <text x="175" y="155" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z1</text>

                        {/* Z2 */}
                        <polygon points="330,50 580,50 580,260 310,260" fill="rgba(16, 185, 129, 0.3)" stroke="#34d399" strokeWidth="2" />
                        <text x="445" y="155" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z2</text>

                        {/* Z3 (CRITICAL) */}
                        <polygon points="590,50 780,50 760,280 590,280" fill="url(#heat-z3)" stroke="#f43f5e" strokeWidth="3.5" className="animate-pulse" />
                        <text x="680" y="165" textAnchor="middle" fill="#ffffff" fontWeight="black" fontSize="20" filter="drop-shadow(0 0 10px rgba(244,63,94,1))">Z3 (CRITICAL)</text>

                        {/* Z4 */}
                        <polygon points="790,50 960,50 960,280 770,280" fill="rgba(245, 158, 11, 0.3)" stroke="#f59e0b" strokeWidth="2" />
                        <text x="870" y="165" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z4</text>

                        {/* Z5 */}
                        <polygon points="50,270 300,270 330,520 50,520" fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="2" />
                        <text x="175" y="395" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z5</text>

                        {/* Z6 */}
                        <polygon points="310,270 580,270 560,520 340,520" fill="rgba(16, 185, 129, 0.35)" stroke="#10b981" strokeWidth="2" />
                        <text x="445" y="395" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z6</text>

                        {/* Z7 */}
                        <polygon points="590,290 760,290 760,520 570,520" fill="rgba(245, 158, 11, 0.35)" stroke="#f59e0b" strokeWidth="2" />
                        <text x="665" y="395" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z7</text>

                        {/* Z8 */}
                        <polygon points="770,290 960,290 960,520 770,520" fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="2" />
                        <text x="865" y="395" textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="16">Z8</text>
                      </svg>

                      {/* Bottom Legend Bar inside camera feed */}
                      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/80">
                          <span className="text-[10px] text-slate-400">Low Density</span>
                          <div className="w-28 h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-600" />
                          <span className="text-[10px] text-rose-400 font-bold">High Density</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Analytics Sidebar */}
                  <div className="col-span-12 md:col-span-3 bg-[#070B14] border-l border-slate-800/80 p-4 flex flex-col justify-between text-xs space-y-4">
                    
                    {/* Critical Alert Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-b from-rose-950/60 to-rose-950/20 border border-rose-600/70 shadow-lg shadow-rose-950/40">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded bg-rose-500/20 text-rose-400">⚠️</span>
                          <div>
                            <div className="font-bold text-slate-200">Zone 3</div>
                            <div className="text-[10px] text-rose-400 font-mono font-black uppercase tracking-wider">CRITICAL</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-400 uppercase font-mono">Est. time to danger</div>
                          <div className="text-xl font-black font-mono text-rose-400 animate-pulse">04:20</div>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] font-mono pt-2 border-t border-rose-900/40">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Current density:</span>
                          <span className="text-rose-300 font-bold">92%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Trend (5 min):</span>
                          <span className="text-rose-400 font-bold">↗ +18%</span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-slate-400">Action:</span>
                          <span className="text-amber-300 font-semibold text-[10px]">Initiate crowd control</span>
                        </div>
                      </div>
                    </div>

                    {/* Zone Density Status Bars */}
                    <div className="space-y-2">
                      <div className="text-slate-400 font-mono text-[11px] uppercase tracking-wider font-semibold">
                        Zone Density
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Z1</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[42%] h-full bg-emerald-400 rounded-full" />
                          </div>
                          <span className="text-slate-300 ml-1">42%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Z5</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[36%] h-full bg-emerald-400 rounded-full" />
                          </div>
                          <span className="text-slate-300 ml-1">36%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Z2</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[58%] h-full bg-emerald-400 rounded-full" />
                          </div>
                          <span className="text-slate-300 ml-1">58%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Z6</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[52%] h-full bg-emerald-400 rounded-full" />
                          </div>
                          <span className="text-slate-300 ml-1">52%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-rose-400 font-bold">Z3</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[92%] h-full bg-rose-500 rounded-full" />
                          </div>
                          <span className="text-rose-400 font-bold ml-1">92%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Z7</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[61%] h-full bg-amber-400 rounded-full" />
                          </div>
                          <span className="text-slate-300 ml-1">61%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-amber-400 font-bold">Z4</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[67%] h-full bg-amber-400 rounded-full" />
                          </div>
                          <span className="text-amber-400 ml-1">67%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Z8</span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1.5">
                            <div className="w-[49%] h-full bg-emerald-400 rounded-full" />
                          </div>
                          <span className="text-slate-300 ml-1">49%</span>
                        </div>
                      </div>
                    </div>

                    {/* Crowd Flow Wave Tracker */}
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1.5">
                        <span>Crowd Flow</span>
                        <span>Total People: <strong className="text-white">24,360</strong></span>
                      </div>
                      <svg className="w-full h-8 text-cyan-400" viewBox="0 0 200 30" fill="none">
                        <path d="M0 15 C 20 28, 40 2, 60 15 C 80 28, 100 5, 120 18 C 140 30, 160 5, 180 15 L 200 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>

                    {/* Launch Live Command Center button in console */}
                    <button
                      onClick={onLaunchConsole}
                      className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-950"
                    >
                      Open Live Interactive Console ⚡
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* 2. SPATIAL 3D HOLOGRAPHIC VENUE (Ghats & Temple Crowd Panoramic Backdrop) */}
      {/* ========================================================================= */}
      <section
        id="hologram"
        className="relative py-32 overflow-hidden transition-transform duration-500 ease-out"
        style={{
          transform: `perspective(1200px) rotateX(${Math.max(0, 10 - (scrollY - 700) * 0.012)}deg)`,
        }}
      >
        {/* Panoramic Hologram Backdrop Image */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
          <img
            src="/images/ghats_hologram_aerial.jpg"
            alt="Pilgrimage Ghats Hologram Backdrop"
            className="w-full h-full object-cover object-center filter contrast-125 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-[#070B14]/70 to-[#070B14]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 px-3.5 py-1 rounded-full bg-cyan-950/90 border border-cyan-700/60 inline-block mb-3 shadow-lg">
              Spatial Hologram & Ground-Plane Extrusion
            </span>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              Real-time crowd physics in <span className="text-cyan-400">true 3D space.</span>
            </h2>
            <p className="text-slate-300 mt-4 text-base leading-relaxed">
              PravahAI reconstructs standard flat CCTV feeds into 3D isometric height-maps. High crowd density manifests as glowing vertical hazard pillars before stampede conditions lock the corridor.
            </p>

            {/* Layer Switcher */}
            <div className="inline-flex p-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl mt-8 shadow-2xl">
              <button
                onClick={() => setActiveLayer('thermal')}
                className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  activeLayer === 'thermal' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                1. 3D Density Pillars
              </button>
              <button
                onClick={() => setActiveLayer('vectors')}
                className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  activeLayer === 'vectors' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                2. Divergence Vectors (div v)
              </button>
              <button
                onClick={() => setActiveLayer('evac')}
                className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  activeLayer === 'evac' ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                3. Triage Diversion Corridors
              </button>
            </div>
          </div>

          {/* 3D Ground Hologram Stage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Hologram Stage */}
            <div className="lg:col-span-8 relative min-h-[520px] rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-[#091224]/90 to-[#070B14]/95 p-8 flex items-center justify-center shadow-[0_20px_80px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none" />
              
              {/* Laser Scanline */}
              <div className="absolute inset-x-0 h-1 bg-cyan-400/40 blur-sm animate-pulse pointer-events-none" style={{ top: '40%' }} />

              {/* 3D Isometric Holographic Stage */}
              <div
                className="relative w-full max-w-[580px] h-[360px] preserve-3d cursor-pointer"
                style={{ transform: 'perspective(1000px) rotateX(36deg) rotateZ(-18deg)' }}
              >
                {/* 3D Ground Floor Plate */}
                <div className="absolute inset-0 rounded-2xl border-2 border-cyan-500/60 bg-[#081026]/95 p-4 shadow-[0_0_60px_rgba(0,229,255,0.25)]">
                  
                  {/* Grid Sectors with 3D Pillars */}
                  <div className="grid grid-cols-3 grid-rows-3 gap-4 h-full">
                    
                    {/* Sector 1 */}
                    <div
                      onClick={() => setInspectedZone(1)}
                      className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                        inspectedZone === 1 ? 'border-cyan-400 bg-cyan-950/40' : 'border-emerald-500/40 bg-emerald-950/20'
                      }`}
                    >
                      <span className="text-xs font-mono font-bold text-emerald-400">Sector 1</span>
                      <div className="text-[10px] font-mono text-slate-300">1.2 p/m² · Green</div>
                    </div>

                    {/* Sector 2 */}
                    <div
                      onClick={() => setInspectedZone(2)}
                      className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                        inspectedZone === 2 ? 'border-cyan-400 bg-cyan-950/40' : 'border-emerald-500/40 bg-emerald-950/20'
                      }`}
                    >
                      <span className="text-xs font-mono font-bold text-emerald-400">Sector 2</span>
                      <div className="text-[10px] font-mono text-slate-300">1.8 p/m² · Free Flow</div>
                    </div>

                    {/* Sector 3 (BOTTLE-NECK WITH 3D EXTRUDED VERTICAL PILLAR) */}
                    <div
                      onClick={() => setInspectedZone(3)}
                      className="relative rounded-xl border-2 border-rose-500 bg-rose-950/60 p-3 flex flex-col justify-between shadow-[0_0_50px_rgba(244,63,94,0.8)] cursor-pointer"
                    >
                      {/* Vertical Extruded 3D Hazard Pillar */}
                      {activeLayer === 'thermal' && (
                        <div
                          className="absolute -top-24 left-4 right-4 h-24 rounded-lg bg-gradient-to-t from-rose-600/80 to-rose-400/20 border border-rose-400/90 shadow-[0_0_30px_rgba(244,63,94,0.8)] pointer-events-none animate-pulse flex items-center justify-center font-mono text-[10px] font-black text-white"
                          style={{ transform: 'translateZ(60px)' }}
                        >
                          DENSITY: 4.25 p/m²
                        </div>
                      )}

                      <div className="flex justify-between items-start">
                        <span className="text-xs font-mono font-black text-rose-300">Sector 3 (Danger)</span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-mono text-[9px] font-bold">4.2 p/m²</span>
                      </div>
                      <div className="text-[10px] text-rose-300 font-mono font-bold">
                        {activeLayer === 'vectors' ? 'Convergence: -0.88 div' : activeLayer === 'evac' ? 'Gate 2 Evac Route Active' : 'CRITICAL IN 03m 45s'}
                      </div>
                    </div>

                    {/* Sector 4 */}
                    <div onClick={() => setInspectedZone(4)} className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 flex flex-col justify-between">
                      <span className="text-xs font-mono font-bold text-amber-400">Sector 4</span>
                      <div className="text-[10px] font-mono text-slate-300">2.6 p/m² · Amber</div>
                    </div>

                    {/* Sector 5 */}
                    <div onClick={() => setInspectedZone(5)} className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 flex flex-col justify-between">
                      <span className="text-xs font-mono font-bold text-emerald-400">Sector 5</span>
                      <div className="text-[10px] font-mono text-slate-300">0.9 p/m² · Safe</div>
                    </div>

                    {/* Sector 6 */}
                    <div onClick={() => setInspectedZone(6)} className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 flex flex-col justify-between">
                      <span className="text-xs font-mono font-bold text-emerald-400">Sector 6</span>
                      <div className="text-[10px] font-mono text-slate-300">1.4 p/m² · Flowing</div>
                    </div>

                    {/* Sector 7 (Gate 2 Overflow Pathway) */}
                    <div
                      onClick={() => setInspectedZone(7)}
                      className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                        activeLayer === 'evac'
                          ? 'border-cyan-400 bg-cyan-950/70 shadow-[0_0_30px_rgba(0,229,255,0.7)] animate-pulse'
                          : 'border-slate-800 bg-slate-900/40'
                      }`}
                    >
                      <span className="text-xs font-mono font-bold text-cyan-400">Gate 2 Overflow</span>
                      <div className="text-[10px] font-mono text-slate-300">{activeLayer === 'evac' ? '⚡ Flow Diverted' : 'Standby Route'}</div>
                    </div>

                    {/* Sector 8 */}
                    <div onClick={() => setInspectedZone(8)} className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 flex flex-col justify-between">
                      <span className="text-xs font-mono font-bold text-emerald-400">Sector 8</span>
                      <div className="text-[10px] font-mono text-slate-300">1.1 p/m²</div>
                    </div>

                    {/* Sector 9 */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 flex flex-col justify-between">
                      <span className="text-xs font-mono font-bold text-slate-400">Exit Sanctum</span>
                      <div className="text-[10px] font-mono text-slate-400">Open Flow</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Aerospace Telemetry Inspector */}
            <div className="lg:col-span-4 space-y-4">
              <div className="p-6 rounded-3xl border border-cyan-500/30 bg-[#0A0F20]/90 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 font-mono text-xs">
                  <span className="text-cyan-400 font-bold uppercase tracking-wider">Sector Telemetry HUD</span>
                  <span className="text-slate-400">ID: SEC-0{inspectedZone}</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-mono text-slate-400 uppercase">Selected Hazard Sector</div>
                    <div className="text-xl font-bold text-white mt-0.5">
                      {inspectedZone === 3 ? 'Barricade Corridor (Hazard Node)' : inspectedZone === 7 ? 'Gate 2 Overflow Corridor' : `Sanctum Queue Sector ${inspectedZone}`}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Density</div>
                      <div className={`text-base font-black ${inspectedZone === 3 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {inspectedZone === 3 ? '4.25 p/m²' : '1.40 p/m²'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Risk Score</div>
                      <div className={`text-base font-black ${inspectedZone === 3 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {inspectedZone === 3 ? '94 / 100' : '18 / 100'}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 font-mono text-xs space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Inward Divergence:</span>
                      <span className="text-rose-400 font-bold">{inspectedZone === 3 ? '-0.88 div (Extreme)' : '0.02 (Nominal)'}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Rate of Accumulation:</span>
                      <span className="text-amber-300 font-bold">{inspectedZone === 3 ? '+0.45 p/m²/min' : '+0.02 p/m²/min'}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Estimated Lead Time:</span>
                      <span className="text-cyan-400 font-black">{inspectedZone === 3 ? '03m 45s countdown' : 'Nominal (No Alert)'}</span>
                    </div>
                  </div>

                  <button
                    onClick={onLaunchConsole}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider shadow-lg shadow-cyan-950 hover:scale-[1.01] transition-all"
                  >
                    Inspect in Live Command Center ⚡
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. INTERACTIVE 60-FPS REAL-TIME CROWD PARTICLE PHYSICS SIMULATOR */}
      {/* ========================================================================= */}
      <section
        id="simulation"
        className="py-32 relative overflow-hidden transition-transform duration-500 ease-out"
        style={{
          transform: `perspective(1200px) rotateX(${Math.max(0, 10 - (scrollY - 1500) * 0.01)}deg)`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 px-3.5 py-1 rounded-full bg-cyan-950/90 border border-cyan-700/60 inline-block mb-3 shadow-lg">
              Interactive Fluid Dynamics Lab
            </span>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              Test crowd crush physics <span className="text-cyan-400">in real-time.</span>
            </h2>
            <p className="text-slate-400 mt-4 text-base">
              Interact directly with our fluid mechanics simulation. Trigger an artificial corridor surge, observe the particle density wave, and activate automated diversion gates.
            </p>
          </div>

          {/* Interactive Simulation Console */}
          <div className="max-w-5xl mx-auto rounded-3xl border border-cyan-500/40 bg-[#090F1E] shadow-2xl overflow-hidden p-6 sm:p-8">
            
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-sm font-bold text-white">CORRIDOR FLOW VECTOR CANVAS (60 FPS)</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 font-mono text-xs">
                <button
                  onClick={() => setSimStatus('nominal')}
                  className={`px-3.5 py-2 rounded-xl transition-all ${
                    simStatus === 'nominal' ? 'bg-emerald-500 text-slate-950 font-bold shadow-md' : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  🟢 1. Nominal Flow
                </button>
                <button
                  onClick={() => setSimStatus('bottleneck')}
                  className={`px-3.5 py-2 rounded-xl transition-all ${
                    simStatus === 'bottleneck' ? 'bg-rose-500 text-white font-bold shadow-lg shadow-rose-950' : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  🔴 2. Trigger Bottleneck
                </button>
                <button
                  onClick={() => setSimStatus('diverted')}
                  className={`px-3.5 py-2 rounded-xl transition-all ${
                    simStatus === 'diverted' ? 'bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-950' : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  ⚡ 3. Open Gate 2 Divert
                </button>
              </div>
            </div>

            {/* Particle Canvas */}
            <div className="relative mt-6 rounded-2xl border border-slate-800 bg-[#050811] overflow-hidden">
              <canvas
                ref={canvasRef}
                width={900}
                height={320}
                className="w-full h-[320px] block"
              />

              {/* Overlay HUD indicators */}
              <div className="absolute top-4 left-4 flex items-center gap-2 font-mono text-xs bg-black/70 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400">Inflow:</span>
                <span className="text-white font-bold">1,800 people/min</span>
              </div>

              <div className="absolute top-4 right-4 flex items-center gap-3 font-mono text-xs bg-black/70 px-3.5 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400">Status:</span>
                <span className={`font-bold uppercase ${
                  simStatus === 'bottleneck' ? 'text-rose-400 animate-pulse' : simStatus === 'diverted' ? 'text-cyan-400' : 'text-emerald-400'
                }`}>
                  {simStatus === 'bottleneck' ? '🚨 STAMPEDE RISK CRITICAL' : simStatus === 'diverted' ? '⚡ DIVERSION FLOW ACTIVE' : 'NOMINAL STEADY STATE'}
                </span>
              </div>
            </div>

            {/* Simulation Status Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-xs font-mono text-slate-300">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-500 text-[10px]">CORRIDOR VELOCITY</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {simStatus === 'bottleneck' ? '0.12 m/s (Immobile Jam)' : '1.45 m/s (Healthy Flow)'}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-500 text-[10px]">SHOCKWAVE RISK INDEX</div>
                <div className={`text-base font-bold mt-0.5 ${simStatus === 'bottleneck' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {simStatus === 'bottleneck' ? '92 / 100 (Red Critical)' : '14 / 100 (Safe)'}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-slate-500 text-[10px]">TRIAGE PROTOCOL</div>
                <div className="text-base font-bold text-cyan-400 mt-0.5">
                  {simStatus === 'diverted' ? 'Gate 2 Latches Released' : simStatus === 'bottleneck' ? 'Dispatch 2 Marshals Now' : 'Passive Sentinel Mode'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. EDGE SENSOR OPTICS & CCTV HARDWARE TEARDOWN (New 3D Image Backdrop) */}
      {/* ========================================================================= */}
      <section
        id="hardware"
        className="py-32 relative overflow-hidden transition-transform duration-500 ease-out"
        style={{
          transform: `perspective(1200px) rotateX(${Math.max(0, 10 - (scrollY - 2300) * 0.01)}deg)`,
        }}
      >
        {/* CCTV Sensor Image Backdrop */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-25">
          <img
            src="/images/cctv_edge_sensor.jpg"
            alt="CCTV Sensor Over Temple"
            className="w-full h-full object-cover object-center filter contrast-125 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-[#070B14]/80 to-[#070B14]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 px-3.5 py-1 rounded-full bg-cyan-950/90 border border-cyan-700/60 inline-block mb-3 shadow-lg">
              Hardware-Free Edge Integration
            </span>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
              Turns any CCTV into an <span className="text-cyan-400">intelligent sentry.</span>
            </h2>
            <p className="text-slate-400 mt-4 text-base">
              No bespoke sensor retrofits. PravahAI runs directly on existing standard RTSP video feeds, executing YOLOv8n object detection and Farneback optical flow entirely on standard edge CPUs.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Interactive 3D Camera Teardown Frame */}
            <div className="lg:col-span-7 relative rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-[#091224]/90 to-[#060A14] overflow-hidden shadow-2xl p-6">
              <div className="relative rounded-2xl overflow-hidden h-[380px]">
                <img
                  src="/images/cctv_edge_sensor.jpg"
                  alt="Interactive 3D CCTV Edge Node"
                  className="w-full h-full object-cover object-right filter brightness-90 contrast-110"
                />
                
                {/* 3D Hotspot 1: Optical Lens */}
                <div
                  onClick={() => setActiveHotspot('lens')}
                  className="absolute top-[38%] right-[38%] cursor-pointer group"
                >
                  <span className="absolute -inset-2 rounded-full bg-cyan-400 animate-ping opacity-75" />
                  <span className="relative flex w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-mono font-bold text-xs items-center justify-center shadow-lg shadow-cyan-400">
                    1
                  </span>
                </div>

                {/* 3D Hotspot 2: Internal Neural Tensor Core */}
                <div
                  onClick={() => setActiveHotspot('cpu')}
                  className="absolute top-[32%] right-[22%] cursor-pointer group"
                >
                  <span className="absolute -inset-2 rounded-full bg-amber-400 animate-ping opacity-75" />
                  <span className="relative flex w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-xs items-center justify-center shadow-lg shadow-amber-400">
                    2
                  </span>
                </div>

                {/* 3D Hotspot 3: Acoustic Waveguide (Audio) */}
                <div
                  onClick={() => setActiveHotspot('audio')}
                  className="absolute bottom-[24%] right-[28%] cursor-pointer group"
                >
                  <span className="absolute -inset-2 rounded-full bg-rose-400 animate-ping opacity-75" />
                  <span className="relative flex w-6 h-6 rounded-full bg-rose-500 text-white font-mono font-bold text-xs items-center justify-center shadow-lg shadow-rose-400">
                    3
                  </span>
                </div>
              </div>

              {/* Sub-bar explaining active hotspot */}
              <div className="mt-4 flex items-center justify-between text-xs font-mono px-2 text-slate-400">
                <span>CLICK HOTSPOTS (1, 2, 3) TO INSPECT SUBSYSTEMS</span>
                <span className="text-cyan-400 font-bold">ALL EDGE PIPELINES ACTIVE</span>
              </div>
            </div>

            {/* Right Subsystem Deep Dive */}
            <div className="lg:col-span-5 space-y-4">
              
              <div
                onClick={() => setActiveHotspot('lens')}
                className={`p-6 rounded-2xl border transition-all cursor-pointer ${
                  activeHotspot === 'lens' ? 'border-cyan-400 bg-cyan-950/40 shadow-xl shadow-cyan-950/60' : 'border-slate-800 bg-[#0A0F1E]/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center justify-center">1</span>
                  <h3 className="text-lg font-bold text-white">4K Optical RTSP Ingestion</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Ingests standard H.264/H.265 camera feeds over local IP without cloud streaming. Downscales frames for Farneback flow and extracts person centroids instantly.
                </p>
              </div>

              <div
                onClick={() => setActiveHotspot('cpu')}
                className={`p-6 rounded-2xl border transition-all cursor-pointer ${
                  activeHotspot === 'cpu' ? 'border-amber-400 bg-amber-950/40 shadow-xl shadow-amber-950/60' : 'border-slate-800 bg-[#0A0F1E]/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-xs flex items-center justify-center">2</span>
                  <h3 className="text-lg font-bold text-white">Edge CPU Neural Inference (&lt;100ms)</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  YOLOv8n detector executes in 30.5ms on CPU. Zero requirement for costly venue GPUs or uninterrupted internet connectivity during storms.
                </p>
              </div>

              <div
                onClick={() => setActiveHotspot('audio')}
                className={`p-6 rounded-2xl border transition-all cursor-pointer ${
                  activeHotspot === 'audio' ? 'border-rose-400 bg-rose-950/40 shadow-xl shadow-rose-950/60' : 'border-slate-800 bg-[#0A0F1E]/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-rose-500 text-white font-mono font-bold text-xs flex items-center justify-center">3</span>
                  <h3 className="text-lg font-bold text-white">Sarvam AI Native Hindi Voice Dispatch</h3>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Synthesizes high-clarity Hindi tactical announcements with single-warning Edge-TTS fallback. Marshals receive spoken instructions on handheld radios before panic spreads.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. 3D IMPACT & RESPONSE LEAD TIME CALCULATOR */}
      {/* ========================================================================= */}
      <section
        id="calculator"
        className="py-32 relative overflow-hidden transition-transform duration-500 ease-out"
        style={{
          transform: `perspective(1200px) rotateX(${Math.max(0, 10 - (scrollY - 3100) * 0.01)}deg)`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-5">
              <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 px-3.5 py-1 rounded-full bg-cyan-950/90 border border-cyan-700/60 inline-block mb-3 shadow-lg">
                ROI & Life Safety Model
              </span>
              <h2 className="text-4xl font-extrabold text-white tracking-tight">
                Calculate your venue’s early warning window.
              </h2>
              <p className="text-slate-400 mt-4 text-sm leading-relaxed">
                Traditional human video monitoring notices crowd stampedes 2 minutes after crush conditions occur. PravahAI provides 8+ minutes advance tactical buffer time.
              </p>

              <div className="mt-8 space-y-4 font-mono text-xs">
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                  <span className="text-cyan-400 text-lg">🛡️</span>
                  <div>
                    <span className="text-white font-bold block">Autonomous Pre-Emptive Gating</span>
                    <span className="text-slate-400 text-[11px] mt-0.5 block">Automated turnstile release triggers before density exceeds 4.0 people/m².</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                  <span className="text-emerald-400 text-lg">⚡</span>
                  <div>
                    <span className="text-white font-bold block">Zero Cloud Lag</span>
                    <span className="text-slate-400 text-[11px] mt-0.5 block">All telemetry processed locally at 1-5 Hz directly within the venue perimeter.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3D Glass Calculator Terminal */}
            <div className="lg:col-span-7 p-8 rounded-3xl border border-cyan-500/40 bg-gradient-to-br from-[#0D152A] via-[#0A0E1A] to-[#070B14] shadow-2xl shadow-cyan-950/60 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center justify-between">
                <span>Interactive Venue Parameters</span>
                <span className="text-xs font-mono text-cyan-400 font-normal">Real-time Simulation Model</span>
              </h3>

              {/* Slider 1: Venue Capacity */}
              <div className="mb-6">
                <div className="flex justify-between items-center text-xs font-mono mb-2">
                  <span className="text-slate-300">Expected Peak Footfall:</span>
                  <span className="text-cyan-300 font-bold text-sm">{venueCapacity.toLocaleString()} Pilgrims</span>
                </div>
                <input
                  type="range"
                  min="10000"
                  max="300000"
                  step="5000"
                  value={venueCapacity}
                  onChange={(e) => setVenueCapacity(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider 2: CCTV Cameras */}
              <div className="mb-6">
                <div className="flex justify-between items-center text-xs font-mono mb-2">
                  <span className="text-slate-300">Monitored CCTV Feeds:</span>
                  <span className="text-cyan-300 font-bold text-sm">{cctvCount} Cameras</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="120"
                  step="2"
                  value={cctvCount}
                  onChange={(e) => setCctvCount(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider 3: Marshals */}
              <div className="mb-8">
                <div className="flex justify-between items-center text-xs font-mono mb-2">
                  <span className="text-slate-300">On-Ground Marshals Equipped:</span>
                  <span className="text-cyan-300 font-bold text-sm">{marshalCount} Marshals</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="80"
                  step="2"
                  value={marshalCount}
                  onChange={(e) => setMarshalCount(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Dynamic Results Grid */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800 font-mono text-center">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400">Response Lead Time</div>
                  <div className="text-2xl font-black text-cyan-400 mt-1">{leadTimeFormatted}</div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">Early Warning</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400">Crush Risk Reduction</div>
                  <div className="text-2xl font-black text-emerald-400 mt-1">{riskReduction}%</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Accident Prevention</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="text-[10px] uppercase text-slate-400">Flow Throughput</div>
                  <div className="text-2xl font-black text-amber-300 mt-1">+{throughput.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">People / Hour</div>
                </div>
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-cyan-950 hover:scale-[1.01] transition-all"
                >
                  Request Venue Deployment Blueprint →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. CALL TO ACTION & SYSTEM ACCESS */}
      {/* ========================================================================= */}
      <section className="py-24 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="p-12 sm:p-16 rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-[#0D152A] to-[#070B14] shadow-2xl relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
            
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 px-3 py-1 rounded-full bg-cyan-950 border border-cyan-800 inline-block mb-4">
              Hackathon Production-Grade Release
            </span>
            <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tight mb-6">
              Test PravahAI live now.
            </h2>
            <p className="text-slate-400 text-base max-w-xl mx-auto mb-8 leading-relaxed">
              Launch the live interactive command center, simulate crowd escalation scenarios, and test Sarvam AI Hindi voice broadcasts.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={onLaunchConsole}
                className="px-8 py-4 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 font-black text-base shadow-xl shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all"
              >
                Launch Live Command Center ⚡
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-8 py-4 rounded-full bg-slate-900 border border-slate-700 hover:border-cyan-400 text-white font-bold text-base transition-all"
              >
                Book a Live Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-[#050810] py-12 relative z-10 text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-sm tracking-tight">PravahAI (प्रवाही)</span>
            <span>·</span>
            <span>AI Crowd Safety Command Center</span>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              All Systems Operational
            </span>
            <span>99.98% Edge Uptime</span>
          </div>

          <div>
            Built with YOLOv8, Farneback Flow, Sarvam AI & FastAPI.
          </div>
        </div>
      </footer>

      {/* DEMO MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg p-8 rounded-3xl border border-cyan-500/50 bg-[#0A0F1E] shadow-2xl shadow-cyan-950">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setDemoRequested(false);
              }}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            {!demoRequested ? (
              <>
                <div className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-1">
                  Schedule Pilot Access
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Book a PravahAI Live Demo</h3>
                <p className="text-slate-400 text-xs mb-6">
                  Deploy PravahAI on your existing CCTV network or test with simulated crowd feeds.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setDemoRequested(true);
                  }}
                  className="space-y-4 text-left text-xs"
                >
                  <div>
                    <label className="block text-slate-300 font-mono mb-1">Name / Organization</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kashi Vishwanath Temple Trust"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-mono mb-1">Official Email</label>
                    <input
                      type="email"
                      required
                      placeholder="marshal@safety.gov.in"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-sans"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-mono mb-1">Venue Type</label>
                    <select className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 font-sans">
                      <option>Religious Pilgrimage & Temple Complex</option>
                      <option>Railway Station & Metro Transit Hub</option>
                      <option>Sports Arena / Concert Stadium</option>
                      <option>Municipal Disaster Management Center</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 font-black text-sm shadow-lg hover:scale-[1.01] transition-all mt-2"
                  >
                    Confirm & Access Demo →
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="text-4xl">✅</div>
                <h3 className="text-2xl font-bold text-white">Pilot Demo Request Received</h3>
                <p className="text-slate-300 text-xs">
                  Your demonstration environment has been provisioned. You can launch the live interactive command center immediately:
                </p>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    onLaunchConsole();
                  }}
                  className="w-full py-3 rounded-xl bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg"
                >
                  Launch Live Command Center Now ⚡
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
