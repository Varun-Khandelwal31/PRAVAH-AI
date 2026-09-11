import os
import json
import pytest
from starlette.testclient import TestClient
from app.main import app
from app.api import rest
from app.config import settings

def test_camera_upload_endpoint():
    with TestClient(app) as client:
        # Use existing sample video for test upload
        sample_video_path = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "crowd1.mp4")
        assert os.path.exists(sample_video_path), "sample_data/crowd1.mp4 must exist"

        with open(sample_video_path, "rb") as f:
            response = client.post(
                "/api/cameras/upload",
                files={"file": ("test_upload_crowd.mp4", f, "video/mp4")},
            )

        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data["status"] == "success"
        assert "camera" in data
        cam = data["camera"]
        assert cam["id"].startswith("cam-")
        assert cam["zone_id"].startswith("zone_cam_")
        assert cam["area_m2"] == 40.0

        # Verify rest._engine has the camera source actively registered
        engine = rest._engine
        assert engine is not None
        matching_zones = [z for z in settings.zones if z.id == cam["zone_id"]]
        assert len(matching_zones) == 1
        assert matching_zones[0].area_m2 == 40.0

