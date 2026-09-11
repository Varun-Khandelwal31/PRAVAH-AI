"""REST API endpoints for configuration, incidents history, and demo controls."""
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Global references set during app lifecycle
_engine = None
_demo_controller = None


def set_services(engine, demo_controller):
    global _engine, _demo_controller
    _engine = engine
    _demo_controller = demo_controller


def get_engine():
    return _engine


def get_demo_controller():
    return _demo_controller


@router.get("/api/config")
def get_config():
    """Returns zone specifications, floor layout, and system settings."""
    raw_mode = os.environ.get("SOURCE_MODE", settings.source_mode)
    is_webcam = "webcam" in raw_mode.lower() or settings.is_webcam_enabled
    return {
        "zones": [zone.model_dump() for zone in settings.zones],
        "voice_provider": "sarvam" if settings.sarvam_api_key else "edge-tts",
        "source_mode": raw_mode,
        "is_webcam_enabled": is_webcam,
    }


@router.get("/api/feed.mjpeg")
@router.get("/api/feed/{cam_id}.mjpeg")
@router.get("/api/feed/{cam_id}")
async def get_mjpeg_feed(cam_id: Optional[str] = None):
    """Streams live CCTV feed as an MJPEG multipart stream for a specific camera or default."""
    import asyncio
    import cv2
    from fastapi.responses import StreamingResponse

    engine = get_engine()
    if not engine:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    target_cam = cam_id
    if target_cam and target_cam.endswith(".mjpeg"):
        target_cam = target_cam[:-6]

    async def frame_stream():
        while True:
            jpeg_bytes = None
            if hasattr(engine, "get_camera_jpeg") and target_cam:
                jpeg_bytes = engine.get_camera_jpeg(target_cam)

            if jpeg_bytes is None:
                # Fallback to current frame of engine
                frame = getattr(engine, "current_frame", None)
                if frame is not None:
                    ret, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                    if ret:
                        jpeg_bytes = jpeg.tobytes()

            if jpeg_bytes is not None:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
                )
            await asyncio.sleep(0.1)

    return StreamingResponse(
        frame_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/api/incidents")
def get_incidents() -> List[Dict[str, Any]]:
    """Retrieves recorded incident audit log entries from JSONL store."""
    incidents_path = Path(__file__).resolve().parent.parent.parent.parent / "sample_data" / "incidents.jsonl"
    if not incidents_path.exists():
        return []

    records = []
    try:
        with open(incidents_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    except Exception as e:
        logger.error("Error reading incidents file: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read incidents store")

    return records


@router.post("/demo/escalate")
@router.post("/api/demo/escalate")
async def trigger_demo_escalate(speed_mult: float = 1.0):
    """Triggers the scripted crowd crush escalation demo sequence."""
    controller = get_demo_controller()
    if not controller:
        raise HTTPException(status_code=503, detail="Demo controller not initialized")

    await controller.escalate(speed_mult=speed_mult)
    return {
        "status": "escalating",
        "message": f"Demo escalation initiated on Barricade Corridor (speed={speed_mult}x)",
    }


@router.post("/demo/clear")
@router.post("/api/demo/clear")
async def trigger_demo_clear():
    """Resets simulator and engine state back to nominal circulation."""
    controller = get_demo_controller()
    if not controller:
        raise HTTPException(status_code=503, detail="Demo controller not initialized")

    await controller.clear()
    return {
        "status": "cleared",
        "message": "Demo reset to nominal green state",
    }


ZONE_HINDI_NAMES = {
    "north_entry": "उत्तरी प्रवेश द्वार (नॉर्थ एंट्री)",
    "ticket_queue": "टिकट कतार",
    "barricade_corridor": "बैरिकेड कॉरिडोर",
    "side_passage": "पार्श्व मार्ग (साइड पैसेज)",
    "east_wing": "पूर्वी विंग (ईस्ट विंग)",
    "main_concourse": "मुख्य प्रांगण (मेन कॉनकोर्स)",
    "gate_2_overflow": "गेट 2 ओवरफ्लो",
    "exit_lane": "निकास मार्ग",
    "live_hall": "लाइव हॉल",
}


@router.post("/api/demo/trigger-alert")
@router.post("/demo/trigger-alert")
async def trigger_demo_alert(request: Request, zone_id: Optional[str] = Query(None)):
    """Synthesizes and emits a live Hindi voice alert for the active highest-risk zone across all modes."""
    from app.alerts.voice import generate_voice_alert

    engine = _engine or getattr(request.app.state, "engine", None)
    target_zone_id = zone_id
    target_zone_name = "Barricade Corridor"

    if engine is not None and hasattr(engine, "get_highest_risk_zone"):
        if not target_zone_id:
            hz = engine.get_highest_risk_zone()
            if hz:
                target_zone_id = hz.get("id", "barricade_corridor")
                target_zone_name = hz.get("name", "Barricade Corridor")
        else:
            for z in settings.zones:
                if z.id == target_zone_id:
                    target_zone_name = z.name
                    break

    if not target_zone_id:
        target_zone_id = "barricade_corridor"
        target_zone_name = "Barricade Corridor"

    hindi_zone = ZONE_HINDI_NAMES.get(target_zone_id, target_zone_name)
    hindi_text = f"कृपया ध्यान दें, {hindi_zone} में भीड़ अत्यधिक बढ़ गई है। कृपया वैकल्पिक मार्ग का उपयोग करें और तुरंत सुरक्षित क्षेत्र की ओर बढ़ें।"
    audio_url, provider = await generate_voice_alert(hindi_text)

    return {
        "status": "alert_triggered",
        "zone": target_zone_name,
        "zone_id": target_zone_id,
        "text": hindi_text,
        "audio_url": audio_url,
        "provider": provider,
    }


@router.get("/api/alert/audio")
async def get_alert_audio(p: str = ""):
    """Streams the alert audio file or synthesizes on demand."""
    from fastapi.responses import FileResponse
    from app.alerts.voice import generate_voice_alert
    
    base = Path(__file__).resolve().parent.parent.parent.parent
    clean_p = p.strip()
    if clean_p:
        possible = [
            base / clean_p,
            base / "sample_data" / "audio" / Path(clean_p).name,
            base / "alerts" / "cache" / Path(clean_p).name,
        ]
        for candidate in possible:
            if candidate.exists() and candidate.stat().st_size > 0:
                media = "audio/wav" if candidate.suffix == ".wav" else "audio/mpeg"
                return FileResponse(str(candidate), media_type=media)
    
    # If not found or missing, synthesize live
    url, _ = await generate_voice_alert("कृपया ध्यान दें, बैरिकेड कॉरिडोर में भीड़ अत्यधिक बढ़ गई है। कृपया वैकल्पिक मार्ग से जाएं।")
    if url:
        name = url.split("/")[-1]
        candidate = base / "sample_data" / "audio" / name
        if candidate.exists() and candidate.stat().st_size > 0:
            media = "audio/wav" if candidate.suffix == ".wav" else "audio/mpeg"
            return FileResponse(str(candidate), media_type=media)

    raise HTTPException(status_code=404, detail="Audio unavailable")
