import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ZoneConfig, ZoneTickData } from './ZoneMap';
import type { AlertData } from './AlertPanel';

interface LiveCommandCenterProps {
  zones: ZoneConfig[];
  zoneDataMap: Record<string, ZoneTickData>;
  alerts: AlertData[];
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
  wsConnected: boolean;
  sourceMode: string;
  camerasStatus?: Record<string, { online: boolean; last_seen_s?: number }>;
  onOpenLanding?: () => void;
}

interface CCTVCamera {
  id: string;
  zoneId: string;
  zoneIndex: number;
  label: string;
  name: string;
  image: string;
  defaultDensity: number;
  defaultRisk: number;
}

const CAMERAS: CCTVCamera[] = [
  { id: 'cam-01', zoneId: 'north_entry', zoneIndex: 1, label: 'CAM-01', name: 'Main Entry', image: '/images/cctv_1.jpg', defaultDensity: 2.8, defaultRisk: 22 },
  { id: 'cam-02', zoneId: 'ticket_queue', zoneIndex: 2, label: 'CAM-02', name: 'Queue Corridor', image: '/images/cctv_2.jpg', defaultDensity: 3.2, defaultRisk: 38 },
  { id: 'cam-03', zoneId: 'barricade_corridor', zoneIndex: 3, label: 'CAM-03', name: 'Barricade Corridor', image: '/images/cctv_4.jpg', defaultDensity: 4.6, defaultRisk: 87 },
  { id: 'cam-04', zoneId: 'side_passage', zoneIndex: 4, label: 'CAM-04', name: 'Side Passage', image: '/images/cctv_3.jpg', defaultDensity: 2.1, defaultRisk: 41 },
  { id: 'cam-05', zoneId: 'main_concourse', zoneIndex: 5, label: 'CAM-05', name: 'Main Concourse', image: '/images/cctv_5.jpg', defaultDensity: 3.6, defaultRisk: 28 },
  { id: 'cam-06', zoneId: 'gate_2_overflow', zoneIndex: 7, label: 'CAM-06', name: 'Gate 2 Overflow', image: '/images/cctv_6.jpg', defaultDensity: 1.9, defaultRisk: 20 },
];

// 8 Zones spatial layout matching the temple aerial photograph seamlessly
interface MapZoneLayout {
  index: number;
  id: string;
  polygon: string;
  labelPos: { x: number; y: number };
  defaultDensity: number;
  defaultRisk: number;
  riskBadge: { label: string; color: string };
}

