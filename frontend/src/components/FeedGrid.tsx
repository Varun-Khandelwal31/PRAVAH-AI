import React, { useEffect, useRef } from 'react';
import type { ZoneTickData } from './ZoneMap';

interface FeedGridProps {
  sourceMode?: string;
  zoneDataMap: Record<string, ZoneTickData>;
  selectedZoneId: string | null;
  onSelectZone?: (id: string) => void;
}

const CAMERAS = [
  { id: 'cam-01', zoneId: 'north_entry', label: 'CAM-01', name: 'North Entry' },
  { id: 'cam-02', zoneId: 'ticket_queue', label: 'CAM-02', name: 'Ticket Queue' },
  { id: 'cam-03', zoneId: 'barricade_corridor', label: 'CAM-03', name: 'Barricade Corridor' },
  { id: 'cam-04', zoneId: 'main_concourse', label: 'CAM-04', name: 'Main Concourse' },
  { id: 'cam-05', zoneId: 'east_wing', label: 'CAM-05', name: 'East Wing' },
  { id: 'cam-06', zoneId: 'gate_2_overflow', label: 'CAM-06', name: 'Gate 2 Overflow' },
];

export const FeedGrid: React.FC<FeedGridProps> = ({
  sourceMode = 'simulator',
  zoneDataMap,
  selectedZoneId,
  onSelectZone,
}) => {
  const isVideoMode = sourceMode === 'video' || sourceMode === 'webcam';

  return (
    <div className="bg-[#0D1322]/90 backdrop-blur-md border border-cyan-950/60 rounded-xl p-4 flex flex-col shadow-xl shadow-cyan-950/20">
      <div className="flex justify-between items-center pb-3 border-b border-cyan-900/30 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
          Optical CCTV Feeds & Synthetic Telemetry
          <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.2 rounded border border-cyan-800/60 font-mono">
            {isVideoMode ? 'MJPEG LIVE STREAM' : 'SIMULATED RADAR'}
          </span>
        </h3>
        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          6 CHANNELS ONLINE
        </span>
      </div>

      {/* 2x3 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {CAMERAS.map((cam) => {
          const data = zoneDataMap[cam.zoneId];
          const density = data?.density ?? 0.0;
          const level = data?.level ?? 'green';
          const isSelected = cam.zoneId === selectedZoneId;
          const isDangerZone = cam.zoneId === 'barricade_corridor';

          return (
            <div
              key={cam.id}
              onClick={() => onSelectZone?.(cam.zoneId)}
              className={`relative rounded-lg overflow-hidden border transition-all duration-200 cursor-pointer flex flex-col ${
                isSelected
                  ? 'border-cyan-400 shadow-md shadow-cyan-950/50'
                  : level === 'red'
                  ? 'border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                  : level === 'amber'
                  ? 'border-amber-500/60'
                  : 'border-slate-800 bg-[#070B16] hover:border-slate-700'
              }`}
            >
              {/* Camera Header Banner */}
              <div className="px-2.5 py-1.5 bg-[#0A0F1D]/90 border-b border-slate-800/80 flex justify-between items-center text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      level === 'red'
                        ? 'bg-rose-500 animate-ping'
                        : level === 'amber'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                  <span className="font-bold text-slate-200">
                    {cam.label} · {cam.name}
                  </span>
                </div>
                <span
                  className={`font-bold ${
                    level === 'red'
                      ? 'text-rose-400'
                      : level === 'amber'
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }`}
                >
                  {density.toFixed(1)} p/m²
                </span>
              </div>

              {/* Feed Content Area */}
              <div className="h-32 relative bg-black/90 flex items-center justify-center overflow-hidden">
                {isVideoMode && isDangerZone ? (
                  // Live MJPEG backend feed stream for video/webcam mode
                  <img
                    src="/api/feed.mjpeg"
                    alt={cam.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback if mjpeg stream not ready
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  // Stylized dot-crowd canvas visualization
                  <DotCrowdCanvas density={density} level={level} isDangerZone={isDangerZone} />
                )}

                {/* Top-Right HUD overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 border border-white/10">
                  <span>REC</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                </div>

                {/* Bottom-Left Zone Tag */}
                <div className="absolute bottom-2 left-2 text-[10px] font-mono text-cyan-400 bg-black/70 px-1.5 py-0.5 rounded border border-cyan-900/60">
                  FLOW: {data?.jam ? (data.jam > 0.4 ? 'JAMMED' : 'NOMINAL') : 'NORMAL'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Canvas rendering animated crowd density dots simulating radar surveillance
interface DotCrowdCanvasProps {
  density: number;
  level: 'green' | 'amber' | 'red';
  isDangerZone: boolean;
}

const DotCrowdCanvas: React.FC<DotCrowdCanvasProps> = ({ density, level, isDangerZone }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const width = (canvas.width = 240);
    const height = (canvas.height = 128);

    // Number of dots proportional to density
    const count = Math.max(8, Math.min(65, Math.floor(density * 14) + (isDangerZone ? 10 : 4)));
    const dots = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * (level === 'red' ? 0.3 : 1.2),
      vy: (Math.random() - 0.5) * (level === 'red' ? 0.3 : 1.2),
      r: Math.random() * 2 + 2,
    }));

    const render = () => {
      ctx.fillStyle = '#060A14';
      ctx.fillRect(0, 0, width, height);

      // Radar scanlines
      ctx.strokeStyle = '#0E1726';
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const dotColor =
        level === 'red' ? '#f43f5e' : level === 'amber' ? '#fbbf24' : '#06b6d4';

      dots.forEach((dot) => {
        dot.x += dot.vx;
        dot.y += dot.vy;
        if (dot.x < 4 || dot.x > width - 4) dot.vx *= -1;
        if (dot.y < 4 || dot.y > height - 4) dot.vy *= -1;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = level === 'red' ? 6 : 2;
        ctx.fill();
      });

      // Proximity connection lines when dense
      if (density > 2.0) {
        ctx.strokeStyle = level === 'red' ? 'rgba(244, 63, 94, 0.25)' : 'rgba(251, 191, 36, 0.2)';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
            if (dist < 28) {
              ctx.beginPath();
              ctx.moveTo(dots[i].x, dots[i].y);
              ctx.lineTo(dots[j].x, dots[j].y);
              ctx.stroke();
            }
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [density, level, isDangerZone]);

  return <canvas ref={canvasRef} className="w-full h-full object-cover" />;
};

export default FeedGrid;
