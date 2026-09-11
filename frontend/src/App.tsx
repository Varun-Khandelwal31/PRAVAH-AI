import { useState, useEffect, useRef, useCallback } from 'react';
import type { ZoneConfig, ZoneTickData } from './components/ZoneMap';
import type { AlertData } from './components/AlertPanel';
import { LandingPage } from './components/LandingPage';
import LiveCommandCenter from './components/LiveCommandCenter';

// Default 8-zone configuration fallback if /api/config is unreachable
const DEFAULT_ZONES: ZoneConfig[] = [
  {
    id: 'north_entry',
    name: 'North Entry',
    area_m2: 35.0,
    critical_threshold: 4.0,
    points: [[0.05, 0.05], [0.48, 0.05], [0.48, 0.25], [0.05, 0.25]],
  },
  {
    id: 'ticket_queue',
    name: 'Ticket Queue',
    area_m2: 32.0,
    critical_threshold: 4.0,
    points: [[0.52, 0.05], [0.95, 0.05], [0.95, 0.25], [0.52, 0.25]],
  },
  {
    id: 'barricade_corridor',
    name: 'Barricade Corridor',
    area_m2: 18.0,
    critical_threshold: 4.0,
    points: [[0.35, 0.28], [0.65, 0.28], [0.65, 0.45], [0.35, 0.45]],
  },
  {
    id: 'side_passage',
    name: 'Side Passage',
    area_m2: 24.0,
    critical_threshold: 4.0,
    points: [[0.05, 0.28], [0.32, 0.28], [0.32, 0.68], [0.05, 0.68]],
  },
  {
    id: 'east_wing',
    name: 'East Wing',
    area_m2: 36.0,
    critical_threshold: 4.0,
    points: [[0.68, 0.28], [0.95, 0.28], [0.95, 0.68], [0.68, 0.68]],
  },
  {
    id: 'main_concourse',
    name: 'Main Concourse',
    area_m2: 54.0,
    critical_threshold: 4.0,
    points: [[0.35, 0.48], [0.65, 0.48], [0.65, 0.70], [0.35, 0.70]],
  },
  {
    id: 'gate_2_overflow',
    name: 'Gate 2 Overflow',
    area_m2: 42.0,
    critical_threshold: 4.0,
    points: [[0.05, 0.73], [0.48, 0.73], [0.48, 0.95], [0.05, 0.95]],
  },
  {
    id: 'exit_lane',
    name: 'Exit Lane',
    area_m2: 28.0,
    critical_threshold: 4.0,
    points: [[0.52, 0.73], [0.95, 0.73], [0.95, 0.95], [0.52, 0.95]],
  },
];

