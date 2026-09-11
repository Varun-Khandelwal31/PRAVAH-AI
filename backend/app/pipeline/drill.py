"""Labeled training-drill density timeline.

Used in every source mode. Live CCTV keeps running; only zone risk math is
overlaid, and ticks must carry drill_active=True so the UI cannot hide it.
"""
from typing import Optional, Tuple


def drill_metrics(elapsed_s: float) -> Optional[Tuple[float, float, float]]:
    """Return (density, jam, surge) for Barricade Corridor drill, or None to auto-resolve.

    t+0–20s:  0.8 → 2.4 p/m²
    t+20–50s: 2.4 → 3.8 (amber)
    t+50–60s: 3.8 → 4.2 (red + jam)
    t+60–120s: 4.25 critical
    t+120s+:   None (caller must clear)
    """
    elapsed = float(elapsed_s)
    if elapsed < 0.0:
        return 0.8, 0.0, 0.0
    if elapsed < 20.0:
        frac = elapsed / 20.0
        return round(0.8 + frac * 1.6, 3), 0.0, 0.05
    if elapsed < 50.0:
        frac = (elapsed - 20.0) / 30.0
        return round(2.4 + frac * 1.4, 3), round(0.15 * frac, 3), round(0.08 + 0.2 * frac, 3)
    if elapsed < 60.0:
        frac = (elapsed - 50.0) / 10.0
        jam = 0.15 + 0.55 * frac
        return round(3.8 + frac * 0.4, 3), round(jam, 3), 0.35
    if elapsed < 120.0:
        return 4.25, 0.85, 0.42
    return None
