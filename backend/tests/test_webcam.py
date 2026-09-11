"""Unit tests for UPDATE 2: Live webcam proof mode and hybrid mode."""
import asyncio
import os
from pathlib import Path
from unittest.mock import MagicMock, patch
import numpy as np
import pytest
from app.config import Settings, Zone
from app.pipeline.density import point_in_polygon
from app.sim.replay_engine import CameraInstance, VideoFileSource, ReplayEngine


def test_webcam_mode_settings():
    """Verify SOURCE_MODE=webcam dynamically injects the 9th Live Hall zone."""
    s = Settings(source_mode="webcam", live_hall_area_m2=42.0, _env_file=None)
    assert s.is_webcam_enabled is True
    assert s.is_video_enabled is False
    assert len(s.zones) == 9

    live_hall = next((z for z in s.zones if z.id == "live_hall"), None)
    assert live_hall is not None
    assert live_hall.name == "Live Hall"
    assert live_hall.area_m2 == 42.0
    assert live_hall.critical_threshold == 4.0
    assert live_hall.points == [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]


def test_hybrid_mode_settings():
    """Verify SOURCE_MODE=video,webcam enables both video and webcam."""
    s = Settings(source_mode="video,webcam", live_hall_area_m2=30.0, _env_file=None)
    assert s.is_webcam_enabled is True
    assert s.is_video_enabled is True
    assert len(s.zones) == 9
    assert any(z.id == "live_hall" for z in s.zones)


def test_camera_instance_webcam_fallback():
    """Verify CameraInstance handles unavailable webcam device gracefully without raising."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    with patch("cv2.VideoCapture") as mock_cap:
        mock_instance = MagicMock()
        mock_instance.isOpened.return_value = False
        mock_cap.return_value = mock_instance

        cam = CameraInstance(
            config={
                "cam_id": "CAM-LIVE",
                "name": "Live Hall",
                "source": 0,
                "zones": [{"zone_id": "live_hall", "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], "area_m2": 30.0}],
            },
            base_dir=base_dir,
        )
        assert cam.is_webcam is True
        assert cam.is_connected is False
        frame = cam.read_frame()
        assert frame is None


def test_videofilesource_attaches_live_hall_camera():
    """Verify VideoFileSource instantiates CAM-LIVE when webcam is enabled in env/settings."""
    with patch.dict(os.environ, {"SOURCE_MODE": "video,webcam"}):
        with patch("cv2.VideoCapture"):
            source = VideoFileSource()
            assert any(c.cam_id == "CAM-LIVE" for c in source.cameras)

            # get_camera_jpeg should return valid JPEG bytes even if offline placeholder
            jpeg = source.get_camera_jpeg("cam-live")
            assert isinstance(jpeg, bytes)
            assert len(jpeg) > 0
            # Check JPEG header 0xFF 0xD8
            assert jpeg[:2] == b"\xff\xd8"


@pytest.mark.anyio
async def test_replay_engine_webcam_disconnect_never_crashes():
    """Verify ReplayEngine.step() handles webcam disconnection safely with alert toast and no crash."""
    with patch.dict(os.environ, {"SOURCE_MODE": "video,webcam", "LIVE_HALL_AREA_M2": "30.0"}):
        engine = ReplayEngine()

        # Find webcam camera
        video_source = engine.source
        assert isinstance(video_source, VideoFileSource)
        webcam_cam = next((c for c in video_source.cameras if c.cam_id == "CAM-LIVE"), None)
        assert webcam_cam is not None

        # Force simulate disconnected webcam and set camera_index to CAM-LIVE
        webcam_cam.read_frame = MagicMock(return_value=None)
        webcam_cam.is_connected = False
        video_source.camera_index = video_source.cameras.index(webcam_cam)

        # Execute step; must not raise exception
        tick = await engine.step()
        assert "zones" in tick

        # Live hall zone should be present in tick
        live_hall_tick = next((z for z in tick["zones"] if z["id"] == "live_hall"), None)
        assert live_hall_tick is not None
        assert live_hall_tick["name"] == "Live Hall"
        assert live_hall_tick["density"] == 0.0

        # Device error alert should be emitted
        alerts = tick.get("alerts", [])
        cam_alert = next((a for a in alerts if a.get("id") == "cam_live_error" or a.get("type") == "device_error"), None)
        assert cam_alert is not None
        assert "disconnected" in cam_alert["message"].lower() or "busy" in cam_alert["message"].lower()


def test_live_hall_detection_and_density():
    """Verify that simulated person detections in the webcam frame compute correct count and density."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    cam = CameraInstance(
        config={
            "cam_id": "CAM-LIVE",
            "name": "Live Hall",
            "source": 0,
            "zones": [{"zone_id": "live_hall", "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], "area_m2": 30.0}],
        },
        base_dir=base_dir,
    )
    # 6 centroids inside the frame
    centroids = [
        (0.2, 0.2, 0.9),
        (0.3, 0.3, 0.85),
        (0.5, 0.5, 0.92),
        (0.6, 0.4, 0.88),
        (0.7, 0.8, 0.95),
        (0.1, 0.7, 0.79),
    ]

    matching_count = sum(1 for c in centroids if point_in_polygon(c, cam.zones[0].points))
    assert matching_count == 6

    # Verify density = count / area_m2
    density = round(matching_count / cam.zones[0].area_m2, 2)
    assert density == 0.2
