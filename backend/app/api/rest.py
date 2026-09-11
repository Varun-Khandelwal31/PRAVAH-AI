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


LOCALIZED_ALERTS = {
    "hi": {
        "lang_name": "हिंदी (Hindi · Maha Kumbh / Kashi)",
        "zone_names": {
            "north_entry": "उत्तरी प्रवेश द्वार",
            "ticket_queue": "टिकट कतार",
            "barricade_corridor": "बैरिकेड कॉरिडोर (ज़ोन 3)",
            "side_passage": "पार्श्व मार्ग",
            "east_wing": "पूर्वी विंग",
            "main_concourse": "मुख्य प्रांगण",
            "gate_2_overflow": "गेट 2 ओवरफ्लो",
            "exit_lane": "निकास मार्ग",
            "live_hall": "लाइव हॉल",
        },
        "template": "कृपया ध्यान दें, {zone} में भीड़ खतरनाक स्तर पर पहुँच रही है। गेट 2 खोलें, भीड़ को साइड पैसेज मोड़ें, दो मार्शल तुरंत भेजें।",
    },
    "te": {
        "lang_name": "తెలుగు (Telugu · Tirupati Balaji)",
        "zone_names": {
            "north_entry": "ఉత్తర ప్రవేశ ద్వారం",
            "ticket_queue": "టికెట్ క్యూ",
            "barricade_corridor": "బారికేడ్ కారిడార్ (జోన్ 3)",
            "side_passage": "సైడ్ పాసేజ్",
            "east_wing": "తూర్పు విభాగం",
            "main_concourse": "ప్రధాన ప్రాంగణం",
            "gate_2_overflow": "గేట్ 2 ఓవర్‌ఫ్లో",
            "exit_lane": "నిష్క్రమణ దారి",
            "live_hall": "లైవ్ హాల్",
        },
        "template": "దయచేసి గమనించండి, {zone} వద్ద రద్దీ ప్రమాదకర స్థాయికి చేరుకుంది. గేట్ 2 తెరవండి, సైడ్ పాసేజ్ ద్వారా దారి మళ్లించండి, ఇద్దరు మార్షల్స్‌ను పంపండి.",
    },
    "ta": {
        "lang_name": "தமிழ் (Tamil · Madurai Meenakshi)",
        "zone_names": {
            "north_entry": "வடக்கு நுழைவாயில்",
            "ticket_queue": "டிக்கெட் வரிசை",
            "barricade_corridor": "தடுப்பு நடைபாதை (மண்டலம் 3)",
            "side_passage": "பக்கவாட்டு பாதை",
            "east_wing": "கிழக்கு பிரிவு",
            "main_concourse": "மைய மண்டபம்",
            "gate_2_overflow": "கேட் 2 வழிதல்",
            "exit_lane": "வெளியேறும் பாதை",
            "live_hall": "நேரலை கூடம்",
        },
        "template": "கவனிக்கவும், {zone} பகுதியில் கூட்டம் ஆபத்தான நிலையை எட்டியுள்ளது. கேட் 2 ஐத் திறக்கவும், மாற்றுப் பாதையில் திருப்பிவிடவும், இரண்டு மார்ஷல்களை அனுப்பவும்.",
    },
    "bn": {
        "lang_name": "বাংলা (Bengali · Kalighat / Gangasagar)",
        "zone_names": {
            "north_entry": "উত্তর প্রবেশদ্বার",
            "ticket_queue": "টিকিট লাইন",
            "barricade_corridor": "ব্যারিকেড করিডোর (জোন ৩)",
            "side_passage": "পার্শ্ব পথ",
            "east_wing": "পূর্ব উইং",
            "main_concourse": "প্রধান চত্বর",
            "gate_2_overflow": "গেট ২ ওভারফ্লো",
            "exit_lane": "প্রস্থান পথ",
            "live_hall": "লাইভ হল",
        },
        "template": "অনুগ্রহ করে মনোযোগ দিন, {zone} এ ভিড় বিপজ্জনক মাত্রায় পৌঁছেছে। গেট ২ খুলুন, সাইড প্যাসেজ দিয়ে ডাইভার্ট করুন, দুজন মার্শাল পাঠান।",
    },
    "en": {
        "lang_name": "English (National Standard)",
        "zone_names": {
            "north_entry": "North Entry",
            "ticket_queue": "Ticket Queue",
            "barricade_corridor": "Barricade Corridor (Zone 3)",
            "side_passage": "Side Passage",
            "east_wing": "East Wing",
            "main_concourse": "Main Concourse",
            "gate_2_overflow": "Gate 2 Overflow",
            "exit_lane": "Exit Lane",
            "live_hall": "Live Hall",
        },
        "template": "Attention please, crowd density in {zone} has reached critical levels. Open Gate 2, divert flow via Side Passage, and dispatch two marshals immediately.",
    },
}

