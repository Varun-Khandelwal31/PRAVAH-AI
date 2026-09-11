"""Unit tests for point-in-polygon zone assignment and density calculations."""
from app.config import Zone, settings
from app.pipeline.density import compute_zone_densities, point_in_polygon


def test_point_in_polygon_detection():
    """Verify points strictly inside and outside polygon are accurately classified."""
    # North Entry: X: [0.05, 0.48], Y: [0.05, 0.25]
    north_entry_zone = next(z for z in settings.zones if z.id == "north_entry")

    assert point_in_polygon((0.20, 0.15), north_entry_zone.points) is True
    assert point_in_polygon((0.05, 0.05), north_entry_zone.points) is True  # on boundary
    assert point_in_polygon((0.80, 0.80), north_entry_zone.points) is False  # outside


def test_synthetic_centroids_land_in_correct_zones():
    """Synthetic centroids in distinct zones are accurately partitioned."""
    centroids = [
        # 3 points inside Barricade Corridor ([0.35, 0.28] to [0.65, 0.45])
        (0.40, 0.35, 0.9),
        (0.50, 0.36, 0.85),
        (0.60, 0.40, 0.88),
        # 2 points inside North Entry ([0.05, 0.05] to [0.48, 0.25])
        (0.10, 0.10, 0.92),
        (0.25, 0.15, 0.87),
        # 1 point outside all designated zones
        (0.01, 0.01, 0.5),
    ]

    res = compute_zone_densities(centroids, settings.zones)

    assert res["barricade_corridor"]["count"] == 3
    assert res["north_entry"]["count"] == 2
    assert res["exit_lane"]["count"] == 0
    assert res["gate_2_overflow"]["count"] == 0


def test_density_math_accuracy_and_rounding():
    """Density equals count / area_m2 rounded strictly to 2 decimal places."""
    test_zone = Zone(
        id="test_box",
        name="Test Box",
        points=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
        area_m2=18.0,
        critical_threshold=4.0,
    )

    # 36 people in 18 m^2 -> 2.0 p/m^2
    centroids_36 = [(0.5, 0.5)] * 36
    res_36 = compute_zone_densities(centroids_36, [test_zone])
    assert res_36["test_box"]["count"] == 36
    assert res_36["test_box"]["density"] == 2.0

    # 3 people in 18 m^2 -> 3 / 18 = 0.16666... -> 0.17
    centroids_3 = [(0.5, 0.5)] * 3
    res_3 = compute_zone_densities(centroids_3, [test_zone])
    assert res_3["test_box"]["count"] == 3
    assert res_3["test_box"]["density"] == 0.17

    # 0 people in 18 m^2 -> 0.0
    res_0 = compute_zone_densities([], [test_zone])
    assert res_0["test_box"]["count"] == 0
    assert res_0["test_box"]["density"] == 0.0
