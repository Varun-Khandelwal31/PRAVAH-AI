"""Contract verified against Sarvam docs on 2026-09-09. If API changed, fix HERE only.

Sarvam AI Text-to-Speech client implementation.
"""
import base64
import logging
from pathlib import Path
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"


class SarvamProvider:
    """Primary TTS provider leveraging Sarvam AI's Indian language synthesis."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    async def synthesize(self, text_hindi: str, out_path: Path) -> Path:
        """Synthesizes Hindi text to a WAV audio file via Sarvam AI API.

        Raises:
            ValueError: If API key is missing.
            RuntimeError: On HTTP error (401/403/429/500), timeout, or invalid response payload.
        """
        if not self.api_key or not self.api_key.strip():
            raise ValueError("Sarvam API key is missing or empty")

        headers = {
            "api-subscription-key": self.api_key.strip(),
            "Content-Type": "application/json",
        }

        # Contract verified with live Sarvam API on 2026-09-09:
        payload = {
            "text": text_hindi,
            "target_language_code": "hi-IN",
            "speaker": "shreya",
            "model": "bulbul:v3",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(SARVAM_TTS_URL, headers=headers, json=payload)

            if response.status_code != 200:
                raise RuntimeError(
                    f"Sarvam API returned HTTP {response.status_code}: {response.text[:200]}"
                )

            data = response.json()
            audios = data.get("audios")
            if not audios or not isinstance(audios, list) or len(audios) == 0:
                raise RuntimeError(f"Sarvam response missing 'audios' array: {data}")

            audio_base64 = audios[0]
            audio_bytes = base64.b64decode(audio_base64)

            out_path = Path(out_path)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(audio_bytes)

            return out_path

        except (httpx.TimeoutException, httpx.RequestError) as e:
            raise RuntimeError(f"Sarvam network/timeout error: {e}") from e
