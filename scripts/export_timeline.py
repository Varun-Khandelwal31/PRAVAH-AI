"""Export a full 120-second demo escalation timeline to sample_data/timeline.json.

Allows zero-compute backup mode (SOURCE_MODE=timeline) serving pre-computed ticks at 1 Hz
without running YOLO, optical flow, or video decoding on stage.
"""
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from app.config import settings
from app.pipeline.risk import eta_to_critical, level, risk_score

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "sample_data" / "timeline.json"


def generate_timeline(total_seconds: int = 120):
    """Generates 120 chronological 1-Hz ticks for the complete escalation lifecycle."""
    timeline = []
    base_time = 1788880000

    for s in range(total_seconds):
        now_iso = datetime.fromtimestamp(base_time + s, tz=timezone.utc).isoformat()

        # Barricade Corridor progression:
        # 0s - 18s: Nominal green (density 0.6 -> 1.8, slope ~0.04, risk 10 -> 35)
        # 19s - 48s: Amber buildup (density 1.9 -> 3.4, slope ~0.35, risk 42 -> 72)
        # 49s - 58s: Red escalation (density 3.5 -> 4.1, slope ~0.45, risk 75 -> 88)
        # 59s - 95s: Jammed Critical Alert (density 4.2, jam 0.85, risk 94, alert active)
        # 96s - 120s: Resolution (cleared, density drops back to 0.7, nominal)

        if s < 18:
            # Nominal
            bc_dens = round(0.6 + (s / 18.0) * 1.2, 2)
            bc_slope = 0.04
            bc_jam = 0.0
            bc_surge = 0.01
        elif s < 48:
            # Amber
            frac = (s - 18) / 30.0
            bc_dens = round(1.8 + frac * 1.6, 2)
            bc_slope = round(0.20 + frac * 0.25, 2)
            bc_jam = round(frac * 0.35, 2)
            bc_surge = round(0.02 + frac * 0.06, 2)
        elif s < 58:
            # Red
            frac = (s - 48) / 10.0
            bc_dens = round(3.4 + frac * 0.7, 2)
            bc_slope = round(0.45 + frac * 0.15, 2)
            bc_jam = round(0.35 + frac * 0.40, 2)
            bc_surge = round(0.08 + frac * 0.04, 2)
        elif s < 95:
            # Jammed alert
            bc_dens = 4.25
            bc_slope = 0.02
            bc_jam = 0.88
            bc_surge = 0.01
        else:
            # Resolution
            frac = (s - 95) / 25.0
            bc_dens = round(max(0.6, 4.25 - frac * 3.6), 2)
            bc_slope = -0.50
            bc_jam = 0.0
            bc_surge = 0.0

        bc_risk = risk_score(bc_dens, bc_jam, bc_surge, bc_slope)
        bc_eta = eta_to_critical(bc_dens, bc_slope, threshold=4.0)
        bc_lvl = level(bc_risk)

        # Baseline metrics for other 7 zones
        zones_data = []
        for zone in settings.zones:
            if zone.id == "barricade_corridor":
                zones_data.append({
                    "id": zone.id,
                    "name": zone.name,
                    "density": bc_dens,
                    "count": int(round(bc_dens * (zone.area_m2 or 40.0))),
                    "jam": bc_jam,
                    "surge": bc_surge,
                    "trend_slope": bc_slope,
                    "risk": bc_risk,
                    "eta_s": bc_eta,
                    "level": bc_lvl,
                })
            else:
                # Ambient slight wander
                ambient_dens = round(0.4 + 0.3 * ((s + hash(zone.id)) % 7) / 7.0, 2)
                ambient_risk = round(risk_score(ambient_dens, 0.0, 0.0, 0.0), 1)
                zones_data.append({
                    "id": zone.id,
                    "name": zone.name,
                    "density": ambient_dens,
                    "count": int(round(ambient_dens * (zone.area_m2 or 30.0))),
                    "jam": 0.0,
                    "surge": 0.0,
                    "trend_slope": 0.0,
                    "risk": ambient_risk,
                    "eta_s": None,
                    "level": "green",
                })

        # Alert payload during critical window (s >= 49 and s < 95)
        alerts = []
        if bc_lvl == "red" or s >= 49 and s < 95:
            alerts.append({
                "id": "alert_barricade_corridor_backup",
                "ts": now_iso,
                "zone": "Barricade Corridor",
                "zone_id": "barricade_corridor",
                "eta_s": bc_eta if bc_eta is not None else 0,
                "actions": [
                    "Open Gate 2 for overflow",
                    "Divert flow via Side Passage",
                    "Dispatch 2 marshals",
                ],
                "density": bc_dens,
                "risk": bc_risk,
                "text_hindi": "ज़ोन 3 में भीड़ खतरनाक स्तर पर पहुँच रही है। गेट 2 खोलें, भीड़ को साइड पैसेज मोड़ें, दो मार्शल भेजें।",
                "audio_url": "/static/audio/1832afbcacad1d3a_edge.mp3",
                "provider": "via edge-tts",
                "via": "via edge-tts",
            })

        tick = {
            "ts": now_iso,
            "tick_index": s,
            "zones": zones_data,
            "alerts": alerts,
            "cameras": [
                {
                    "id": f"cam-0{i}",
                    "name": f"CAM-0{i}",
                    "online": True,
                    "last_seen_s": 0.1,
                    "is_webcam": False,
                }
                for i in range(1, 7)
            ],
        }
        timeline.append(tick)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(timeline, f, indent=2, ensure_ascii=False)

    print(f"Exported {len(timeline)} timeline ticks to {OUTPUT_PATH}")


if __name__ == "__main__":
    generate_timeline(120)
