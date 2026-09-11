"""Pure mathematical functions for Risk Index (0-100), ETA, and alert levels.

NO ML inference inside risk math. All calculations are deterministic and testable.
"""
from typing import Optional


def risk_score(
    density: float,
    jam: float,
    surge: float,
    trend_slope: float,
) -> float:
    """Computes a composite Risk Index (0-100) based on weighted crowd metrics.

    Weights:
        - density: 0.45 (normalized as min(density / 4.5, 1.0))
        - trend_slope: 0.25 (positive rising slope only, clamped [0.0, 1.0])
        - jam: 0.20 (clamped [0.0, 1.0])
        - surge: 0.10 (clamped [0.0, 1.0])

    Returns:
        float: Risk score clamped strictly to [0.0, 100.0] rounded to 2 decimal places.
    """
    density_norm = min(max(float(density) / 4.5, 0.0), 1.0)
    # Positive rising slope only; falling/stationary slope yields 0.0 contribution
    trend_norm = min(max(float(trend_slope), 0.0), 1.0)
    jam_norm = min(max(float(jam), 0.0), 1.0)
    surge_norm = min(max(float(surge), 0.0), 1.0)

    raw_score = (
        0.45 * density_norm
        + 0.25 * trend_norm
        + 0.20 * jam_norm
        + 0.10 * surge_norm
    ) * 100.0

    return round(max(0.0, min(100.0, raw_score)), 2)


def eta_to_critical(
    density: float,
    slope: float,
    threshold: float = 4.0,
) -> Optional[int]:
    """Calculates seconds until zone reaches critical threshold.

    Args:
        density: Current density in people/m^2.
        slope: Rate of density change in people/m^2/min.
        threshold: Critical density threshold (default 4.0 p/m^2).

    Returns:
        Optional[int]: Rounded seconds until threshold if slope > 0.05 p/m^2/min.
                       0 if current density is already at or above threshold.
                       None if slope <= 0.05 (steady or falling crowd).
    """
    if density >= threshold:
        return 0

    # If slope is not rising sufficiently fast (> 0.05 p/m^2/min)
    if slope <= 0.05:
        return None

    remaining_capacity = threshold - density
    eta_minutes = remaining_capacity / slope
    eta_seconds = eta_minutes * 60.0

    return int(round(eta_seconds))


def level(risk: float) -> str:
    """Classifies risk score into color level.

    - "green": risk < 40
    - "amber": 40 <= risk < 75 (40-74)
    - "red": risk >= 75
    """
    r = float(risk)
    if r < 40.0:
        return "green"
    elif r < 75.0:
        return "amber"
    else:
        return "red"
