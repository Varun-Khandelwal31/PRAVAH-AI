"""Offline-friendly zero-key Hindi Text-to-Speech fallback provider using edge-tts."""
import logging
from pathlib import Path
import edge_tts

logger = logging.getLogger(__name__)


class EdgeProvider:
    """Fallback zero-key TTS provider using edge-tts with Hindi Swara neural voice."""

    def __init__(self, voice: str = "hi-IN-SwaraNeural"):
        self.voice = voice

    async def synthesize(self, text_hindi: str, out_path: Path) -> Path:
        """Synthesizes Hindi text to an audio file using edge-tts.

        Raises:
            RuntimeError: If edge-tts synthesis encounters an unrecoverable error.
        """
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            communicate = edge_tts.Communicate(text_hindi, self.voice)
            await communicate.save(str(out_path))

            if not out_path.exists() or out_path.stat().st_size == 0:
                raise RuntimeError(f"Edge-TTS produced empty or missing file at {out_path}")

            return out_path
        except Exception as e:
            logger.error("CRITICAL: edge-tts synthesis failed: %s", e, exc_info=True)
            raise RuntimeError(f"edge-tts synthesis failed: {e}") from e
