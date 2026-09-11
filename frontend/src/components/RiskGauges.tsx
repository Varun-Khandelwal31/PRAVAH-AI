import React from 'react';
import type { ZoneConfig, ZoneTickData } from './ZoneMap';

interface RiskGaugesProps {
  zones: ZoneConfig[];
  zoneDataMap: Record<string, ZoneTickData>;
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
}

export const RiskGauges: React.FC<RiskGaugesProps> = ({
  zones,
  zoneDataMap,
  selectedZoneId,
  onSelectZone,
}) => {
  // Merge zone config with latest tick metrics
  const combined = zones.map((z) => {
    const data = zoneDataMap[z.id];
    return {
      id: z.id,
      name: z.name,
      density: data?.density ?? 0.0,
      risk: data?.risk ?? 0.0,
      level: data?.level ?? 'green',
      slope: data?.trend_slope ?? 0.0,
    };
  });

  // Sort by risk descending
  combined.sort((a, b) => b.risk - a.risk);

  const getBarColor = (level: string) => {
    switch (level) {
      case 'red':
        return 'bg-gradient-to-r from-rose-600 to-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]';
      case 'amber':
        return 'bg-gradient-to-r from-amber-600 to-amber-400';
      case 'green':
      default:
        return 'bg-gradient-to-r from-emerald-600 to-emerald-400';
    }
  };

  const getTrendIcon = (slope: number) => {
    if (slope > 0.05) return <span className="text-amber-400 font-bold">↑</span>;
    if (slope < -0.05) return <span className="text-emerald-400 font-bold">↓</span>;
    return <span className="text-slate-500">→</span>;
  };

  return (
    <div className="bg-[#0D1322]/90 backdrop-blur-md border border-cyan-950/60 rounded-xl p-4 flex flex-col shadow-xl shadow-cyan-950/20">
      <div className="flex justify-between items-center pb-3 border-b border-cyan-900/30 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
          Sector Risk Priority
          <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.2 rounded border border-cyan-800/60 font-mono">
            SORTED DESC
          </span>
        </h3>
        <span className="text-[10px] font-mono text-slate-500">Index / 100</span>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
        {combined.map((item, idx) => {
          const isSelected = item.id === selectedZoneId;
          const barWidth = `${Math.min(100, Math.max(0, item.risk))}%`;

          return (
            <div
              key={item.id}
              onClick={() => onSelectZone(item.id)}
              className={`p-2.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-slate-800/80 border-cyan-500/80 shadow-md shadow-cyan-950/40'
                  : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-baseline mb-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500 w-4">
                    #{idx + 1}
                  </span>
                  <span
                    className={`font-semibold tracking-wide ${
                      item.level === 'red'
                        ? 'text-rose-300 font-bold'
                        : item.level === 'amber'
                        ? 'text-amber-200'
                        : 'text-slate-200'
                    }`}
                  >
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono">
                  <span className="text-[11px] text-slate-400">
                    {item.density.toFixed(1)} p/m² {getTrendIcon(item.slope)}
                  </span>
                  <span
                    className={`font-bold text-xs ${
                      item.level === 'red'
                        ? 'text-rose-400'
                        : item.level === 'amber'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {item.risk.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Horizontal Risk Bar */}
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor(
                    item.level
                  )}`}
                  style={{ width: barWidth }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RiskGauges;
