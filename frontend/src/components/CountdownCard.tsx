import React from 'react';
import type { ZoneTickData } from './ZoneMap';

interface CountdownCardProps {
  zoneData: ZoneTickData | null;
  zoneName?: string;
}

export const CountdownCard: React.FC<CountdownCardProps> = ({
  zoneData,
  zoneName = 'Barricade Corridor',
}) => {
  const risk = zoneData?.risk ?? 0;
  const etaSeconds = zoneData?.eta_s ?? null;
  const level = zoneData?.level ?? 'green';
  const isElevated = level === 'amber' || level === 'red' || risk >= 40;

  const formatCountdown = (secs: number | null): string => {
    if (secs === null) return 'STANDBY';
    if (secs <= 0) return '00:00 (BREACH)';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Circular gauge calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, risk)) / 100;
  const strokeDashoffset = circumference - progress * circumference;

  const gaugeColor =
    level === 'red'
      ? '#f43f5e'
      : level === 'amber'
      ? '#fbbf24'
      : '#10b981';

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 backdrop-blur-md ${
        level === 'red'
          ? 'bg-rose-950/40 border-rose-600/70 shadow-[0_0_35px_rgba(244,63,94,0.35)]'
          : level === 'amber'
          ? 'bg-amber-950/30 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
          : 'bg-[#0D1322]/80 border-cyan-900/40'
      }`}
    >
      {/* Background ambient gradient glow */}
      {isElevated && (
        <div
          className={`absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-25 ${
            level === 'red' ? 'bg-rose-500' : 'bg-amber-500'
          }`}
        />
      )}

      {!isElevated ? (
        // Green / Nominal Safe State
        <div className="flex items-center justify-between h-full min-h-[96px]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-xs uppercase tracking-widest font-semibold text-emerald-400">
                All Zones Nominal
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-100 mt-1 tracking-tight">
              Venue Flow Stable
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Crowd densities &lt; 1.5 p/m² across all 8 complex sectors
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] uppercase font-mono text-slate-400">Peak Risk</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {risk.toFixed(0)}
                <span className="text-xs text-slate-500">/100</span>
              </div>
            </div>
            <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        // Amber / Red Critical Countdown State (THE HERO)
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  level === 'red' ? 'bg-rose-500 animate-ping' : 'bg-amber-400'
                }`}
              />
              <span
                className={`text-xs uppercase tracking-widest font-bold font-mono ${
                  level === 'red' ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {level === 'red' ? '⚠ CRITICAL DENSITY ALERT' : 'ELEVATED CROWD BUILDUP'}
              </span>
              <span className="text-xs bg-slate-900/80 px-2 py-0.5 rounded text-slate-300 font-medium">
                {zoneName}
              </span>
            </div>

            <div className="mt-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Estimated Time to Critical Density (4.0 p/m²)
              </div>
              <div
                className={`text-4xl md:text-5xl lg:text-6xl font-mono font-black tracking-tight mt-1 ${
                  level === 'red'
                    ? 'text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.7)]'
                    : 'text-amber-300 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                }`}
              >
                CRITICAL IN {formatCountdown(etaSeconds)}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3 text-xs font-mono text-slate-300">
              <div>
                Density:{' '}
                <span className="font-bold text-white">
                  {zoneData?.density.toFixed(2)} p/m²
                </span>
              </div>
              <div className="text-slate-600">|</div>
              <div>
                Rate:{' '}
                <span className="font-bold text-amber-300">
                  +{zoneData?.trend_slope.toFixed(2)} p/m²/min
                </span>
              </div>
              <div className="text-slate-600">|</div>
              <div>
                Jam Index:{' '}
                <span className="font-bold text-rose-400">
                  {((zoneData?.jam ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Circular Risk Gauge (Risk / 100) */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background Ring */}
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  className="stroke-slate-800/80"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Progress Ring */}
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  stroke={gaugeColor}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              {/* Center Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-mono font-black text-white leading-none">
                  {risk.toFixed(0)}
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mt-0.5">
                  / 100 Risk
                </span>
              </div>
            </div>
            <span
              className={`text-[11px] font-mono uppercase font-bold mt-1 px-2 py-0.5 rounded border ${
                level === 'red'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {level.toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CountdownCard;
