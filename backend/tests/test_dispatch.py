import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_dispatch_marshal_endpoint():
    client = TestClient(app)
    response = client.post("/api/alerts/dispatch-marshal?lang=hi&zone_id=barricade_corridor")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "DELIVERED"
    assert "dispatch_id" in data
    assert "WhatsApp" in data["channel"]
    assert len(data["actions"]) == 3
    assert data["audio_url"] is not None


def test_dispatch_regional_languages():
    client = TestClient(app)
    for lang in ["te", "ta", "bn", "en"]:
        response = client.post(f"/api/alerts/dispatch-marshal?lang={lang}&zone_id=barricade_corridor")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "DELIVERED"
        assert len(data["alert_text"]) > 10


def test_acknowledge_marshal_dispatch():
    client = TestClient(app)
    response = client.post(
        "/api/alerts/acknowledge-dispatch?zone_id=barricade_corridor&note=Gate%202%20opened"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["ack"]["status"] == "ACKNOWLEDGED_PHYSICALLY"