ZONE_HINDI_NAMES = LOCALIZED_ALERTS["hi"]["zone_names"]


@router.post("/api/demo/trigger-alert")
@router.post("/demo/trigger-alert")
async def trigger_demo_alert(
    request: Request,
    zone_id: Optional[str] = Query(None),
    lang: str = Query("hi"),
):
    """Synthesizes and emits a live regional Indian voice alert for the active highest-risk zone."""
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

    lang_data = LOCALIZED_ALERTS.get(lang, LOCALIZED_ALERTS["hi"])
    loc_zone = lang_data["zone_names"].get(target_zone_id, target_zone_name)
    alert_text = lang_data["template"].format(zone=loc_zone)

    audio_url, provider = await generate_voice_alert(alert_text, lang=lang)

    return {
        "status": "alert_triggered",
        "zone": target_zone_name,
        "zone_id": target_zone_id,
        "lang": lang,
        "lang_name": lang_data["lang_name"],
        "text": alert_text,
        "audio_url": audio_url,
        "provider": provider,
    }


@router.post("/api/alerts/dispatch-marshal")
async def dispatch_marshal_alert(
    request: Request,
    zone_id: Optional[str] = Query(None),
    lang: str = Query("hi"),
    phone: str = Query("+91 98112 40192"),
    marshal_name: str = Query("Inspector Rajesh Sharma · Sector 3"),
):
    """Dispatches emergency tactical alert directly to on-ground marshal over simulated WhatsApp & SMS bridge."""
    from app.alerts.voice import generate_voice_alert

    engine = _engine or getattr(request.app.state, "engine", None)
    target_zone_id = zone_id or "barricade_corridor"
    target_zone_name = "Barricade Corridor"
    for z in settings.zones:
        if z.id == target_zone_id:
            target_zone_name = z.name
            break

    lang_data = LOCALIZED_ALERTS.get(lang, LOCALIZED_ALERTS["hi"])
    loc_zone = lang_data["zone_names"].get(target_zone_id, target_zone_name)
    alert_text = lang_data["template"].format(zone=loc_zone)
    audio_url, provider = await generate_voice_alert(alert_text, lang=lang)

    actions = [
        "1. Open Gate 2 for emergency overflow",
        "2. Divert inward queue via Side Passage",
        "3. Dispatch 2 quick-reaction marshals",
    ]

    dispatch_record = {
        "dispatch_id": f"DSP-{hash(alert_text) % 100000:05d}",
        "channel": "WhatsApp Business API & C-DoT National SMS Gateway",
        "marshal_name": marshal_name,
        "phone": phone,
        "zone_id": target_zone_id,
        "zone_name": target_zone_name,
        "status": "DELIVERED",
        "delivery_latency_ms": 320,
        "actions": actions,
        "alert_text": alert_text,
        "audio_url": audio_url,
        "provider": provider,
    }

    if engine and hasattr(engine, "log_incident_event"):
        engine.log_incident_event(
            event_type="marshal_dispatch",
            zone_id=target_zone_id,
            zone_name=target_zone_name,
            payload=dispatch_record,
        )

    return dispatch_record


@router.post("/api/alerts/acknowledge-dispatch")
async def acknowledge_marshal_dispatch(
    zone_id: str = Query("barricade_corridor"),
    marshal_name: str = Query("Inspector Rajesh Sharma"),
    note: str = Query("Gate 2 opened, crowd flow diverting safely into Side Passage."),
):
    """Simulates on-ground marshal physical acknowledgment back to PravahAI command center."""
    engine = get_engine()
    ack_payload = {
        "marshal_name": marshal_name,
        "status": "ACKNOWLEDGED_PHYSICALLY",
        "note": note,
    }

    if engine and hasattr(engine, "log_incident_event"):
        engine.log_incident_event(
            event_type="marshal_ack",
            zone_id=zone_id,
            zone_name="Barricade Corridor",
            payload=ack_payload,
        )

    return {"status": "success", "ack": ack_payload}


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
