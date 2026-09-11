"""Unit tests for UPDATE 3: Mode honesty, Demo controls, and Dynamic Hindi Voice Alerts."""
import os
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import Settings
from app.sim.replay_engine import ReplayEngine, VideoFileSource


def test_trigger_alert_dynamic_highest_risk_zone():
    """Verify POST /api/demo/trigger-alert announces the highest-risk zone dynamically."""
    with TestClient(app) as client:
        # 1. Test with explicit zone_id for Main Concourse
        res = client.post("/api/demo/trigger-alert?zone_id=main_concourse")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "alert_triggered"
        assert data["zone_id"] == "main_concourse"
        assert "मुख्य प्रांगण" in data["text"]
        assert "audio_url" in data

        # 2. Test with explicit zone_id for Live Hall
        res2 = client.post("/api/demo/trigger-alert?zone_id=live_hall")
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["zone_id"] == "live_hall"
        assert "लाइव हॉल" in data2["text"]

        # 3. Test without zone_id: dynamically resolves highest risk zone from engine
        res3 = client.post("/api/demo/trigger-alert")
        assert res3.status_code == 200
        data3 = res3.json()
        assert data3["status"] == "alert_triggered"
        assert "zone_id" in data3
        assert "text" in data3
        assert "कृपया ध्यान दें" in data3["text"]


@pytest.mark.anyio
async def test_tick_contains_real_camera_health_status():
    """Verify tick contains cameras array with real frame-delivery health indicators."""
    with patch.dict(os.environ, {"SOURCE_MODE": "video,webcam"}):
        engine = ReplayEngine()
        assert isinstance(engine.source, VideoFileSource)

        tick = await engine.step()
        assert "cameras" in tick
        cameras = tick["cameras"]
        assert isinstance(cameras, list)
        assert len(cameras) >= 6

        cam1 = next((c for c in cameras if c["id"] == "cam-01"), None)
        assert cam1 is not None
        assert "online" in cam1
        assert isinstance(cam1["online"], bool)

        # Test stalled camera behavior
        target_cam = engine.source.cameras[0]
        target_cam.last_frame_time = 0.0  # simulate no frame delivered in >5s
        target_cam.is_connected = False

        tick2 = await engine.step()
        cameras2 = tick2["cameras"]
        cam1_after = next((c for c in cameras2 if c["id"] == target_cam.cam_id.lower()), None)
        assert cam1_after is not None
        assert cam1_after["online"] is False


def test_drill_scenario_endpoints():
    """Verify drill scenario endpoints /demo/escalate and /demo/clear."""
    with TestClient(app) as client:
        # Inject drill scenario
        res = client.post("/demo/escalate?speed_mult=3.0")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "escalating"

        # End drill scenario
        res2 = client.post("/demo/clear")
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["status"] == "cleared"
