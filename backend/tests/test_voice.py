"""Unit tests for Phase 5 voice alerting and fallback resolver."""
from pathlib import Path
import pytest
from app.alerts.ai_summary import generate_incident_summary_hindi
from app.alerts.providers.edge import EdgeProvider
from app.alerts.voice import VoiceAlertResolver
from app.config import settings


@pytest.mark.anyio
async def test_edge_provider_synthesizes_hindi_audio(tmp_path: Path):
    """Verify EdgeProvider generates valid, non-empty audio using hi-IN-SwaraNeural."""
    provider = EdgeProvider(voice="hi-IN-SwaraNeural")
    out_file = tmp_path / "test_swara.mp3"
    result = await provider.synthesize("परीक्षण संदेश", out_file)

    assert result.exists()
    assert result.stat().st_size > 500  # valid audio file size


@pytest.mark.anyio
async def test_voice_resolver_empty_key_uses_edge_tts(tmp_path: Path):
    """Verify empty SARVAM_API_KEY routes to Edge-TTS without failure."""
    resolver = VoiceAlertResolver(audio_dir=tmp_path)
    text = "ज़ोन 3 में भीड़ बढ़ रही है।"

    url, tag = await resolver.synthesize(text, api_key_override="")
    assert url is not None
    assert tag == "via edge-tts"
    assert url.startswith("/static/audio/")
    assert url.endswith(".mp3")


@pytest.mark.anyio
async def test_voice_resolver_caches_by_text_hash(tmp_path: Path):
    """Verify repeated synthesis requests with identical text use cached audio."""
    resolver = VoiceAlertResolver(audio_dir=tmp_path)
    text = "कैश परीक्षण संदेश"

    url1, tag1 = await resolver.synthesize(text, api_key_override=None)
    # Second call should return immediately from cache
    url2, tag2 = await resolver.synthesize(text, api_key_override=None)

    assert url1 == url2
    assert tag1 == tag2


@pytest.mark.anyio
async def test_voice_resolver_invalid_key_falls_back_to_edge_tts(tmp_path: Path):
    """Verify invalid or rejected Sarvam API key falls back to Edge-TTS with ONE warning."""
    resolver = VoiceAlertResolver(audio_dir=tmp_path)
    text = "अवैध कुंजी फॉलबैक परीक्षण"

    url, tag = await resolver.synthesize(text, api_key_override="invalid_dummy_key_403")
    assert url is not None
    assert tag == "via edge-tts"


@pytest.mark.anyio
async def test_gemini_summary_silent_skip_when_key_absent(monkeypatch):
    """Verify AI incident summary silently returns None when GEMINI_API_KEY is not set."""
    monkeypatch.setattr(settings, "gemini_api_key", None)
    summary = await generate_incident_summary_hindi(zone_name="Barricade Corridor", peak_density=4.1)
    # With no GEMINI_API_KEY set, must silently return None
    assert summary is None