const MAP_ZONES: MapZoneLayout[] = [
  {
    index: 1,
    id: 'north_entry',
    polygon: '8,6 46,6 46,38 8,38',
    labelPos: { x: 27, y: 22 },
    defaultDensity: 1.4,
    defaultRisk: 22,
    riskBadge: { label: 'Low', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
  },
  {
    index: 2,
    id: 'ticket_queue',
    polygon: '48,6 66,6 66,38 48,38',
    labelPos: { x: 57, y: 22 },
    defaultDensity: 2.2,
    defaultRisk: 38,
    riskBadge: { label: 'Low', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
  },
  {
    index: 3,
    id: 'barricade_corridor',
    polygon: '68,6 94,6 94,40 68,40',
    labelPos: { x: 81, y: 23 },
    defaultDensity: 4.6,
    defaultRisk: 87,
    riskBadge: { label: 'Critical', color: 'bg-rose-950/80 text-rose-400 border-rose-600/80' },
  },
  {
    index: 4,
    id: 'side_passage',
    polygon: '8,40 46,40 46,68 8,68',
    labelPos: { x: 27, y: 54 },
    defaultDensity: 2.8,
    defaultRisk: 56,
    riskBadge: { label: 'Medium', color: 'bg-amber-950/60 text-amber-300 border-amber-800/60' },
  },
  {
    index: 5,
    id: 'main_concourse',
    polygon: '48,40 66,40 66,68 48,68',
    labelPos: { x: 57, y: 54 },
    defaultDensity: 3.8,
    defaultRisk: 72,
    riskBadge: { label: 'High', color: 'bg-orange-950/60 text-orange-300 border-orange-700/60' },
  },
  {
    index: 6,
    id: 'east_wing',
    polygon: '68,42 94,42 94,68 68,68',
    labelPos: { x: 81, y: 55 },
    defaultDensity: 2.3,
    defaultRisk: 41,
    riskBadge: { label: 'Low', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
  },
  {
    index: 7,
    id: 'gate_2_overflow',
    polygon: '12,70 47,70 47,94 12,94',
    labelPos: { x: 30, y: 82 },
    defaultDensity: 1.9,
    defaultRisk: 28,
    riskBadge: { label: 'Low', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
  },
  {
    index: 8,
    id: 'exit_lane',
    polygon: '49,70 88,70 88,94 49,94',
    labelPos: { x: 68, y: 82 },
    defaultDensity: 1.6,
    defaultRisk: 20,
    riskBadge: { label: 'Low', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' },
  },
];

// LIVE ANIMATED CCTV CAMERA COMPONENT WITH MOVING YOLO BOUNDING BOXES
const LiveCCTVTile: React.FC<{
  cam: CCTVCamera;
  liveDensity: number;
  isSelected: boolean;
  isOnline?: boolean;
  onSelect: () => void;
  onInspect: () => void;
}> = ({ cam, liveDensity, isSelected, isOnline = true, onSelect, onInspect }) => {
  const isDanger = liveDensity >= 4.0;
  const [streamFailed, setStreamFailed] = useState(false);
  const streamUrl = `/api/feed/${cam.id.toLowerCase()}.mjpeg`;

  // 4 pedestrian detection boxes with GPU-accelerated CSS wander physics (Zero React re-render overhead)
  const boxes = useMemo(() => [
    { id: 1, x: 18, y: 36, w: 14, h: 28, conf: 0.94, isCrit: isDanger, animClass: 'animate-wander-1' },
    { id: 2, x: 44, y: 42, w: 13, h: 26, conf: 0.91, isCrit: false, animClass: 'animate-wander-2' },
    { id: 3, x: 68, y: 32, w: 15, h: 30, conf: 0.88, isCrit: isDanger, animClass: 'animate-wander-3' },
    { id: 4, x: 32, y: 56, w: 12, h: 24, conf: 0.96, isCrit: false, animClass: 'animate-wander-4' },
  ], [isDanger]);

  // Standard 1 Hz surveillance timecode overlay (low-battery, pauses on inactive tabs)
  const [timeStr, setTimeStr] = useState<string>(() => new Date().toTimeString().split(' ')[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) {
        setTimeStr(new Date().toTimeString().split(' ')[0]);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all flex flex-col justify-between bg-black ${
        isSelected
          ? 'border-cyan-400 shadow-md shadow-cyan-950'
          : isDanger
          ? 'border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
          : 'border-slate-800/90 hover:border-slate-700'
      }`}
      style={{ minHeight: '130px' }}
    >
      {/* Real Photographic CCTV Frame / Live Annotated MJPEG Stream */}
      <img
        src={streamFailed ? cam.image : streamUrl}
        alt={cam.name}
        onError={() => setStreamFailed(true)}
        className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity filter contrast-105 brightness-95"
      />

      {/* CCTV Scanlines & Glitch Atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* Overlaid Dynamic Animated AI Bounding Boxes (Active when offline / fallback) */}
      {streamFailed && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
          {boxes.map((b) => (
            <g key={b.id} className={b.isCrit ? 'animate-pulse' : b.animClass}>
              {/* Box frame */}
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill="none"
                stroke={b.isCrit ? '#ef4444' : '#10b981'}
                strokeWidth="1.2"
                className={b.isCrit ? 'animate-pulse' : ''}
              />
              {/* Corner brackets */}
              <line x1={b.x} y1={b.y} x2={b.x + 3} y2={b.y} stroke={b.isCrit ? '#ef4444' : '#38bdf8'} strokeWidth="1.6" />
              <line x1={b.x} y1={b.y} x2={b.x + 3} y2={b.y} stroke={b.isCrit ? '#ef4444' : '#38bdf8'} strokeWidth="1.6" />
              <line x1={b.x + b.w} y1={b.y} x2={b.x + b.w - 3} y2={b.y} stroke={b.isCrit ? '#ef4444' : '#38bdf8'} strokeWidth="1.6" />
              <line x1={b.x + b.w} y1={b.y} x2={b.x + b.w - 3} y2={b.y} stroke={b.isCrit ? '#ef4444' : '#38bdf8'} strokeWidth="1.6" />
              
              {/* Confidence Badge */}
              <rect x={b.x} y={b.y - 4} width={13} height={4} fill={b.isCrit ? '#ef4444' : '#059669'} rx={0.5} />
              <text x={b.x + 1} y={b.y - 1} fill="#ffffff" fontSize="2.8" fontWeight="bold" fontFamily="monospace">
                .{Math.round(b.conf * 100)}
              </text>
            </g>
          ))}
        </svg>
      )}

      {/* Top Banner: Timestamp & Real Delivery Status */}
      <div className="relative z-10 flex items-center justify-between p-1.5 bg-black/40 backdrop-blur-[2px]">
        <div className="flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOnline
                ? cam.id === 'cam-live'
                  ? 'bg-cyan-400 animate-pulse'
                  : 'bg-emerald-400'
                : 'bg-rose-500 animate-ping'
            }`}
          />
          <span className={`font-mono text-[8px] font-bold ${cam.id === 'cam-live' ? 'text-cyan-300' : 'text-slate-300'}`}>
            {cam.id === 'cam-live' ? 'CAM-LIVE' : timeStr}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {cam.id === 'cam-live' ? (
            <span
              className={`backdrop-blur-sm border text-[8px] font-mono font-black px-1.5 py-0.2 rounded shadow-[0_0_6px_rgba(6,182,212,0.5)] ${
                isOnline
                  ? 'bg-cyan-950/90 border-cyan-400/80 text-cyan-300'
                  : 'bg-rose-950/90 border-rose-500/80 text-rose-300'
              }`}
            >
              {isOnline ? 'WEBCAM' : 'OFFLINE'}
            </span>
          ) : isOnline ? (
            <span className="bg-black/80 backdrop-blur-sm border border-emerald-500/50 text-emerald-400 text-[8px] font-mono font-black px-1.5 py-0.2 rounded">
              ONLINE
            </span>
          ) : (
            <span className="bg-rose-950/80 backdrop-blur-sm border border-rose-500/60 text-rose-300 text-[8px] font-mono font-black px-1.5 py-0.2 rounded animate-pulse">
              STALLED
            </span>
          )}
        </div>
      </div>

      {/* Center Hover Action: Inspect AI Feed */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 backdrop-blur-[1px] transition-all z-20 pointer-events-none">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInspect();
          }}
          className="pointer-events-auto px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-[10px] shadow-lg shadow-cyan-950 flex items-center gap-1.5 transition-transform hover:scale-105 active:scale-95"
        >
          <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          INSPECT AI
        </button>
      </div>

      {/* Bottom Translucent Info Bar */}
      <div className="relative z-10 bg-gradient-to-t from-black via-black/90 to-transparent px-2 py-1.5 border-t border-white/5 flex items-center justify-between text-[9px] font-mono">
        <div className="flex items-center gap-1.5 min-w-0 pr-1">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isDanger
                ? 'bg-rose-500 animate-ping'
                : isOnline
                ? 'bg-emerald-400'
                : 'bg-rose-500'
            }`}
            title={isOnline ? 'Active (delivering frames)' : 'Stalled (no frames in 5s)'}
          />
          <span className="text-slate-200 font-bold whitespace-nowrap overflow-hidden text-ellipsis">
            {cam.label} · {cam.name}
          </span>
        </div>
        <span
          className={`font-black flex-shrink-0 whitespace-nowrap ${
            isDanger ? 'text-rose-400' : 'text-slate-300'
          }`}
        >
          {liveDensity.toFixed(1)} p/m²
        </span>
      </div>
    </div>
  );
};

export const LiveCommandCenter: React.FC<LiveCommandCenterProps> = ({
  zones,
  zoneDataMap,
  alerts,
  selectedZoneId,
  onSelectZone,
  wsConnected,
  sourceMode,
  camerasStatus,
  onOpenLanding,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('14:32:07');
  const [currentDate, setCurrentDate] = useState<string>('Aug 28, 2026');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(260); // 04:20 initial
  const [showAlertModal, setShowAlertModal] = useState<boolean>(false);
  const [sparklinePoints, setSparklinePoints] = useState<number[]>([18, 22, 20, 24, 28, 25, 32, 29, 38, 48, 52, 50, 54, 52, 48]);
  const [inspectingCam, setInspectingCam] = useState<CCTVCamera | null>(null);
  const [inspectorLayers, setInspectorLayers] = useState({
    boxes: true,
    vectors: true,
    heatmap: true,
    boundary: true,
  });
  const [isEscalating, setIsEscalating] = useState<boolean>(false);
  const [ecoMode, setEcoMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pravahai_eco_mode') === 'true';
    } catch {
      return false;
    }
  });

  // Mode classification and truthful display badge (UPDATE 3)
  const modeBadge = useMemo(() => {
    const mode = (sourceMode || 'simulator').toLowerCase();
    if (mode.includes('video') && mode.includes('webcam')) {
      return {
        label: 'LIVE VIDEO + WEBCAM',
        textColor: 'text-cyan-300',
        bgColor: 'bg-cyan-950/80',
        borderColor: 'border-cyan-500/70',
        dotColor: 'bg-cyan-400',
      };
    }
    if (mode.includes('video')) {
      return {
        label: 'LIVE VIDEO',
        textColor: 'text-cyan-300',
        bgColor: 'bg-cyan-950/80',
        borderColor: 'border-cyan-500/70',
        dotColor: 'bg-cyan-400',
      };
    }
    if (mode.includes('webcam')) {
      return {
        label: 'LIVE WEBCAM',
        textColor: 'text-emerald-300',
        bgColor: 'bg-emerald-950/80',
        borderColor: 'border-emerald-500/70',
        dotColor: 'bg-emerald-400',
      };
    }
    return {
      label: 'TRAINING MODE',
      textColor: 'text-amber-300',
      bgColor: 'bg-amber-950/80',
      borderColor: 'border-amber-500/70',
      dotColor: 'bg-amber-400',
    };
  }, [sourceMode]);

  const isTrainingMode = useMemo(() => {
    const mode = (sourceMode || 'simulator').toLowerCase();
    return mode === 'simulator' || mode === 'timeline';
  }, [sourceMode]);

  // Dynamic Webcam detection & camera array with CAM-LIVE
  const isWebcamActive = useMemo(() => {
    return (
      (sourceMode && sourceMode.toLowerCase().includes('webcam')) ||
      zones.some((z) => z.id === 'live_hall') ||
      Boolean(zoneDataMap['live_hall'])
    );
  }, [sourceMode, zones, zoneDataMap]);

  const displayedCameras = useMemo(() => {
    if (!isWebcamActive) return CAMERAS;
    const webcamCam: CCTVCamera = {
      id: 'cam-live',
      zoneId: 'live_hall',
      zoneIndex: 9,
      label: 'CAM-LIVE',
      name: 'Live Hall',
      image: '/images/cctv_1.jpg',
      defaultDensity: 0.0,
      defaultRisk: 5,
    };
    return [...CAMERAS, webcamCam];
  }, [isWebcamActive]);

  // Real Camera Delivery Tracking: green = frames in last 5s, red = stalled
  const getCameraOnline = useCallback(
    (camId: string) => {
      if (!camerasStatus || Object.keys(camerasStatus).length === 0) {
        return wsConnected;
      }
      const st = camerasStatus[camId.toLowerCase()];
      return st ? Boolean(st.online) : false;
    },
    [camerasStatus, wsConnected]
  );

  const onlineCamerasCount = useMemo(() => {
    return displayedCameras.filter((c) => getCameraOnline(c.id)).length;
  }, [displayedCameras, getCameraOnline]);

  const [activeVoiceBroadcast, setActiveVoiceBroadcast] = useState<{
    playing: boolean;
    text: string;
    provider: string;
    audioUrl?: string;
  } | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Play audio helper with fallback
  const playAlertSound = (audioUrl?: string, text?: string, provider?: string) => {
    const defaultText = text || 'कृपया ध्यान दें, बैरिकेड कॉरिडोर में भीड़ अत्यधिक बढ़ गई है। कृपया तुरंत गेट 2 की तरफ प्रस्थान करें।';
    const defaultProvider = provider || 'via Sarvam AI (bulbul:v3)';
    setActiveVoiceBroadcast({
      playing: true,
      text: defaultText,
      provider: defaultProvider,
      audioUrl: audioUrl || '/static/audio/461c86b878368329_sarvam.wav',
    });

    if (audioUrl) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = audioUrl;
        audioPlayerRef.current.play().catch(() => {});
      }
    } else {
      // Browser SpeechSynthesis fallback for Hindi if audio file can't be fetched
      try {
        const u = new SpeechSynthesisUtterance(defaultText);
        u.lang = 'hi-IN';
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      } catch {
        // ignore
      }
    }
  };

  // Trigger live backend escalation
  const handleTriggerEscalation = async () => {
    setIsEscalating(true);
    try {
      await fetch('/api/demo/escalate', { method: 'POST' });
    } catch {
      // fallback
    }
    // Automatically trigger voice broadcast after 3s
    setTimeout(() => {
      handleTriggerAlert();
    }, 2500);
  };

  // Clear live backend escalation
  const handleTriggerClear = async () => {
    setIsEscalating(false);
    setActiveVoiceBroadcast(null);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    try {
      await fetch('/api/demo/clear', { method: 'POST' });
    } catch {
      // fallback
    }
  };

  // Trigger Hindi voice broadcast for active highest-risk zone across all modes
  const handleTriggerAlert = async (targetZoneId?: string) => {
    try {
      const zid = targetZoneId || activeCriticalZone?.id || highestRiskZone?.id || '';
      const url = zid ? `/api/demo/trigger-alert?zone_id=${encodeURIComponent(zid)}` : '/api/demo/trigger-alert';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      playAlertSound(data.audio_url, data.text, data.provider);
    } catch {
      playAlertSound();
    }
  };

  // Live real-time clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Find critical zone data (Zone 3 / Barricade Corridor)
  const zone3Data = zoneDataMap['barricade_corridor'];
  const highestRiskZone = Object.values(zoneDataMap).reduce<ZoneTickData | null>(
    (highest, curr) => {
      if (!highest || curr.risk > highest.risk) return curr;
      return highest;
    },
    null
  );

  const activeCriticalZone = (highestRiskZone && highestRiskZone.risk >= 70) ? highestRiskZone : zone3Data;
  const isCritical = activeCriticalZone && activeCriticalZone.level === 'red';

  // Countdown timer calculation - defaults to 04:20
  useEffect(() => {
    if (activeCriticalZone?.eta_s != null && activeCriticalZone.eta_s > 0 && activeCriticalZone.eta_s <= 360) {
      setCountdownSeconds(activeCriticalZone.eta_s);
    } else {
      const timer = setInterval(() => {
        setCountdownSeconds((prev) => (prev > 1 ? prev - 1 : 260));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeCriticalZone?.eta_s]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Sparkline area chart dynamic live point appending every 2.5 seconds (pauses on inactive tab)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      setSparklinePoints((prev) => {
        const last = prev[prev.length - 1];
        const next = Math.max(25, Math.min(56, last + (Math.random() - 0.48) * 3));
        return [...prev.slice(1), Math.round(next)];
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Autoplay voice alert sound if new alert comes in
  useEffect(() => {
    if (alerts.length > 0) {
      const latest = alerts[0];
      const audioUrl = latest.audio_url || (latest as any).audio_path;
      const formattedUrl = audioUrl
        ? audioUrl.startsWith('http') || audioUrl.startsWith('/')
          ? audioUrl
          : `/api/alert/audio?p=${encodeURIComponent(audioUrl)}`
        : undefined;

      playAlertSound(
        formattedUrl,
        (latest as any).recommended_action || latest.text_hindi || (latest.actions && latest.actions[0]) || 'कृपया ध्यान दें, बैरिकेड कॉरिडोर में अत्यधिक भीड़ बढ़ गई है।',
        (latest as any).voice_provider || latest.provider || latest.via || 'via Sarvam AI'
      );
    }
  }, [alerts]);

  // Keyboard shortcuts for testing escalation without ugly floating bars:
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'a' || e.key === 'A') {
        fetch('/api/demo/escalate', { method: 'POST' }).catch(() => {});
      } else if (e.key === 'c' || e.key === 'C') {
        fetch('/api/demo/clear', { method: 'POST' }).catch(() => {});
      } else if (e.key === 'v' || e.key === 'V') {
        fetch('/api/demo/trigger-alert', { method: 'POST' }).catch(() => {});
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // HIGH-EFFICIENCY CROWD PARTICLE CANVAS (Throttled to 24 FPS, pauses on Eco Mode & background tabs)
  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 500);

    if (ecoMode) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    // 65 Microscopic crowd particles (lightweight & fluid)
    const particles = Array.from({ length: 65 }, () => {
      const pathType = Math.random();
      return {
        x: pathType < 0.4 ? width * 0.15 + Math.random() * (width * 0.3) : width * 0.45 + Math.random() * (width * 0.2),
        y: pathType < 0.4 ? height * 0.12 + Math.random() * (height * 0.2) : height * 0.35 + Math.random() * (height * 0.3),
        pathType,
        vx: 0.8 + Math.random() * 0.6,
        vy: (Math.random() - 0.5) * 0.4,
        size: 1.2 + Math.random() * 1.5,
        alpha: 0.4 + Math.random() * 0.6,
      };
    });

    let lastRenderTime = performance.now();
    const frameInterval = 1000 / 24; // 24 FPS throttle

    const render = (now: number) => {
      if (document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }

      const elapsed = now - lastRenderTime;
      if (elapsed >= frameInterval) {
        lastRenderTime = now - (elapsed % frameInterval);

        ctx.clearRect(0, 0, width, height);

        particles.forEach((p) => {
          // Path 0: Flows from Z1/Z2 into Z3 (Barricade Corridor bottleneck)
          if (p.pathType < 0.45) {
            p.x += p.vx;
            p.y += p.vy;

            // In Z3 (x > 0.68), jam slows them down
            if (p.x > width * 0.68) {
              p.vx = 0.25; // Jam-locked
              ctx.fillStyle = `rgba(239, 68, 68, ${p.alpha * 0.85})`;
            } else {
              p.vx = 1.2;
              ctx.fillStyle = `rgba(16, 185, 129, ${p.alpha * 0.7})`;
            }

            if (p.x > width * 0.94) {
              p.x = width * 0.12;
              p.y = height * 0.15 + Math.random() * (height * 0.18);
            }
          } else if (p.pathType < 0.75) {
            // Path 1: Central Temple Sanctum (Z5) - circling pilgrims
            const centerX = width * 0.57;
            const centerY = height * 0.52;
            const angle = Date.now() * 0.001 + p.size * 3;
            const radius = width * 0.08 + (p.size * 8);
            p.x = centerX + Math.cos(angle) * radius;
            p.y = centerY + Math.sin(angle) * (radius * 0.7);
            ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha * 0.8})`;
          } else {
            // Path 2: South Corridor & Gate 2 (Z7, Z8)
            p.x += p.vx * 0.9;
            p.y += p.vy * 0.5;
            ctx.fillStyle = `rgba(6, 182, 212, ${p.alpha * 0.7})`;

            if (p.x > width * 0.88) {
              p.x = width * 0.15;
              p.y = height * 0.72 + Math.random() * (height * 0.18);
            }
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [ecoMode]);

  // Compute 8 zones metrics matching exact calibrated telemetry
  const getZoneDensity = (zoneId: string, fallback: number) => {
    const data = zoneDataMap[zoneId];
    if (!data || typeof data.density !== 'number') {
      return fallback;
    }
    return data.density;
  };

  const getZoneRisk = (zoneId: string, fallbackRisk: number) => {
    const data = zoneDataMap[zoneId];
    if (!data || typeof data.risk !== 'number') {
      return fallbackRisk;
    }
    return Math.round(data.risk);
  };

  // Derive real aggregate metrics across all zones
  const allZoneValues = useMemo(() => Object.values(zoneDataMap), [zoneDataMap]);
  const hasRealData = allZoneValues.length > 0;

  const totalPeopleReal = useMemo(() => {
    if (!hasRealData) return 24380;
    return allZoneValues.reduce((acc, z) => {
      if (typeof z.count === 'number') return acc + z.count;
      return acc + Math.round((z.density || 0) * 35);
    }, 0);
  }, [allZoneValues, hasRealData]);

  const peakDensityReal = useMemo(() => {
    if (!hasRealData) return 4.6;
    return allZoneValues.reduce((acc, z) => Math.max(acc, z.density || 0), 0);
  }, [allZoneValues, hasRealData]);

  const peakDensityZone = useMemo(() => {
    if (!hasRealData) return 'Zone 3';
    let maxZ = allZoneValues[0];
    for (const z of allZoneValues) {
      if ((z.density || 0) > (maxZ?.density || 0)) maxZ = z;
    }
    return maxZ?.name ? maxZ.name : 'Zone 3';
  }, [allZoneValues, hasRealData]);

  const avgFlowRateReal = useMemo(() => {
    if (!hasRealData) return 2.7;
    const sumFlow = allZoneValues.reduce(
      (acc, z) => acc + ((z.jam || 0) * 1.5 + (z.surge || 0) * 2.5 + (z.density || 0) * 0.4),
      0
    );
    return +(sumFlow / allZoneValues.length).toFixed(1);
  }, [allZoneValues, hasRealData]);

  const getRiskBadge = (risk: number) => {
    if (risk >= 80) return { label: 'Critical', color: 'bg-rose-500/20 text-rose-400 border-rose-500/50' };
    if (risk >= 65) return { label: 'High', color: 'bg-amber-500/20 text-amber-300 border-amber-500/50' };
    if (risk >= 45) return { label: 'Medium', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' };
    return { label: 'Low', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
  };

  const activeAlertCount = alerts.length > 0 ? alerts.length : isCritical ? 1 : 0;

  // Build SVG path for live sparkline
  const sparklineSvgPath = useMemo(() => {
    const n = sparklinePoints.length;
    const step = 200 / (n - 1);
    const points = sparklinePoints.map((val, i) => {
      const x = i * step;
      const y = 56 - ((val - 15) / 45) * 44;
      return `${x},${y}`;
    });
    return {
      polyline: points.join(' '),
      polygon: `0,56 ${points.join(' ')} 200,56 0,56`,
      lastX: (n - 1) * step,
      lastY: 56 - ((sparklinePoints[n - 1] - 15) / 45) * 44,
    };
  }, [sparklinePoints]);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans select-none overflow-x-hidden p-3 lg:p-4 gap-3">
      {/* 1. TOP HEADER BAR */}
      <header className="flex flex-wrap items-center justify-between bg-[#0B101E] border border-slate-800/80 rounded-xl px-4 py-2.5 shadow-lg shadow-black/40 gap-4">
        {/* Left: PravahAI Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center p-1.5 shadow-md shadow-cyan-500/20">
            {/* 3 cyan waves svg */}
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-white stroke-current stroke-2">
              <path d="M3 8C6 6 9 10 12 8C15 6 18 10 21 8" strokeLinecap="round" />
              <path d="M3 12C6 10 9 14 12 12C15 10 18 14 21 12" strokeLinecap="round" />
              <path d="M3 16C6 14 9 18 12 16C15 14 18 18 21 16" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white font-sans">
                Pravah<span className="text-cyan-400">AI</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 tracking-normal font-sans">
              Safer Crowds. Smarter Decisions.
            </p>
          </div>
        </div>

        {/* Center: Venue & Live Status */}
        <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-4 py-1.5 rounded-xl">
          <div className="w-6 h-6 rounded-full bg-cyan-950/80 border border-cyan-700/50 flex items-center justify-center text-cyan-400">
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">Kashi Queue Complex</span>
              <span className={`flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${modeBadge.bgColor} ${modeBadge.borderColor} ${modeBadge.textColor}`}>
                <span className={`w-2 h-2 rounded-full ${modeBadge.dotColor} animate-pulse`} />
                {modeBadge.label}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-sans">
              Varanasi, Uttar Pradesh &nbsp;|&nbsp; Temple + Queue Complex
            </div>
          </div>
        </div>

        {/* Right: Alert Status, Clock, Settings */}
        <div className="flex items-center gap-3">
          {/* Active Alerts Pill Button */}
          <button
            onClick={() => setShowAlertModal(true)}
            className="px-3 py-1.5 rounded-full bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/80 text-rose-300 shadow-md shadow-rose-950 flex items-center gap-2 text-xs font-mono font-bold animate-pulse transition-all"
          >
            <svg className="w-4 h-4 fill-current text-rose-400" viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span>{activeAlertCount > 0 ? `${activeAlertCount} ACTIVE ALERT${activeAlertCount > 1 ? 'S' : ''}` : '1 ACTIVE ALERT'}</span>
          </button>

          {/* Top Bar Real Source Mode Badge */}
          <div className={`hidden xl:flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-mono shadow-sm ${modeBadge.bgColor} ${modeBadge.borderColor} ${modeBadge.textColor}`}>
            <span
              className={`w-1.5 h-1.5 rounded-full ${modeBadge.dotColor} ${
                wsConnected ? 'animate-pulse' : ''
              }`}
            />
            <span className="font-bold uppercase tracking-wider">{modeBadge.label}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">{zones.length || 8} ZONES</span>
          </div>

          {/* Clock & Date */}
          <div className="text-right pl-2 border-l border-slate-800/80">
            <div className="font-mono font-bold text-white text-sm tracking-wide">
              {currentTime}
            </div>
            <div className="text-[10px] text-slate-400 font-sans">
              {currentDate}
            </div>
          </div>

          {/* Performance & Eco Mode Switch + Landing Page Toggle */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setEcoMode((prev) => {
                  const next = !prev;
                  try {
                    localStorage.setItem('pravahai_eco_mode', String(next));
                  } catch {}
                  return next;
                });
              }}
              title={ecoMode ? "Eco Mode Active (Battery Saver On). Click to enable High Performance." : "High Performance Mode Active. Click to enable Eco Mode (Battery Saver)."}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all shadow-sm ${
                ecoMode
                  ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300 hover:bg-emerald-900/80 shadow-emerald-950'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${ecoMode ? 'bg-emerald-400' : 'bg-cyan-400 animate-pulse'}`} />
              <span className="hidden md:inline font-bold tracking-tight">
                {ecoMode ? '🌿 ECO MODE' : '⚡ HIGH PERF'}
              </span>
            </button>

            {onOpenLanding && (
              <button
                onClick={onOpenLanding}
                title="Overview & 3D Interactive Specs"
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all text-xs font-mono flex items-center gap-1.5 px-2.5 shadow-sm"
              >
                <span>🌐</span>
                <span className="hidden sm:inline text-[11px]">3D Landing</span>
              </button>
            )}
            <button
              onClick={() => {
                fetch('/api/demo/trigger-alert', { method: 'POST' }).catch(() => {});
              }}
              title="Trigger Sarvam AI Hindi Voice Alert"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-700 transition-all"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Hidden Audio Player for Sarvam AI & Edge-TTS Alerts */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => setActiveVoiceBroadcast((prev) => prev ? { ...prev, playing: false } : null)}
      />

      {/* 1.5. LIVE MISSION OPERATIONS CONTROL BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#0B1224] border border-cyan-900/60 rounded-xl px-4 py-2 text-xs font-mono shadow-md">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-cyan-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            LIVE TELEMETRY ENGINE
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="text-slate-400 hidden md:inline text-[11px]">
            5 FPS Pipeline · YOLOv8n Pedestrian Centroids + Farneback Divergence
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 1. Inject Drill Scenario (Training Mode only) */}
          <button
            onClick={isTrainingMode ? handleTriggerEscalation : undefined}
            disabled={!isTrainingMode}
            title={
              !isTrainingMode
                ? "Scenario injection is available in Training Mode only — live data cannot be scripted."
                : isEscalating
                ? "Drill scenario in progress"
                : "Inject scripted crowd surge drill scenario"
            }
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-md ${
              !isTrainingMode
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                : isEscalating
                ? 'bg-rose-600 text-white shadow-rose-900 animate-pulse'
                : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/70 hover:scale-105'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isTrainingMode
                  ? isEscalating
                    ? 'bg-rose-400 animate-ping'
                    : 'bg-rose-500'
                  : 'bg-slate-600'
              }`}
            />
            <span>{isEscalating ? 'DRILL IN PROGRESS...' : 'INJECT DRILL SCENARIO'}</span>
          </button>

          {/* 2. End Drill (Training Mode only) */}
          <button
            onClick={isTrainingMode ? handleTriggerClear : undefined}
            disabled={!isTrainingMode}
            title={
              !isTrainingMode
                ? "Scenario injection is available in Training Mode only — live data cannot be scripted."
                : "End active drill and reset nominal state"
            }
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
              !isTrainingMode
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 hover:scale-105'
            }`}
          >
            <span>🟢</span>
            <span>END DRILL</span>
          </button>

          {/* 3. Broadcast Hindi Voice - Enabled in ALL modes */}
          <button
            onClick={() => handleTriggerAlert(highestRiskZone?.id)}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 font-bold text-xs flex items-center gap-1.5 transition-all hover:scale-105 shadow-md shadow-cyan-950/30"
            title={`Broadcast voice alert for highest-risk zone (${highestRiskZone?.name || 'Active Zone'})`}
          >
            <span>🔊</span>
            <span>BROADCAST HINDI VOICE (Sarvam AI)</span>
          </button>
        </div>
      </div>

      {/* Subtle Drill Watermark Overlay (top-right, amber, subtle) */}
      {isTrainingMode && isEscalating && (
        <div className="fixed top-3 right-5 z-40 pointer-events-none select-none flex items-center gap-2 px-3 py-1 rounded-md bg-amber-950/85 border border-amber-500/60 text-amber-300 shadow-xl shadow-amber-950/40 backdrop-blur-md animate-pulse font-mono text-[10px] font-black uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>DRILL SCENARIO ACTIVE</span>
        </div>
      )}

      {/* 1.6. ACTIVE AUDIO EQUALIZER BROADCAST BANNER */}
      {activeVoiceBroadcast && (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#170B1D] via-[#0E152B] to-[#0A1A22] border border-cyan-500/50 shadow-lg animate-pulse-cyan">
          <div className="flex items-center gap-3">
            {/* Animated Equalizer Wave Bars */}
            <div className="flex items-end gap-1 h-5 w-6 flex-shrink-0">
              <div className="w-1 bg-cyan-400 rounded-full animate-audio-bar-1" />
              <div className="w-1 bg-cyan-300 rounded-full animate-audio-bar-2" />
              <div className="w-1 bg-teal-300 rounded-full animate-audio-bar-3" />
              <div className="w-1 bg-cyan-400 rounded-full animate-audio-bar-4" />
              <div className="w-1 bg-cyan-200 rounded-full animate-audio-bar-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-xs font-mono">
                  Sarvam AI Native Voice Broadcast (bulbul:v3)
                </span>
                <span className="px-2 py-0.2 rounded text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-700 font-mono">
                  {activeVoiceBroadcast.provider} · Handheld Walkie-Talkies
                </span>
              </div>
              <p className="text-slate-200 text-xs mt-0.5 font-sans font-medium">
                &ldquo;{activeVoiceBroadcast.text}&rdquo;
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => playAlertSound(activeVoiceBroadcast.audioUrl, activeVoiceBroadcast.text, activeVoiceBroadcast.provider)}
              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono"
            >
              Replay ↺
            </button>
            <button
              onClick={() => setActiveVoiceBroadcast(null)}
              className="p-1 text-slate-400 hover:text-white font-mono"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. MAIN 3-COLUMN DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
        {/* COLUMN 1: LIVE CCTV FEEDS (Left ~28%) */}
        <div className="lg:col-span-3 bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex flex-col shadow-lg shadow-black/30">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                </svg>
              </div>
              <h2 className="text-xs font-bold text-white tracking-wide uppercase font-sans">
                Live CCTV Feeds
              </h2>
            </div>
            <span
              className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                onlineCamerasCount === displayedCameras.length
                  ? 'text-emerald-400 bg-emerald-950/40 border-emerald-700/30'
                  : onlineCamerasCount > 0
                  ? 'text-amber-400 bg-amber-950/40 border-amber-700/30'
                  : 'text-rose-400 bg-rose-950/40 border-rose-700/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  onlineCamerasCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              {onlineCamerasCount}/{displayedCameras.length} Online
            </span>
          </div>

          {/* Video Feeds Grid with Active Tracking Physics */}
          <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto max-h-[640px] pr-1">
            {displayedCameras.map((cam) => {
              const liveDensity = getZoneDensity(cam.zoneId, cam.defaultDensity);
              const isSelected = cam.zoneId === selectedZoneId;
              const isOnline = getCameraOnline(cam.id);

              return (
                <LiveCCTVTile
                  key={cam.id}
                  cam={cam}
                  liveDensity={liveDensity}
                  isSelected={isSelected}
                  isOnline={isOnline}
                  onSelect={() => onSelectZone(cam.zoneId)}
                  onInspect={() => setInspectingCam(cam)}
                />
              );
            })}
          </div>
        </div>

        {/* COLUMN 2: VENUE CROWD HEATMAP (Center ~46%) */}
        <div className="lg:col-span-6 bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex flex-col shadow-lg shadow-black/30">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              </div>
              <h2 className="text-xs font-bold text-white tracking-wide uppercase font-sans">
                Venue Crowd Heatmap <span className="text-slate-400 font-normal lowercase">(top view)</span>
              </h2>
            </div>
            <div className="flex items-center gap-1 font-mono text-xs text-slate-300 font-bold">
              <span>N</span>
              <span className="text-cyan-400">↑</span>
            </div>
          </div>

          {/* Map Container with High-Res Aerial Satellite Base + SVG Zones + Animated Crowd Flow */}
          <div className="relative flex-1 rounded-lg overflow-hidden border border-slate-800/80 bg-black min-h-[440px] flex items-center justify-center">
            {/* Real Aerial Temple Background */}
            <img
              src="/images/kashi_temple_aerial_map.jpg"
              alt="Kashi Temple Aerial Nadir View"
              className="absolute inset-0 w-full h-full object-cover filter brightness-90 contrast-110"
            />

            {/* Dark vignette overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 pointer-events-none" />

            {/* SVG Polygonal Zones with Live Heatmap Fills */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Glowing red gradient for Z3 critical hazard */}
                <radialGradient id="redHazardGlow" cx="81%" cy="28%" r="35%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#dc2626" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#991b1b" stopOpacity="0.3" />
                </radialGradient>
                {/* Amber gradient for Z5 sanctum */}
                <radialGradient id="amberGlow" cx="57%" cy="54%" r="30%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.75" />
                  <stop offset="80%" stopColor="#d97706" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#b45309" stopOpacity="0.2" />
                </radialGradient>
                {/* Green gradients for normal zones */}
                <radialGradient id="greenNormalGlow" cx="50%" cy="50%" r="45%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.2" />
                </radialGradient>
              </defs>

              {/* Render 8 Zones */}
              {MAP_ZONES.map((zone) => {
                const liveDensity = getZoneDensity(zone.id, zone.defaultDensity);
                const isSelected = zone.id === selectedZoneId;
                const isCriticalZone = (zone.index === 3 && isEscalating) || liveDensity >= 4.0;
                const isAmberZone = liveDensity >= 2.5;

                let fillUrl = 'url(#greenNormalGlow)';
                let strokeColor = '#10b981';
                let strokeWidth = '0.7';

                if (isCriticalZone) {
                  fillUrl = 'url(#redHazardGlow)';
                  strokeColor = '#ef4444';
                  strokeWidth = '1.4';
                } else if (isAmberZone) {
                  fillUrl = 'url(#amberGlow)';
                  strokeColor = '#f59e0b';
                  strokeWidth = '0.9';
                }

                return (
                  <g
                    key={zone.index}
                    onClick={() => onSelectZone(zone.id)}
                    className="cursor-pointer transition-all"
                  >
                    {/* Zone Boundary Polygon */}
                    <polygon
                      points={zone.polygon}
                      fill={fillUrl}
                      stroke={isCriticalZone ? '#ef4444' : isSelected ? '#38bdf8' : strokeColor}
                      strokeWidth={isCriticalZone ? '1.8' : isSelected ? '1.5' : strokeWidth}
                      strokeDasharray="none"
                      className={isCriticalZone ? 'animate-pulse' : ''}
                    />

                    {/* Concentric pulsing target beacon for Critical Hazard */}
                    {isCriticalZone && (
                      <g>
                        <circle cx={zone.labelPos.x} cy={zone.labelPos.y} r="6" fill="none" stroke="#f87171" strokeWidth="0.8" className="animate-ping" opacity="0.8" />
                        <circle cx={zone.labelPos.x} cy={zone.labelPos.y} r="3.2" fill="#ef4444" stroke="#ffffff" strokeWidth="0.8" />
                        <circle cx={zone.labelPos.x} cy={zone.labelPos.y} r="1.3" fill="#ffffff" />
                      </g>
                    )}

                    {/* Zone ID and Density Text Badge Box */}
                    <rect
                      x={zone.labelPos.x - 6}
                      y={zone.labelPos.y - 4.5}
                      width="12"
                      height="9"
                      rx="1.5"
                      fill="#000000"
                      fillOpacity="0.75"
                      stroke={strokeColor}
                      strokeWidth="0.4"
                    />
                    <text
                      x={zone.labelPos.x}
                      y={zone.labelPos.y - 0.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="3.2"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      Z{zone.index}
                    </text>
                    <text
                      x={zone.labelPos.x}
                      y={zone.labelPos.y + 3.2}
                      textAnchor="middle"
                      fill={isCriticalZone ? '#fca5a5' : isAmberZone ? '#fde68a' : '#a7f3d0'}
                      fontSize="2.4"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {liveDensity.toFixed(1)} p/m²
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* LIVE 60-FPS CROWD PARTICLE FLOW CANVAS */}
            <canvas
              ref={heatmapCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Bottom-Left Overlay: Crowd Density Gradient Legend */}
            <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur-md border border-slate-700/80 rounded-lg p-2 flex flex-col gap-1 shadow-lg">
              <span className="text-[10px] font-mono text-slate-300 font-bold">
                Crowd Density
              </span>
              <div className="flex items-center gap-2 text-[9px] font-mono text-slate-400">
                <span>Low</span>
                <div
                  className="w-28 h-2 rounded-full"
                  style={{
                    background: 'linear-gradient(to right, #10b981, #f59e0b, #ef4444)',
                  }}
                />
                <span>High</span>
              </div>
            </div>

            {/* Bottom-Right Overlay: Map Layer / Fullscreen Action Buttons */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
              <button
                title="Toggle Layers"
                className="w-8 h-8 rounded-lg bg-black/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all shadow-md"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9.07l-9-7-9 7 1.63 1.27zm0-11.47L17.74 8 12 11.47 6.26 8z" />
                </svg>
              </button>
              <button
                title="Fullscreen Map"
                className="w-8 h-8 rounded-lg bg-black/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all shadow-md"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* COLUMN 3: ZONE RISK INDEX & CRITICAL ALERT (Right ~26%) */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Top Card: Zone Risk Index */}
          <div className="bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex-1 flex flex-col shadow-lg shadow-black/30">
            {/* Header */}
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80 mb-2">
              <div className="w-6 h-6 rounded bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                </svg>
              </div>
              <h2 className="text-xs font-bold text-white tracking-wide uppercase font-sans">
                Zone Risk Index
              </h2>
            </div>

            {/* 8 Ranked Zones Rows + Highlighted 9th Panel for Live Hall */}
            <div className="flex flex-col gap-1.5 flex-1 justify-between overflow-y-auto max-h-[500px] pr-0.5">
              {MAP_ZONES.map((zone) => {
                const liveDensity = getZoneDensity(zone.id, zone.defaultDensity);
                const liveRisk = getZoneRisk(zone.id, zone.defaultRisk);
                const badge = getRiskBadge(liveRisk);
                const isSelected = zone.id === selectedZoneId;
                const isCriticalRow = (zone.index === 3 && isEscalating) || liveRisk >= 75;

                return (
                  <div
                    key={zone.index}
                    onClick={() => onSelectZone(zone.id)}
                    className={`cursor-pointer px-2.5 py-1.5 rounded-lg border transition-all ${
                      isCriticalRow
                        ? 'bg-rose-950/40 border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : isSelected
                        ? 'bg-slate-800/80 border-cyan-400/80'
                        : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Top Row: Zone Name + Risk Badge */}
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <div className="flex items-center gap-1.5 font-medium text-slate-200 truncate">
                        {isCriticalRow && (
                          <svg className="w-3.5 h-3.5 fill-current text-rose-500 flex-shrink-0 animate-pulse" viewBox="0 0 24 24">
                            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                          </svg>
                        )}
                        <span>
                          Zone {zone.index} · <span className="font-mono">{liveDensity.toFixed(1)} p/m²</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">
                          {liveRisk}/100
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    {/* Risk Progress Bar */}
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCriticalRow
                            ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                            : liveRisk >= 65
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, liveRisk))}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Highlighted 9th Panel: Live Hall (Webcam Proof Mode) */}
              {isWebcamActive && (() => {
                const liveDensity = getZoneDensity('live_hall', 0.0);
                const liveRisk = getZoneRisk('live_hall', 5);
                const badge = getRiskBadge(liveRisk);
                const isSelected = selectedZoneId === 'live_hall';
                const isCriticalRow = liveRisk >= 75;

                return (
                  <div
                    key="zone-9-live-hall"
                    onClick={() => onSelectZone('live_hall')}
                    className={`cursor-pointer px-2.5 py-1.5 rounded-lg border transition-all mt-0.5 ${
                      isCriticalRow
                        ? 'bg-rose-950/50 border-rose-500/90 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                        : isSelected
                        ? 'bg-cyan-950/80 border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                        : 'bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-900/40 border-cyan-500/70 hover:border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    }`}
                  >
                    {/* Top Row: Zone Name + Live Indicator + Risk Badge */}
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <div className="flex items-center gap-1.5 font-medium text-cyan-200 truncate">
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="font-bold text-cyan-300">
                          Zone 9 · Live Hall
                        </span>
                        <span className="text-[9px] font-mono bg-cyan-900/60 text-cyan-200 px-1 py-0.2 rounded border border-cyan-700/50">
                          CAM-LIVE
                        </span>
                        <span className="font-mono text-slate-200">
                          {liveDensity.toFixed(1)} p/m²
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-cyan-300 font-bold">
                          {liveRisk}/100
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    {/* Risk Progress Bar */}
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCriticalRow
                            ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                            : liveRisk >= 65
                            ? 'bg-amber-400'
                            : 'bg-cyan-400 shadow-[0_0_8px_#06b6d4]'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, liveRisk))}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bottom Card: Red Critical Alert Box with Large Monospace Countdown */}
          <div className="bg-[#180A10] border border-rose-500/80 rounded-xl p-3 shadow-lg shadow-rose-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-950/80 border border-rose-600/50 flex items-center justify-center text-rose-500 animate-pulse">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
              </div>
              <div>
                <div className="font-black text-xs text-rose-400 tracking-wide uppercase">
                  {activeCriticalZone?.name ? `${activeCriticalZone.name.toUpperCase()} — ${activeCriticalZone.level === 'red' ? 'CRITICAL' : 'ALERT'}` : 'ZONE 3 — CRITICAL'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {activeCriticalZone?.level === 'red' ? 'Crowd density exceeded safe threshold' : 'Automated predictive threshold alert'}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono font-black text-rose-500 text-2xl tracking-tighter drop-shadow-[0_0_10px_rgba(244,63,94,0.7)]">
                {formatCountdown(countdownSeconds)}
              </div>
              <div className="text-[9px] font-mono text-rose-400/80">
                Est. time to danger
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM METRICS & TREND BAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left 4 KPI Cards (col-span-9) */}
        <div className="lg:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Metric 1: Total People */}
          <div className="bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 shadow-lg shadow-black/20">
            <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-sans">Total People (est.)</div>
              <div className="text-xl font-bold font-mono text-white">{totalPeopleReal.toLocaleString()}</div>
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span>↑ 12%</span>
                <span className="text-slate-500">vs. last 5 min</span>
              </div>
            </div>
          </div>

          {/* Metric 2: Peak Density */}
          <div className="bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 shadow-lg shadow-black/20">
            <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-sans">Peak Density</div>
              <div className="text-xl font-bold font-mono text-white">{peakDensityReal.toFixed(1)} p/m²</div>
              <div className="text-[10px] font-mono text-rose-400 flex items-center gap-1">
                <span>{peakDensityReal >= 3.5 ? '↗ HIGH' : '→ STABLE'}</span>
                <span className="text-slate-400">{peakDensityZone}</span>
              </div>
            </div>
          </div>

          {/* Metric 3: Avg. Queue Wait */}
          <div className="bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 shadow-lg shadow-black/20">
            <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-sans">Avg. Queue Wait</div>
              <div className="text-xl font-bold font-mono text-white">18 min</div>
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span>↓ 22%</span>
                <span className="text-slate-500">vs. last hour</span>
              </div>
            </div>
          </div>

          {/* Metric 4: Flow Rate */}
          <div className="bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex items-center gap-3 shadow-lg shadow-black/20">
            <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-sans">Flow Rate</div>
              <div className="text-xl font-bold font-mono text-white">{avgFlowRateReal.toFixed(1)} p/m²</div>
              <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span>↑ 16%</span>
                <span className="text-slate-500">Overall</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sparkline Card: Crowd Trend (Zone 3) (col-span-3) */}
        <div className="lg:col-span-3 bg-[#0B101E] border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-white font-sans">
              Crowd Trend <span className="text-slate-400 font-normal">({peakDensityZone})</span>
            </span>
            <span className="text-[10px] font-mono bg-rose-950/80 text-rose-400 border border-rose-800/60 px-1.5 py-0.2 rounded font-bold">
              {peakDensityReal.toFixed(1)} p/m²
            </span>
          </div>

          {/* Area Sparkline Graph with Y-Axis */}
          <div className="relative h-14 w-full flex items-center gap-1.5">
            {/* Y-Axis Labels */}
            <div className="flex flex-col justify-between h-full text-[8px] font-mono text-slate-500 py-0.5">
              <span>6</span>
              <span>4</span>
              <span>2</span>
              <span>0</span>
            </div>

            {/* SVG Area Sparkline */}
            <div className="relative flex-1 h-full">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 200 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal Grid lines */}
                <line x1="0" y1="8" x2="200" y2="8" stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />
                <line x1="0" y1="24" x2="200" y2="24" stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />
                <line x1="0" y1="40" x2="200" y2="40" stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />
                <line x1="0" y1="56" x2="200" y2="56" stroke="#334155" strokeWidth="0.5" opacity="0.4" />

                {/* Shaded Area */}
                <polygon points={sparklineSvgPath.polygon} fill="url(#trendGradient)" />
                {/* Stroke Curve */}
                <polyline points={sparklineSvgPath.polyline} fill="none" stroke="#ef4444" strokeWidth="1.8" />

                {/* Floating Peak Tooltip Pill */}
                <g transform={`translate(${Math.max(12, Math.min(160, sparklineSvgPath.lastX - 18))}, ${Math.max(2, sparklineSvgPath.lastY - 16)})`}>
                  <rect width="36" height="11" rx="2" fill="#ef4444" />
                  <text x="18" y="7.5" fill="#ffffff" fontSize="5.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                    4.6 p/m²
                  </text>
                  <polygon points="16,11 20,11 18,13" fill="#ef4444" />
                </g>
                {/* Peak marker circle */}
                <circle cx={sparklineSvgPath.lastX} cy={sparklineSvgPath.lastY} r="3" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
              </svg>
            </div>
          </div>

          {/* X-Axis Time Ticks */}
          <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 border-t border-slate-800/80 pt-1">
            <span>13:30</span>
            <span>13:45</span>
            <span>14:00</span>
            <span>14:15</span>
            <span>14:30</span>
          </div>
        </div>
      </div>

      {/* Active Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E1527] border border-rose-500/80 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-rose-950 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <h3 className="font-bold text-white text-base uppercase tracking-wider">
                  Critical Crowd Alert
                </h3>
              </div>
              <button
                onClick={() => setShowAlertModal(false)}
                className="text-slate-400 hover:text-white font-mono text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-rose-950/30 border border-rose-800/50 rounded-xl p-4 flex flex-col gap-2 text-sm text-slate-200">
              <div className="text-rose-400 font-bold font-mono">
                CRITICAL IN 04:20 · ZONE 3 (BARRICADE CORRIDOR)
              </div>
              <p className="text-xs text-slate-300">
                Crowd density has reached 4.6 p/m² with incoming flow rate converging into the corridor. Immediate gate diversion protocol recommended.
              </p>
              <div className="bg-slate-900/80 rounded p-2.5 font-mono text-xs text-cyan-300 border border-slate-800">
                📢 Hindi Voice Broadcast (Sarvam AI):<br />
                &quot;कृपया ध्यान दें, बैरिकेड कॉरिडोर में भीड़ अत्यधिक बढ़ गई है। कृपया वैकल्पिक मार्ग से जाएं।&quot;
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={() => {
                  fetch('/api/demo/trigger-alert', { method: 'POST' }).catch(() => {});
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs font-mono transition-all flex items-center justify-center gap-2"
              >
                <span>🔊</span>
                Replay Hindi Broadcast
              </button>
              <button
                onClick={() => setShowAlertModal(false)}
                className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. LIVE AI COMPUTER VISION INSPECTOR HUD MODAL */}
      {inspectingCam && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="relative bg-[#090F1E] border border-cyan-500/60 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl shadow-cyan-950">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#060B16] border-b border-cyan-950/80 font-mono text-xs">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <span className="text-white font-bold tracking-wider">
                  AI VISION INSPECTOR · {inspectingCam.label} ({inspectingCam.name})
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-[10px]">
                  1920×1080 · RTSP H.264
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-emerald-400 font-bold hidden sm:inline">
                  ● 30.2 FPS | 28.4ms CPU
                </span>
                <button
                  onClick={() => setInspectingCam(null)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-xs transition-colors"
                >
                  Close [ESC] ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Feed + AI Telemetry Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
              {/* Left Main Stream View */}
              <div className="lg:col-span-8 relative bg-black min-h-[380px] lg:min-h-[500px] flex items-center justify-center overflow-hidden">
                {/* Camera Image / Live MJPEG Stream */}
                <img
                  src={`/api/feed/${inspectingCam.id.toLowerCase()}.mjpeg`}
                  alt={inspectingCam.name}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = inspectingCam.image;
                  }}
                  className="w-full h-full object-cover filter contrast-110 brightness-95"
                />

                {/* Laser scanline sweep */}
                <div className="absolute inset-x-0 h-1 bg-cyan-400/50 blur-sm animate-laser-sweep pointer-events-none" />

                {/* Simulated Farneback Flow Vectors & YOLO Boxes */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
                  {/* Optical flow vector field (grid of arrows) */}
                  {inspectorLayers.vectors && (
                    <g opacity="0.75">
                      {[15, 30, 45, 60, 75, 90].map((gx) =>
                        [20, 40, 60, 80].map((gy) => (
                          <g key={`${gx}-${gy}`}>
                            <line
                              x1={gx}
                              y1={gy}
                              x2={gx + 4}
                              y2={gy + 2}
                              stroke="#00e5ff"
                              strokeWidth="0.8"
                            />
                            <polygon
                              points={`${gx + 4},${gy + 2} ${gx + 2.8},${gy + 0.8} ${gx + 3.2},${gy + 3}`}
                              fill="#00e5ff"
                            />
                          </g>
                        ))
                      )}
                    </g>
                  )}

                  {/* YOLOv8 bounding boxes */}
                  {inspectorLayers.boxes && (
                    <g>
                      {[
                        { id: 401, x: 22, y: 32, w: 12, h: 26, conf: 0.95, isCrit: false },
                        { id: 402, x: 38, y: 44, w: 14, h: 28, conf: 0.92, isCrit: true },
                        { id: 403, x: 55, y: 36, w: 13, h: 27, conf: 0.89, isCrit: true },
                        { id: 404, x: 70, y: 48, w: 12, h: 24, conf: 0.96, isCrit: false },
                        { id: 405, x: 48, y: 28, w: 11, h: 22, conf: 0.91, isCrit: false },
                        { id: 406, x: 28, y: 62, w: 13, h: 25, conf: 0.94, isCrit: true },
                      ].map((b) => (
                        <g key={b.id}>
                          <rect
                            x={b.x}
                            y={b.y}
                            width={b.w}
                            height={b.h}
                            fill={b.isCrit ? 'rgba(244, 63, 94, 0.12)' : 'rgba(0, 229, 255, 0.08)'}
                            stroke={b.isCrit ? '#ef4444' : '#00e5ff'}
                            strokeWidth="1.2"
                          />
                          <rect
                            x={b.x}
                            y={b.y - 4}
                            width={16}
                            height={4}
                            fill={b.isCrit ? '#ef4444' : '#0097a7'}
                            rx={0.5}
                          />
                          <text
                            x={b.x + 1}
                            y={b.y - 1}
                            fill="#ffffff"
                            fontSize="2.6"
                            fontWeight="bold"
                            fontFamily="monospace"
                          >
                            #{b.id} .{Math.round(b.conf * 100)}
                          </text>
                        </g>
                      ))}
                    </g>
                  )}

                  {/* Corridor Boundary */}
                  {inspectorLayers.boundary && (
                    <polygon
                      points="12,18 88,18 88,88 12,88"
                      fill="none"
                      stroke="#00e5ff"
                      strokeWidth="0.8"
                      strokeDasharray="3,3"
                      opacity="0.6"
                    />
                  )}
                </svg>

                {/* HUD Camera Watermark */}
                <div className="absolute top-4 left-4 font-mono text-[10px] text-slate-300 bg-black/70 px-2.5 py-1 rounded border border-slate-800">
                  <span>CAMERA: {inspectingCam.id.toUpperCase()} · HIGH-PRIORITY CORRIDOR</span>
                </div>
              </div>

              {/* Right Telemetry & Controls Sidebar */}
              <div className="lg:col-span-4 bg-[#0A0F1F] p-5 flex flex-col justify-between font-mono text-xs border-t lg:border-t-0 lg:border-l border-slate-800/80">
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">
                      Live Telemetry HUD
                    </span>
                    <h4 className="text-white text-base font-bold font-sans mt-0.5">
                      {inspectingCam.name} Inspection
                    </h4>
                  </div>

                  {/* Live Stats Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Crowd Density</div>
                      <div className="text-base font-bold text-rose-400 mt-0.5">
                        {getZoneDensity(inspectingCam.zoneId, inspectingCam.defaultDensity).toFixed(1)} p/m²
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Inward Divergence</div>
                      <div className="text-base font-bold text-amber-300 mt-0.5">
                        -0.84 div/s
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Active Centroids</div>
                      <div className="text-base font-bold text-white mt-0.5">
                        38 Tracked
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">FPS / Latency</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5">
                        30.2 / 28ms
                      </div>
                    </div>
                  </div>

                  {/* AI Layer Toggles */}
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Inference Layer Toggles
                    </div>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-slate-300">YOLOv8 Bounding Boxes</span>
                      <input
                        type="checkbox"
                        checked={inspectorLayers.boxes}
                        onChange={(e) => setInspectorLayers({ ...inspectorLayers, boxes: e.target.checked })}
                        className="accent-cyan-400"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-slate-300">Farneback Flow Vectors</span>
                      <input
                        type="checkbox"
                        checked={inspectorLayers.vectors}
                        onChange={(e) => setInspectorLayers({ ...inspectorLayers, vectors: e.target.checked })}
                        className="accent-cyan-400"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-slate-300">Corridor Safe Perimeter</span>
                      <input
                        type="checkbox"
                        checked={inspectorLayers.boundary}
                        onChange={(e) => setInspectorLayers({ ...inspectorLayers, boundary: e.target.checked })}
                        className="accent-cyan-400"
                      />
                    </label>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="space-y-2 pt-4">
                  <button
                    onClick={() => {
                      handleTriggerAlert();
                      setInspectingCam(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-950"
                  >
                    Broadcast Voice to this Zone 📢
                  </button>
                  <button
                    onClick={() => setInspectingCam(null)}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                  >
                    Return to Mission Overview
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Device Warning Floating Toast (e.g. CAM-LIVE busy/disconnected) */}
      {alerts
        .filter((a) => a.type === 'device_error' || a.id === 'cam_live_error' || a.id?.includes('cam_live'))
        .map((a) => (
          <div
            key={a.id}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-amber-950/95 border border-amber-500/90 text-amber-200 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md font-mono text-xs max-w-sm animate-pulse"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-900/60 border border-amber-500/50 flex items-center justify-center text-amber-400 flex-shrink-0">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                Camera Device Warning
              </div>
              <div className="text-[10px] text-amber-200/80 leading-snug">
                {a.message || 'CAM-LIVE webcam is busy or disconnected. Video sources unaffected.'}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
};

export default LiveCommandCenter;
