"""Offline-friendly zero-key Hindi Text-to-Speech fallback provider using edge-tts."""
import logging
from pathlib import Path
from typing import Optional
import edge_tts

logger = logging.getLogger(__name__)

EDGE_VOICE_MAP = {
    "hi": "hi-IN-SwaraNeural",
    "hi-IN": "hi-IN-SwaraNeural",
    "te": "te-IN-ShrutiNeural",
    "te-IN": "te-IN-ShrutiNeural",
    "ta": "ta-IN-PallaviNeural",
    "ta-IN": "ta-IN-PallaviNeural",
    "bn": "bn-IN-TanishaaNeural",
    "bn-IN": "bn-IN-TanishaaNeural",
    "en": "en-IN-NeerjaNeural",
    "en-IN": "en-IN-NeerjaNeural",
}


class EdgeProvider:
    """Fallback zero-key TTS provider using edge-tts with native Indian neural voices."""

    def __init__(self, voice: Optional[str] = None, lang: str = "hi"):
        if voice:
            self.voice = voice
        else:
            self.voice = EDGE_VOICE_MAP.get(lang, "hi-IN-SwaraNeural")

    async def synthesize(self, text: str, out_path: Path) -> Path:
        """Synthesizes Hindi text to an audio file using edge-tts.

        Raises:
            RuntimeError: If edge-tts synthesis encounters an unrecoverable error.
        """
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            communicate = edge_tts.Communicate(text, self.voice)
            await communicate.save(str(out_path))

            if not out_path.exists() or out_path.stat().st_size == 0:
                raise RuntimeError(f"Edge-TTS produced empty or missing file at {out_path}")

            return out_path
        except Exception as e:
            logger.error("CRITICAL: edge-tts synthesis failed: %s", e, exc_info=True)
            raise RuntimeError(f"edge-tts synthesis failed: {e}") from e
