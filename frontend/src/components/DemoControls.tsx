import React, { useState, useEffect } from 'react';

interface DemoControlsProps {
  onEscalate?: () => void;
  onClear?: () => void;
}

export const DemoControls: React.FC<DemoControlsProps> = ({ onEscalate, onClear }) => {
  const [isHidden, setIsHidden] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isEscalating, setIsEscalating] = useState(false);

  const handleEscalate = async () => {
    setIsEscalating(true);
    setStatusMsg('Triggering Escalation...');
    try {
      const res = await fetch('/demo/escalate', { method: 'POST' });
      if (res.ok) {
        setStatusMsg('Escalation Active (A)');
      } else {
        setStatusMsg('Escalation failed');
      }
    } catch {
      setStatusMsg('API Error');
    }
    onEscalate?.();
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleClear = async () => {
    setIsEscalating(false);
    setStatusMsg('Resetting to Nominal...');
    try {
      const res = await fetch('/demo/clear', { method: 'POST' });
      if (res.ok) {
        setStatusMsg('Nominal Restored (C)');
      }
    } catch {
      setStatusMsg('API Error');
    }
    onClear?.();
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Keyboard shortcut handler: A = Escalate, C / R = Clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toUpperCase();
      if (key === 'A') {
        e.preventDefault();
        handleEscalate();
      } else if (key === 'C' || key === 'R') {
        e.preventDefault();
        handleClear();
      } else if (key === 'H') {
        setIsHidden((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isHidden) {
    return (
      <button
        onClick={() => setIsHidden(false)}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-mono text-xs shadow-lg backdrop-blur-md transition-all opacity-70 hover:opacity-100"
        title="Show Demo Controls (H)"
      >
        ⚙ Show Controls
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-[#0B111F]/95 backdrop-blur-md border border-cyan-800/80 rounded-xl p-3 shadow-2xl shadow-cyan-950/60 flex items-center gap-3">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="text-[11px] font-bold font-mono uppercase text-cyan-300">
            DEMO COMMANDS
          </span>
        </div>
        <span className="text-[9px] font-mono text-slate-400">
          Keys: <kbd className="text-white font-bold">A</kbd> Escalate ·{' '}
          <kbd className="text-white font-bold">C</kbd> Clear
        </span>
      </div>

      <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
        <button
          onClick={handleEscalate}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-md ${
            isEscalating
              ? 'bg-rose-600 text-white shadow-rose-900/50 animate-pulse'
              : 'bg-rose-700/80 hover:bg-rose-600 text-rose-100 border border-rose-500/40'
          }`}
        >
          <span>⚡</span>
          Escalate [A]
        </button>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
        >
          Clear [C]
        </button>

        <button
          onClick={() => setIsHidden(true)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all text-xs"
          title="Hide controls for screenshot (H)"
        >
          ✕
        </button>
      </div>

      {statusMsg && (
        <div className="absolute -top-7 right-0 text-[10px] font-mono bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800 shadow">
          {statusMsg}
        </div>
      )}
    </div>
  );
};

export default DemoControls;
