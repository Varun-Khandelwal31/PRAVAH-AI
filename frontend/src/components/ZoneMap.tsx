import React, { useState, useEffect } from 'react';

export interface ZoneConfig {
  id: string;
  name: string;
  points: [number, number][];
  area_m2: number;
  critical_threshold: number;
}

export interface ZoneTickData {
  id: string;
  name?: string;
  density: number;
  count?: number;
  jam: number;
  surge: number;
  trend_slope: number;
  risk: number;
  eta_s: number | null;
  level: 'green' | 'amber' | 'red';
}

interface ZoneMapProps {
  zones: ZoneConfig[];
  zoneDataMap: Record<string, ZoneTickData>;
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
}

export const ZoneMap: React.FC<ZoneMapProps> = ({
  zones,
  zoneDataMap,
  selectedZoneId,
  onSelectZone,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const getLevelStyles = (level?: 'green' | 'amber' | 'red', isSelected?: boolean) => {
    switch (level) {
      case 'red':
        return {
          polygonClass: 'fill-rose-950/80 stroke-rose-500 stroke-[3] animate-pulse',
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
          dotColor: '#f43f5e',
        };
      case 'amber':
        return {
          polygonClass: isSelected
            ? 'fill-amber-900/70 stroke-amber-300 stroke-[3]'
            : 'fill-amber-950/60 stroke-amber-400 stroke-2',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
          dotColor: '#fbbf24',
        };
      case 'green':
      default:
        return {
          polygonClass: isSelected
            ? 'fill-emerald-900/60 stroke-cyan-400 stroke-[2.5]'
            : 'fill-slate-900/80 stroke-emerald-600/70 stroke-[1.5] hover:fill-emerald-950/50',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dotColor: '#10b981',
        };
    }
  };

  return (
    <div className="w-full h-full bg-[#0D1322]/90 backdrop-blur-md border border-cyan-950/60 rounded-xl p-4 flex flex-col shadow-2xl shadow-cyan-950/20">
      {/* Header Bar */}
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-cyan-900/30 mb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
          <h2 className="text-sm font-semibold tracking-wider uppercase text-cyan-300 flex items-center gap-2">
            Kashi Queue Complex — LIVE
            <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-800/60 font-mono">
              8 ZONES
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Nom &lt;40
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span> Amb 40-74
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> Crit ≥75
            </span>
          </div>
          <div className="px-2.5 py-1 bg-cyan-950/80 text-cyan-300 rounded border border-cyan-800/80 font-bold">
            {currentTime || '00:00:00'}
          </div>
        </div>
      </div>

      {/* SVG Top-Down Vector Map */}
      <div className="flex-1 relative w-full h-full min-h-[360px] bg-[#070A13] rounded-lg border border-cyan-950/80 overflow-hidden flex items-center justify-center">
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#06b6d4 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        <svg viewBox="0 0 1000 700" className="w-full h-full p-2 select-none">
          <defs>
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {zones.map((zone) => {
            const data = zoneDataMap[zone.id];
            const level = data?.level || 'green';
            const density = data?.density ?? 0.0;
            const risk = data?.risk ?? 0.0;
            const isSelected = zone.id === selectedZoneId;
            const styles = getLevelStyles(level, isSelected);

            // Scale normalized [0, 1] points to [0, 1000] x [0, 700]
            const svgPoints = zone.points
              .map(([x, y]) => `${x * 1000},${y * 700}`)
              .join(' ');

            // Calculate center for label placement
            const cx =
              (zone.points.reduce((acc, p) => acc + p[0], 0) / zone.points.length) * 1000;
            const cy =
              (zone.points.reduce((acc, p) => acc + p[1], 0) / zone.points.length) * 700;

            return (
              <g
                key={zone.id}
                onClick={() => onSelectZone(zone.id)}
                className="cursor-pointer transition-transform duration-150 group"
              >
                {/* Zone Boundary Polygon */}
                <polygon
                  points={svgPoints}
                  className={`${styles.polygonClass} transition-colors duration-300`}
                  filter={level === 'red' ? 'url(#glow-red)' : undefined}
                />

                {/* Center Badge / Information Label */}
                <g transform={`translate(${cx}, ${cy})`}>
                  {/* Backdrop for text legibility */}
                  <rect
                    x="-75"
                    y="-24"
                    width="150"
                    height="48"
                    rx="6"
                    className="fill-[#080D1A]/90 stroke-slate-700/80 stroke-[0.8]"
                  />

                  {/* Zone Name */}
                  <text
                    x="0"
                    y="-6"
                    textAnchor="middle"
                    className="fill-slate-200 text-[11px] font-bold tracking-wide"
                  >
                    {zone.name}
                  </text>

                  {/* Density badge: "3.8 p/m²" */}
                  <text
                    x="0"
                    y="14"
                    textAnchor="middle"
                    className={`font-mono text-[11px] font-bold ${
                      level === 'red'
                        ? 'fill-rose-400'
                        : level === 'amber'
                        ? 'fill-amber-400'
                        : 'fill-emerald-400'
                    }`}
                  >
                    {density.toFixed(1)} p/m² · {risk.toFixed(0)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default ZoneMap;
