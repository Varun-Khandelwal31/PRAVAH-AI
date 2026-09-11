"""Optional AI incident situation summary generator using Gemini API."""
import logging
from typing import Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def generate_incident_summary_hindi(
    zone_name: str,
    peak_density: float,
) -> Optional[str]:
    """Generates a concise 1-line Hindi situation summary when an incident clears.

    Silently skips if GEMINI_API_KEY is absent or if the network call fails.
    """
    api_key = settings.gemini_api_key
    if not api_key or not api_key.strip():
        return None

    prompt = (
        f"You are a command center AI safety system. A crowd crush hazard at '{zone_name}' "
        f"with peak density {peak_density:.1f} p/m² has now been cleared. "
        "Write exactly ONE short professional sentence in Hindi summarizing the successful resolution. No English, no explanations."
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key.strip()}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 120},
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
    except Exception as e:
        logger.debug("Gemini incident summary skipped: %s", e)

    return None
