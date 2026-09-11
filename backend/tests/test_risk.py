"""Unit tests for pure risk math, ETA predictions, and alert level classification."""
import pytest
from app.pipeline.risk import eta_to_critical, level, risk_score


def test_empty_zone():
    """Case 1: Empty zone with zero metrics yields zero risk, None ETA, and green level."""
    score = risk_score(density=0.0, jam=0.0, surge=0.0, trend_slope=0.0)
    assert score == 0.0
    assert eta_to_critical(density=0.0, slope=0.0, threshold=4.0) is None
    assert level(score) == "green"


def test_rising_crowd_crossing_threshold():
    """Case 2: Rising crowd crossing threshold calculates plausible ETA and escalation."""
    # From 2.0 to 4.0 at rate 1.0 p/m^2/min takes 2 minutes = 120 seconds
    eta = eta_to_critical(density=2.0, slope=1.0, threshold=4.0)
    assert eta == 120

    # From 3.5 to 4.0 at rate 0.5 p/m^2/min takes 1 minute = 60 seconds
    eta_fast = eta_to_critical(density=3.5, slope=0.5, threshold=4.0)
    assert eta_fast == 60

    # Already at or exceeding critical threshold
    assert eta_to_critical(density=4.0, slope=0.5, threshold=4.0) == 0
    assert eta_to_critical(density=4.5, slope=0.5, threshold=4.0) == 0


def test_jammed_zone_scores_higher_than_calm():
    """Case 3: Jammed zone scores significantly higher than calm zone at identical density."""
    same_density = 3.0
    calm = risk_score(density=same_density, jam=0.0, surge=0.0, trend_slope=0.0)
    jammed = risk_score(density=same_density, jam=0.8, surge=0.0, trend_slope=0.0)

    assert jammed > calm
    # Jam weight is 0.20 * 0.8 * 100 = 16.0 points higher
    assert jammed == pytest.approx(calm + 16.0, rel=1e-2)


def test_no_negative_risk():
    """Case 4: Negative inputs are clamped; risk score never drops below 0.0."""
    score = risk_score(density=-2.5, jam=-0.5, surge=-1.0, trend_slope=-0.8)
    assert score == 0.0
    assert score >= 0.0


def test_eta_none_when_falling_or_stagnant():
    """Case 5: ETA is None when crowd slope is falling, stationary, or below minimum threshold."""
    # Falling crowd (negative slope)
    assert eta_to_critical(density=2.5, slope=-0.8, threshold=4.0) is None
    # Stationary crowd
    assert eta_to_critical(density=2.5, slope=0.0, threshold=4.0) is None
    # Extremely slow rise (<= 0.05 p/m^2/min)
    assert eta_to_critical(density=2.5, slope=0.04, threshold=4.0) is None
    assert eta_to_critical(density=2.5, slope=0.05, threshold=4.0) is None
    # Slope strictly > 0.05 produces valid ETA
    assert eta_to_critical(density=2.5, slope=0.06, threshold=4.0) is not None


def test_level_boundaries():
    """Case 6: Exact boundary transitions for green, amber, and red alert levels."""
    assert level(0.0) == "green"
    assert level(39.99) == "green"
    assert level(40.0) == "amber"
    assert level(74.99) == "amber"
    assert level(75.0) == "red"
    assert level(100.0) == "red"
