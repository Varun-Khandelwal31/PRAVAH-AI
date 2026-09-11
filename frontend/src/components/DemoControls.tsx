import React, { useState, useEffect, useRef } from 'react';

interface DemoControlsProps {
  onEscalate?: () => void;
  onClear?: () => void;
  onCameraAdded?: (camData: any) => void;
  sourceMode?: string;
}

export const DemoControls: React.FC<DemoControlsProps> = ({
  onEscalate,
  onClear,
  onCameraAdded,
  sourceMode = 'video',
}) => {
  const [isHidden, setIsHidden] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isEscalating, setIsEscalating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTrainingMode =
    (sourceMode || 'simulator').toLowerCase() === 'simulator' ||
    (sourceMode || '').toLowerCase() === 'timeline';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setToastMsg('Uploading video feed...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/cameras/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      setToastMsg('Camera added — analyzing');
      onCameraAdded?.(data);
      setTimeout(() => setToastMsg(null), 5000);
    } catch {
      setToastMsg('Failed to add camera');
      setTimeout(() => setToastMsg(null), 3000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Keyboard shortcut handler: A = Escalate, C / R = Clear, H = Hide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toUpperCase();
      if (key === 'A' && isTrainingMode) {
        e.preventDefault();
        handleEscalate();
      } else if ((key === 'C' || key === 'R') && isTrainingMode) {
        e.preventDefault();
        handleClear();
      } else if (key === 'H') {
        setIsHidden((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTrainingMode]);

  return (
    <>
      {/* Toast Notification when Camera Added */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-cyan-950/95 border border-cyan-400 text-cyan-200 shadow-2xl backdrop-blur-md font-mono text-xs animate-bounce">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-bold">{toastMsg}</span>
        </div>
      )}

      {isHidden ? (
        <button
          onClick={() => setIsHidden(false)}
          className="fixed bottom-4 right-4 z-40 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-mono text-xs shadow-lg backdrop-blur-md transition-all opacity-70 hover:opacity-100"
          title="Show Demo Controls (H)"
        >
          ⚙ Show Controls
        </button>
      ) : (
        <div className="fixed bottom-4 right-4 z-40 bg-[#0B111F]/95 backdrop-blur-md border border-cyan-800/80 rounded-xl p-3 shadow-2xl shadow-cyan-950/60 flex items-center gap-3">
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
            {/* Hidden Video File Picker */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="video/*"
              className="hidden"
            />

            {/* ＋ Upload Video button (Always enabled in LIVE VIDEO & other modes) */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/70 flex items-center gap-1.5 transition-all shadow-md hover:scale-105 active:scale-95"
              title="Upload local crowd video file to dynamically register a new CCTV camera without restarting"
            >
              <span>{isUploading ? '⏳' : '＋'}</span>
              <span>{isUploading ? 'Uploading...' : 'Upload Video'}</span>
            </button>

            {/* Escalate button (Training mode only) */}
            <button
              onClick={isTrainingMode ? handleEscalate : undefined}
              disabled={!isTrainingMode}
              title={
                !isTrainingMode
                  ? 'Scenario injection is available in Training Mode only — live data cannot be scripted.'
                  : 'Inject drill scenario (A)'
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-md ${
                !isTrainingMode
                  ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                  : isEscalating
                  ? 'bg-rose-600 text-white shadow-rose-900/50 animate-pulse'
                  : 'bg-rose-700/80 hover:bg-rose-600 text-rose-100 border border-rose-500/40 hover:scale-105'
              }`}
            >
              <span>⚡</span>
              Escalate [A]
            </button>

            {/* Clear button (Training mode only) */}
            <button
              onClick={isTrainingMode ? handleClear : undefined}
              disabled={!isTrainingMode}
              title={
                !isTrainingMode
                  ? 'Scenario injection is available in Training Mode only — live data cannot be scripted.'
                  : 'Reset nominal (C)'
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                !isTrainingMode
                  ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:scale-105'
              }`}
            >
              Clear [C]
            </button>

            <button
              onClick={() => setIsHidden(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all text-xs"
              title="Hide controls for presentation (H)"
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
      )}
    </>
  );
};

export default DemoControls;
