"""Single-run pipeline scratch script executing on two consecutive synthetic frames.

Demonstrates end-to-end integration:
Frame generation -> Person detection -> Zone density -> Optical flow & jam/surge -> Risk & ETA calculation.
"""
from datetime import datetime, timezone
import json
import cv2
import numpy as np
from app.config import settings
from app.pipeline.density import compute_zone_densities
from app.pipeline.detector import PersonDetector
from app.pipeline.flow import FlowAnalyzer
from app.pipeline.risk import eta_to_critical, level, risk_score


def generate_synthetic_frames(width: int = 640, height: int = 480):
    """Generates two consecutive synthetic video frames containing random blobs and motion."""
    np.random.seed(42)

    # Frame 1: Background canvas with random blobs
    f1 = np.ones((height, width, 3), dtype=np.uint8) * 30

    # Draw random blobs across zones
    for _ in range(60):
        x = np.random.randint(40, width - 40)
        y = np.random.randint(40, height - 40)
        radius = np.random.randint(12, 28)
        color = (
            int(np.random.randint(150, 240)),
            int(np.random.randint(150, 240)),
            int(np.random.randint(150, 240)),
        )
        cv2.circle(f1, (x, y), radius, color, -1)

    # Frame 2: Shifted frame simulating crowd displacement and inward movement in barricade corridor
    f2 = f1.copy()
    # Apply slight motion blur / translation to simulate walking movement
    M = np.float32([[1, 0, 1], [0, 1, 1]])
    f2 = cv2.warpAffine(f2, M, (width, height))

    # Add extra clustering inside Barricade Corridor ([0.35, 0.28] to [0.65, 0.45])
    bc_center_x = int(0.50 * width)
    bc_center_y = int(0.36 * height)
    for _ in range(15):
        bx = int(bc_center_x + np.random.randn() * 25)
        by = int(bc_center_y + np.random.randn() * 20)
        cv2.circle(f2, (bx, by), 15, (220, 220, 220), -1)

    return f1, f2


def run_pipeline_tick():
    """Runs one end-to-end pipeline tick on synthetic data and returns the tick dictionary."""
    f1, f2 = generate_synthetic_frames()

    # 1. Detection via YOLOv8n
    detector = PersonDetector()
    centroids = detector.detect(f2)

    # If YOLO on synthetic simple circles returns few/no person detections,
    # augment with synthetic centroids in danger zones for full demonstration
    if len(centroids) < 5:
        # Generate plausible crowd centroids for demo demonstration
        synthetic_centroids = [
            # Barricade corridor cluster (danger zone)
            (0.42, 0.33, 0.85),
            (0.45, 0.35, 0.88),
            (0.48, 0.36, 0.91),
            (0.51, 0.34, 0.86),
            (0.54, 0.38, 0.89),
            (0.58, 0.35, 0.90),
            (0.60, 0.37, 0.87),
            (0.49, 0.40, 0.92),
            (0.53, 0.41, 0.84),
            # Ticket queue
            (0.60, 0.15, 0.82),
            (0.70, 0.18, 0.85),
            (0.80, 0.12, 0.80),
            # North entry
            (0.15, 0.12, 0.79),
            (0.25, 0.16, 0.83),
        ]
        centroids = list(centroids) + synthetic_centroids

    # 2. Zone Density Computation
    density_results = compute_zone_densities(centroids, settings.zones)
    densities_map = {zid: d["density"] for zid, d in density_results.items()}

    # 3. Optical Flow & Jam/Surge Analysis
    flow_analyzer = FlowAnalyzer()
    flow_results = flow_analyzer.analyze(f1, f2, settings.zones, densities_map)

    # 4. Pure Risk & ETA Scoring
    # Simulated trend slopes (e.g. rising in barricade corridor, nominal elsewhere)
    simulated_slopes = {
        "barricade_corridor": 0.45,
        "ticket_queue": 0.10,
        "north_entry": 0.02,
        "main_concourse": 0.00,
        "east_wing": -0.05,
        "gate_2_overflow": 0.00,
        "side_passage": 0.01,
        "exit_lane": -0.10,
    }

    zone_records = []
    for zone in settings.zones:
        zid = zone.id
        dens = densities_map.get(zid, 0.0)
        flow_data = flow_results.get(zid, {})
        jam = flow_data.get("jam_score", 0.0)
        surge = flow_data.get("surge_score", 0.0)
        trend_slope = simulated_slopes.get(zid, 0.0)

        risk = risk_score(
            density=dens,
            jam=jam,
            surge=surge,
            trend_slope=trend_slope,
        )
        eta_s = eta_to_critical(
            density=dens,
            slope=trend_slope,
            threshold=zone.critical_threshold,
        )
        lvl = level(risk)

        zone_records.append({
            "id": zid,
            "density": dens,
            "jam": jam,
            "surge": surge,
            "trend_slope": trend_slope,
            "risk": risk,
            "eta_s": eta_s,
            "level": lvl,
        })

    tick_payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "zones": zone_records,
    }

    return tick_payload


if __name__ == "__main__":
    tick = run_pipeline_tick()
    print(json.dumps(tick, indent=2))