export function App() {
  const [zones, setZones] = useState<ZoneConfig[]>(DEFAULT_ZONES);
  const [zoneDataMap, setZoneDataMap] = useState<Record<string, ZoneTickData>>({});
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('barricade_corridor');
  const [sourceMode, setSourceMode] = useState<string>('simulator');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'landing' | 'console'>(() => {
    const hash = window.location.hash.toLowerCase();
    const search = new URLSearchParams(window.location.search);
    if (
      hash === '#landing' ||
      hash === '#/' ||
      search.get('view') === 'landing' ||
      search.get('page') === 'landing' ||
      window.location.pathname === '/landing'
    ) {
      return 'landing';
    }
    return 'console';
  });

  useEffect(() => {
    const checkViewFromUrl = () => {
      const hash = window.location.hash.toLowerCase();
      const search = new URLSearchParams(window.location.search);
      if (
        hash === '#landing' ||
        search.get('view') === 'landing' ||
        search.get('page') === 'landing' ||
        window.location.pathname === '/landing'
      ) {
        setViewMode('landing');
      } else if (hash === '#console' || search.get('view') === 'console') {
        setViewMode('console');
      }
    };
    window.addEventListener('hashchange', checkViewFromUrl);
    window.addEventListener('popstate', checkViewFromUrl);
    return () => {
      window.removeEventListener('hashchange', checkViewFromUrl);
      window.removeEventListener('popstate', checkViewFromUrl);
    };
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);

  // 1. Fetch /api/config once
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.zones && data.zones.length > 0) {
          setZones(data.zones);
        }
        if (data.source_mode) {
          setSourceMode(data.source_mode);
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_ZONES already in state
      });
  }, []);

  // 2. Process incoming tick
  const handleTick = useCallback((tick: any) => {
    if (!tick || !tick.zones) return;
    const newMap: Record<string, ZoneTickData> = {};
    tick.zones.forEach((z: ZoneTickData) => {
      newMap[z.id] = z;
    });
    setZoneDataMap(newMap);

    if (tick.alerts && Array.isArray(tick.alerts)) {
      setAlerts(tick.alerts);
    } else {
      setAlerts([]);
    }
  }, []);

  // 3. Fallback mock-tick generator (1 Hz standard telemetry, pauses when tab is backgrounded)
  useEffect(() => {
    if (wsConnected) return;

    let tickCount = 0;
    const mockInterval = setInterval(() => {
      if (document.hidden) return;
      tickCount += 1;
      const mockZones: ZoneTickData[] = zones.map((z) => {
        const isBC = z.id === 'barricade_corridor';
        const baseDensity = isBC ? 4.6 : z.id === 'main_concourse' ? 3.8 : 2.0;
        const wave = Math.sin(tickCount * 0.1 + (isBC ? 1 : 0)) * 0.2;
        const density = Math.max(0.1, Number((baseDensity + wave).toFixed(2)));
        const slope = Number((Math.cos(tickCount * 0.1) * 0.15).toFixed(2));
        const risk = Number(Math.min(100, Math.max(15, (density / 4.5) * 75 + (isBC ? 20 : 5))).toFixed(1));
        const lvl: 'green' | 'amber' | 'red' = risk >= 75 ? 'red' : risk >= 40 ? 'amber' : 'green';

        return {
          id: z.id,
          name: z.name,
          density,
          jam: 0.0,
          surge: 0.0,
          trend_slope: slope,
          risk,
          eta_s: slope > 0.05 ? Math.round((4.0 - density) / slope * 60) : 260,
          level: lvl,
        };
      });

      handleTick({
        ts: new Date().toISOString(),
        zones: mockZones,
        alerts: [
          {
            zone_id: 'barricade_corridor',
            zone_name: 'Barricade Corridor',
            risk_score: 87,
            eta_seconds: 260,
            recommended_action: 'डाइवर्ट गेट 2 खोलें और पश्चिमी निकास चालू करें',
            audio_path: 'alerts/cache/alert_barricade_corridor.wav',
            voice_provider: 'Sarvam AI (bulbul:v3)',
          },
        ],
      });
    }, 1000);

    return () => clearInterval(mockInterval);
  }, [wsConnected, zones, handleTick]);

  // 4. WebSocket connection with exponential backoff reconnect
  useEffect(() => {
    let unmounted = false;

    const connectWebSocket = () => {
      if (unmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/stream`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setWsConnected(true);
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleTick(data);
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setWsConnected(false);
        const backoff = Math.min(5000, 1000 * Math.pow(1.5, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, backoff);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      unmounted = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [handleTick]);

  // Landing page presentation view
  if (viewMode === 'landing') {
    return (
      <LandingPage
        onLaunchConsole={() => {
          window.location.hash = 'console';
          setViewMode('console');
        }}
      />
    );
  }

  // Exact reference layout Live Command Center
  return (
    <LiveCommandCenter
      zones={zones}
      zoneDataMap={zoneDataMap}
      alerts={alerts}
      selectedZoneId={selectedZoneId}
      onSelectZone={setSelectedZoneId}
      wsConnected={wsConnected}
      sourceMode={sourceMode}
      onOpenLanding={() => {
        window.location.hash = 'landing';
        setViewMode('landing');
      }}
    />
  );
}

export default App;

