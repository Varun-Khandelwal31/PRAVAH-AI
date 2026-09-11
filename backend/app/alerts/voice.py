"""Voice alert resolver prioritizing Sarvam AI with transparent Edge-TTS offline fallback."""
from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
from typing import Optional, Protocol, Tuple

from app.alerts.providers.edge import EdgeProvider
from app.alerts.providers.sarvam import SarvamProvider
from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_AUDIO_DIR = Path(__file__).resolve().parent.parent.parent.parent / "sample_data" / "audio"


class VoiceProvider(Protocol):
    """Protocol defining the interface for voice synthesis providers."""

    async def synthesize(self, text_hindi: str, out_path: Path) -> Path:
        ...


class VoiceAlertResolver:
    """Resolves voice synthesis requests prioritizing Sarvam AI with fail-safe Edge-TTS fallback."""

    def __init__(self, audio_dir: Optional[Path] = None):
        self.audio_dir = Path(audio_dir) if audio_dir is not None else DEFAULT_AUDIO_DIR
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    async def synthesize(
        self,
        text_hindi: str,
        api_key_override: Optional[str] = None,
    ) -> Tuple[Optional[str], str]:
        """Synthesizes Hindi text to audio file.

        Returns:
            Tuple[Optional[str], str]: (audio_url, provider_tag)
                audio_url: web-accessible URL e.g. "/static/audio/abc123_sarvam.wav"
                provider_tag: "via sarvam" or "via edge-tts"

        Guarantees:
            - Never raises an exception above this module.
            - Caches audio by text-hash so repeat alerts don't re-synthesize.
            - Logs ONE warning on Sarvam failure and seamlessly falls back to edge-tts.
        """
        text_hash = hashlib.sha256(text_hindi.encode("utf-8")).hexdigest()[:16]
        sarvam_key = api_key_override if api_key_override is not None else settings.sarvam_api_key

        # 1. Attempt Primary: Sarvam AI if key is present
        if sarvam_key and sarvam_key.strip():
            sarvam_path = self.audio_dir / f"{text_hash}_sarvam.wav"

            # Check cache
            if sarvam_path.exists() and sarvam_path.stat().st_size > 0:
                logger.info("Using cached Sarvam audio: %s", sarvam_path.name)
                return f"/static/audio/{sarvam_path.name}", "via sarvam"

            try:
                provider = SarvamProvider(api_key=sarvam_key.strip())
                await provider.synthesize(text_hindi, sarvam_path)
                logger.info("Synthesized Hindi voice alert via Sarvam AI: %s", sarvam_path.name)
                return f"/static/audio/{sarvam_path.name}", "via sarvam"
            except Exception as e:
                # Log exactly ONE warning as required by spec
                logger.warning("Sarvam unavailable, falling back to edge-tts: %s", e)

        # 2. Fallback: Edge-TTS (offline-friendly, zero keys)
        edge_path = self.audio_dir / f"{text_hash}_edge.mp3"

        # Check cache
        if edge_path.exists() and edge_path.stat().st_size > 0:
            logger.info("Using cached Edge-TTS audio: %s", edge_path.name)
            return f"/static/audio/{edge_path.name}", "via edge-tts"

        try:
            edge_provider = EdgeProvider(voice="hi-IN-SwaraNeural")
            await edge_provider.synthesize(text_hindi, edge_path)
            logger.info("Synthesized Hindi voice alert via edge-tts: %s", edge_path.name)
            return f"/static/audio/{edge_path.name}", "via edge-tts"
        except Exception as e:
            # Voice failures must NEVER raise above this module
            logger.error("All voice providers failed for text '%s': %s", text_hindi[:30], e)
            return None, "via fallback-unavailable"


# Global resolver instance
voice_resolver = VoiceAlertResolver()


async def generate_voice_alert(text_hindi: str) -> Tuple[Optional[str], str]:
    """Top-level helper function for voice alert generation."""
    return await voice_resolver.synthesize(text_hindi)
