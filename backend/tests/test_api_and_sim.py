"""Integration tests for simulator, replay engine, and REST/WebSocket APIs."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.sim.simulator import CrowdSimulator
from app.sim.replay_engine import ReplayEngine, SimulatorSource


def test_crowd_simulator_basics():
    """Verify CrowdSimulator initializes 30-80 agents and renders 1280x720 frames."""
    sim = CrowdSimulator(num_agents=50)
    assert len(sim.agents) == 50

    # Advance tick
    sim.update(dt=0.2)
    frame = sim.render_frame()
    assert frame.shape == (720, 1280, 3)

    centroids = sim.get_agent_centroids()
    assert len(centroids) == 50
    for cx, cy, conf in centroids:
        assert 0.0 <= cx <= 1.0
        assert 0.0 <= cy <= 1.0
        assert conf >= 0.35


@pytest.mark.anyio
async def test_replay_engine_step():
    """Verify ReplayEngine step produces compliant tick dictionary."""
    engine = ReplayEngine(source=SimulatorSource())
    tick = await engine.step()

    assert "ts" in tick
    assert "zones" in tick
    assert "alerts" in tick
    assert len(tick["zones"]) == 8

    # Verify zone fields
    sample_z = tick["zones"][0]
    expected_fields = {"id", "name", "density", "jam", "surge", "trend_slope", "risk", "eta_s", "level"}
    assert expected_fields.issubset(sample_z.keys())


def test_rest_api_config_and_incidents():
    """Verify REST endpoints for configuration, incidents, and demo controls."""
    with TestClient(app) as client:
        # GET /health
        health = client.get("/health").json()
        assert health["status"] == "healthy"
        assert health["zones_count"] == 8

        # GET /api/config
        config = client.get("/api/config").json()
        assert len(config["zones"]) == 8
        assert config["source_mode"] in ("simulator", "video")

        # GET /api/incidents
        incidents = client.get("/api/incidents").json()
        assert isinstance(incidents, list)

        # POST /demo/escalate and POST /demo/clear
        esc = client.post("/demo/escalate?speed_mult=5.0").json()
        assert esc["status"] == "escalating"

        clr = client.post("/demo/clear").json()
        assert clr["status"] == "cleared"


def test_websocket_stream_connect():
    """Verify WebSocket client can connect and receive live ticks."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws/stream") as websocket:
            data = websocket.receive_json()
            assert "ts" in data
            assert "zones" in data
            assert len(data["zones"]) == 8


@pytest.mark.anyio
async def test_replay_engine_timeline_mode(monkeypatch):
    """Verify ReplayEngine in timeline mode streams pre-computed ticks at 1 Hz with zero CV compute."""
    monkeypatch.setenv("SOURCE_MODE", "timeline")
    from app.sim.replay_engine import TimelineSource
    engine = ReplayEngine()
    assert isinstance(engine.source, TimelineSource)
    assert engine.fps == 1.0

    tick = await engine.step()
    assert "ts" in tick
    assert "zones" in tick
    assert len(tick["zones"]) == 8
    # Centroids/CV detector is bypassed
    assert engine.current_frame is not None

