"""Unit tests for configuration and zone specifications."""
import json
from pathlib import Path
import pytest
from app.config import Settings, Zone, settings


def test_zones_json_parses_directly():
    """Verify sample_data/zones.json parses directly and has exactly 8 zones."""
    zones_file = Path(__file__).resolve().parent.parent.parent / "sample_data" / "zones.json"
    assert zones_file.exists(), f"zones.json not found at {zones_file}"

    with open(zones_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list)
    assert len(data) == 8, f"Expected 8 zones, got {len(data)}"


def test_zones_schema_and_boundaries():
    """Verify all zones have required fields, bounds within 0-1, area within 16-60, and 4.0 threshold."""
    expected_zone_ids = {
        "north_entry",
        "ticket_queue",
        "barricade_corridor",
        "side_passage",
        "east_wing",
        "main_concourse",
        "gate_2_overflow",
        "exit_lane",
    }

    found_ids = set()
    for zone in settings.zones:
        found_ids.add(zone.id)
        assert zone.name and isinstance(zone.name, str)
        assert 16.0 <= zone.area_m2 <= 60.0, f"Zone {zone.id} area {zone.area_m2} not between 16 and 60 m^2"
        assert zone.critical_threshold == 4.0, f"Zone {zone.id} critical_threshold != 4.0"

        # Check polygon coordinates bounds [0.0, 1.0]
        assert len(zone.points) >= 3, f"Zone {zone.id} polygon has fewer than 3 vertices"
        for pt in zone.points:
            assert len(pt) == 2, f"Point {pt} is not a 2D coordinate"
            x, y = pt[0], pt[1]
            assert 0.0 <= x <= 1.0, f"Zone {zone.id} X coord {x} out of bounds [0, 1]"
            assert 0.0 <= y <= 1.0, f"Zone {zone.id} Y coord {y} out of bounds [0, 1]"

    assert found_ids == expected_zone_ids, f"Mismatch in zone IDs: {found_ids ^ expected_zone_ids}"


def test_config_loads_with_empty_keys():
    """Verify config loads fine even with EMPTY keys (voice fallback must not break config)."""
    empty_settings = Settings(sarvam_api_key="", gemini_api_key="", _env_file=None)
    assert len(empty_settings.zones) == 8
    assert empty_settings.sarvam_api_key is None
    assert empty_settings.gemini_api_key is None


def test_settings_parses_clean_keys_and_handles_comments():
    """Verify settings parses actual keys when provided and strips comments."""
    cfg = Settings(sarvam_api_key="sk_live_12345", gemini_api_key="gem_67890")
    assert cfg.sarvam_api_key == "sk_live_12345"
    assert cfg.gemini_api_key == "gem_67890"

    # Empty string or comment placeholder should be converted to None
    cfg_empty = Settings(sarvam_api_key="   # paste your key here", gemini_api_key="")
    assert cfg_empty.sarvam_api_key is None
    assert cfg_empty.gemini_api_key is None
