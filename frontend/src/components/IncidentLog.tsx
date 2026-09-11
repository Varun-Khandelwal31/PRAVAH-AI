import React from 'react';

interface IncidentItem {
  id: string;
  timestamp: string;
  zone: string;
  severity: 'nominal' | 'amber' | 'red';
  message: string;
}

interface IncidentLogProps {
  incidents?: IncidentItem[];
}

export const IncidentLog: React.FC<IncidentLogProps> = ({ incidents = [] }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">
        Timeline Incident Audit
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[220px]">
        {incidents.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No incidents recorded in session</p>
        ) : (
          incidents.map((inc) => (
            <div
              key={inc.id}
              className="p-2 rounded bg-slate-800/60 border border-slate-700/50 flex justify-between items-center text-xs"
            >
              <div>
                <span className="font-semibold text-slate-200">{inc.zone}</span>
                <p className="text-slate-400 mt-0.5">{inc.message}</p>
              </div>
              <span className="text-slate-500 font-mono">{inc.timestamp}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default IncidentLog;
