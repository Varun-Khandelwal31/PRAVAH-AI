"""Acceptance verification script for Phase 5 Hindi voice alerting and fallback chain."""
import asyncio
import json
from pathlib import Path
import httpx
import websockets
from app.alerts.voice import voice_resolver

WS_URL = "ws://127.0.0.1:8000/ws/stream"
HTTP_BASE = "http://127.0.0.1:8000"


async def main():
    print("=" * 65)
    print("PHASE 5 ACCEPTANCE TEST: HINDI VOICE ALERTING & FALLBACK")
    print("=" * 65)

    # TEST 1: EMPTY SARVAM_API_KEY -> Edge-TTS fallback in live alert
    print("\n[TEST 1] Testing live alert generation with EMPTY SARVAM_API_KEY...")
    async with websockets.connect(WS_URL) as ws:
        # Trigger escalation via REST API
        async with httpx.AsyncClient(base_url=HTTP_BASE) as client:
            resp = await client.post("/demo/escalate?speed_mult=6.0")
            print("Triggered POST /demo/escalate -> status:", resp.status_code)

        alert_found = None
        for _ in range(70):
            raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            tick = json.loads(raw)
            if tick.get("alerts") and len(tick["alerts"]) > 0:
                alert_found = tick["alerts"][0]
                break

        assert alert_found is not None, "Failed to capture alert in tick"

        print("\nAlert Payload Captured:")
        print(json.dumps(alert_found, indent=2, ensure_ascii=False))

        assert "audio_url" in alert_found and alert_found["audio_url"], "Missing audio_url"
        assert "via edge-tts" in (alert_found.get("via") or "") or "via edge-tts" in (alert_found.get("provider") or ""), "Expected 'via edge-tts'"

        # Verify static audio serving via HTTP
        audio_url = alert_found["audio_url"]
        async with httpx.AsyncClient(base_url=HTTP_BASE) as client:
            audio_resp = await client.get(audio_url)
            print(f"\nGET {audio_url} -> Status: {audio_resp.status_code}, Bytes: {len(audio_resp.content)}")
            assert audio_resp.status_code == 200, f"Audio static serving failed with {audio_resp.status_code}"
            assert len(audio_resp.content) > 1000, "Audio file is empty or corrupted"

        # Clear demo
        async with httpx.AsyncClient(base_url=HTTP_BASE) as client:
            await client.post("/demo/clear")
            print("Demo state cleared.")

    # TEST 2: DELIBERATELY WRONG KEY -> Resolver logs ONE warning and falls back to edge-tts
    print("\n" + "-" * 65)
    print("[TEST 2] Testing fallback chain with DELIBERATELY WRONG SARVAM_API_KEY...")
    text_test = "ज़ोन 3 में भीड़ खतरनाक स्तर पर पहुँच रही है — गेट 2 खोलें।"
    url_fb, via_fb = await voice_resolver.synthesize(text_test, api_key_override="invalid_deliberate_wrong_key_403")

    print(f"Fallback Result: audio_url={url_fb}, via={via_fb}")
    assert via_fb == "via edge-tts", f"Expected 'via edge-tts', got {via_fb}"
    assert url_fb is not None and url_fb.startswith("/static/audio/"), "Invalid audio URL"

    # Verify fallback audio is playable
    async with httpx.AsyncClient(base_url=HTTP_BASE) as client:
        fb_audio_resp = await client.get(url_fb)
        print(f"GET {url_fb} -> Status: {fb_audio_resp.status_code}, Bytes: {len(fb_audio_resp.content)}")
        assert fb_audio_resp.status_code == 200
        assert len(fb_audio_resp.content) > 1000

    print("\n" + "=" * 65)
    print("ALL PHASE 5 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
