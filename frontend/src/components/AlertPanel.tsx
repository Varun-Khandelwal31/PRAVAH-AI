import React, { useState, useEffect } from 'react';

export interface AlertData {
  id: string;
  ts: string;
  zone: string;
  zone_id: string;
  eta_s: number | null;
  actions: string[];
  density?: number;
  risk?: number;
  text_hindi?: string;
  audio_url?: string | null;
  via?: string;
  provider?: string;
  type?: string;
  message?: string;
}

export interface IncidentRecord {
  ts: string;
  event: string;
  zone_id: string;
  zone: string;
  density?: number;
  risk?: number;
  eta_s?: number | null;
  actions?: string[];
  action?: string;
}

interface AlertPanelProps {
  alerts: AlertData[];
  criticalZoneName?: string;
  audioUrl?: string | null;
}

type ActionState = 'PENDING' | 'DOING' | 'DONE';

export const AlertPanel: React.FC<AlertPanelProps> = ({
  alerts = [],
  criticalZoneName = 'Barricade Corridor',
  audioUrl = null,
}) => {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const activeAlert = alerts.length > 0 ? alerts[0] : null;
  const targetZoneTitle = (activeAlert?.zone || criticalZoneName).toUpperCase();

  // Fetch incident timeline from /api/incidents
  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await fetch('/api/incidents');
        if (res.ok) {
          const data = await res.json();
          setIncidents(data.slice(-15).reverse()); // latest 15 events
        }
      } catch {
        // Handled silently
      }
    };

    fetchIncidents();
    const interval = setInterval(fetchIncidents, 3000);
    return () => clearInterval(interval);
  }, []);

  const defaultActions = [
    'Open Gate 2 for overflow',
    'Divert flow via Side Passage',
    'Dispatch 2 marshals',
  ];

  const actions = activeAlert?.actions || defaultActions;

  const toggleActionState = (action: string) => {
    setActionStates((prev) => {
      const current = prev[action] || 'PENDING';
      const nextState: ActionState =
        current === 'PENDING' ? 'DOING' : current === 'DOING' ? 'DONE' : 'PENDING';
      return { ...prev, [action]: nextState };
    });
  };

  const effectiveAudioUrl = activeAlert?.audio_url || audioUrl;

  const handlePlayVoice = () => {
    setIsPlayingAudio(true);
    if (effectiveAudioUrl) {
      const audio = new Audio(effectiveAudioUrl);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      audio.play().catch(() => setIsPlayingAudio(false));
    } else {
      // Browser Web Speech fallback or brief simulation
      try {
        const utterance = new SpeechSynthesisUtterance(
          activeAlert?.text_hindi || 'ज़ोन 3 में भीड़ खतरनाक स्तर पर पहुँच रही है — गेट 2 खोलें'
        );
        utterance.lang = 'hi-IN';
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setTimeout(() => setIsPlayingAudio(false), 3000);
      }
    }
  };

  const getEventBadge = (event: string) => {
    switch (event) {
      case 'red':
      case 'alert':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
      case 'amber':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'cleared':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="bg-[#0D1322]/90 backdrop-blur-md border border-cyan-950/60 rounded-xl p-4 flex flex-col shadow-xl shadow-cyan-950/20 space-y-4">
      {/* Alert Header / Critical Card */}
      {activeAlert ? (
        <div className="p-4 rounded-xl bg-rose-950/60 border-2 border-rose-500/80 shadow-[0_0_25px_rgba(244,63,94,0.35)] animate-red-glow">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
              <h3 className="text-sm font-black tracking-wider uppercase text-rose-200">
                ⚠ CRITICAL RISK — {targetZoneTitle}
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold bg-rose-900 text-rose-200 px-2 py-0.5 rounded border border-rose-700">
              DISPATCH ACTIVE
            </span>
          </div>
          <p className="text-xs text-rose-300/80 mt-1 font-mono">
            Critical threshold reached · ETA: {activeAlert.eta_s ? `${activeAlert.eta_s}s` : 'IMMINENT'}
          </p>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
              Emergency Dispatch Standby
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">NO ACTIVE INCIDENT</span>
        </div>
      )}

      {/* 3-Item Action Checklist */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Marshal Intervention Checklist
          </h4>
          <span className="text-[10px] font-mono text-slate-500">CLICK TO UPDATE</span>
        </div>

        <div className="space-y-2">
          {actions.map((act, idx) => {
            const state = actionStates[act] || 'PENDING';
            const stateStyles =
              state === 'DONE'
                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                : state === 'DOING'
                ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700';

            return (
              <div
                key={idx}
                onClick={() => toggleActionState(act)}
                className={`p-2.5 rounded-lg border flex items-center justify-between transition-all duration-150 cursor-pointer ${stateStyles}`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                      state === 'DONE'
                        ? 'bg-emerald-500 text-black'
                        : state === 'DOING'
                        ? 'bg-cyan-500 text-black'
                        : 'border border-slate-600'
                    }`}
                  >
                    {state === 'DONE' ? '✓' : state === 'DOING' ? '⏳' : idx + 1}
                  </div>
                  <span className="text-xs font-medium tracking-wide">{act}</span>
                </div>

                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                    state === 'DONE'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : state === 'DOING'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {state}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice-Call Card (Sarvam AI / Edge-TTS Hindi Alert) */}
      <div className="p-3.5 rounded-xl bg-[#090E1B] border border-cyan-900/50 shadow-md">
        <div className="flex justify-between items-center mb-1.5">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-indigo-500/20 text-indigo-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </span>
            <span className="text-xs font-bold text-slate-200">
              Calling Marshal (Zone 3) · Hindi
            </span>
          </div>

          <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
            {isPlayingAudio
              ? 'BROADCASTING...'
              : activeAlert?.via || activeAlert?.provider || 'SARVAM AI / EDGE-TTS'}
          </span>
        </div>

        {/* Hindi Transcript */}
        <p className="text-xs text-amber-200/90 bg-slate-900/80 p-2.5 rounded-lg border border-amber-500/20 font-medium leading-relaxed mb-2.5">
          "{activeAlert?.text_hindi || 'ज़ोन 3 में भीड़ खतरनाक स्तर पर पहुँच रही है — गेट 2 खोलें'}"
        </p>

        {/* Play Button & Audio Visualizer */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handlePlayVoice}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              isPlayingAudio
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-900/40'
            }`}
          >
            {isPlayingAudio ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                Playing Alert...
              </>
            ) : (
              <>
                <span>▶</span>
                Play Voice Broadcast
              </>
            )}
          </button>

          {isPlayingAudio && (
            <div className="flex items-center gap-1 font-mono text-[10px] text-cyan-400">
              <span className="animate-bounce">|</span>
              <span className="animate-bounce delay-75">||</span>
              <span className="animate-bounce delay-150">|||</span>
              <span className="animate-bounce delay-75">||</span>
              <span className="animate-bounce">|</span>
            </div>
          )}
        </div>
      </div>

      {/* Vertical Timeline of Incident Events (/api/incidents) */}
      <div className="flex-1 min-h-[160px] flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Incident Event Audit
          </h4>
          <span className="text-[10px] font-mono text-slate-500">LIVE FEED</span>
        </div>

        <div className="flex-1 overflow-y-auto max-h-48 pr-1 space-y-2">
          {incidents.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-3 text-center bg-slate-900/30 rounded border border-slate-800">
              No critical incidents recorded yet
            </div>
          ) : (
            incidents.map((inc, idx) => {
              const timeStr = inc.ts ? inc.ts.split('T')[1]?.split('.')[0] : '00:00:00';
              return (
                <div
                  key={idx}
                  className="p-2 rounded bg-[#090E1B] border border-slate-800/80 flex justify-between items-start text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded border ${getEventBadge(
                          inc.event
                        )}`}
                      >
                        {inc.event}
                      </span>
                      <span className="font-semibold text-slate-200">
                        {inc.zone || inc.zone_id}
                      </span>
                    </div>
                    {inc.actions && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Actions: {inc.actions.join(', ')}
                      </p>
                    )}
                    {inc.action && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{inc.action}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">
                    {timeStr}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertPanel;
