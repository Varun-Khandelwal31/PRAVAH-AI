import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.sim.replay_engine import TimelineSource, ReplayEngine


def test_timeline_source_load(tmp_path):
    timeline_file = tmp_path / "timeline.json"
    dummy_data = [
        {
            "ts": "2026-09-11T00:00:00Z",
            "tick_index": 0,
            "zones": [{"id": "barricade_corridor", "name": "Barricade Corridor", "density": 0.8, "risk": 15.0}],
            "alerts": [],
            "cameras": [{"id": "cam-01", "name": "CAM-01", "online": True}],
        },
        {
            "ts": "2026-09-11T00:00:01Z",
            "tick_index": 1,
            "zones": [{"id": "barricade_corridor", "name": "Barricade Corridor", "density": 4.2, "risk": 88.0}],
            "alerts": [{"id": "alert_1", "zone": "Barricade Corridor", "risk": 88.0, "actions": ["Open Gate 2"]}],
            "cameras": [{"id": "cam-01", "name": "CAM-01", "online": True}],
        },
    ]
    timeline_file.write_text(json.dumps(dummy_data), encoding="utf-8")

    source = TimelineSource(timeline_path=timeline_file)
    assert len(source.ticks) == 2

    tick1 = source.read_tick()
    assert tick1 is not None
    assert tick1["zones"][0]["density"] == 0.8
    assert len(tick1["cameras"]) == 1

    tick2 = source.read_tick()
    assert tick2 is not None
    assert tick2["zones"][0]["density"] == 4.2
    assert len(tick2["alerts"]) == 1

    # Loop wraps around
    tick3 = source.read_tick()
    assert tick3["zones"][0]["density"] == 0.8

    # Frame read
    ret, frame, _ = source.read()
    assert ret is True
    assert frame is not None
    assert frame.shape == (720, 1280, 3)

    # JPEG preview
    jpeg = source.get_camera_jpeg("cam-01")
    assert jpeg is not None
    assert jpeg.startswith(b"\xff\xd8")


@pytest.mark.anyio
async def test_replay_engine_timeline_mode(tmp_path):
    timeline_file = tmp_path / "timeline.json"
    dummy_data = [
        {
            "ts": "2026-09-11T00:00:00Z",
            "tick_index": 0,
            "zones": [{"id": "barricade_corridor", "name": "Barricade Corridor", "density": 0.8, "risk": 15.0}],
            "alerts": [],
        }
    ]
    timeline_file.write_text(json.dumps(dummy_data), encoding="utf-8")

    source = TimelineSource(timeline_path=timeline_file)
    engine = ReplayEngine(source=source)
    assert engine.fps == 1.0 or engine.fps == 5.0

    tick = await engine.step()
    assert tick is not None
    assert tick["zones"][0]["id"] == "barricade_corridor"

    jpeg = engine.get_camera_jpeg("cam-01")
    assert jpeg is not None
    assert jpeg.startswith(b"\xff\xd8")
