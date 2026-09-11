from pathlib import Path
from typing import List, Optional
import json
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Zone(BaseModel):
    """Represents a monitored crowd safety zone with its spatial polygon and thresholds."""
    id: str
    name: str
    points: List[List[float]]
    area_m2: float
    critical_threshold: float = 4.0

    @property
    def polygon(self) -> List[List[float]]:
        """Alias for points representing normalized polygon coordinates."""
        return self.points


class Settings(BaseSettings):
    """Application settings loaded from .env and zones.json via pydantic-settings."""
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    sarvam_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    zones_file: Optional[Path] = None
    weights_path: Path = Path("vendor/weights/yolov8n.pt")
    frame_skip: int = 0
    source_mode: str = "video"
    pipeline_fps: float = 5.0
    live_hall_area_m2: float = 30.0
    zones: List[Zone] = Field(default_factory=list)

    @property
    def is_webcam_enabled(self) -> bool:
        mode = (self.source_mode or "").lower()
        return "webcam" in mode

    @property
    def is_video_enabled(self) -> bool:
        mode = (self.source_mode or "").lower()
        return "video" in mode or ("simulator" not in mode and "timeline" not in mode and not self.is_webcam_enabled)

    @field_validator("sarvam_api_key", "gemini_api_key", mode="before")
    @classmethod
    def clean_api_key(cls, v: Optional[str]) -> Optional[str]:
        """Convert empty strings or inline comment placeholders into None."""
        if v is None:
            return None
        v = str(v).strip()
        if not v or v.startswith("#"):
            return None
        # Handle trailing unquoted comment in .env line if present
        if " #" in v:
            v = v.split(" #", 1)[0].strip()
        return v if v else None

    @model_validator(mode="after")
    def load_zones_data(self) -> "Settings":
        """Load zone geometries and threshold configs from sample_data/zones.json."""
        if self.zones:
            return self

        candidate_paths = []
        if self.zones_file:
            candidate_paths.append(self.zones_file)

        current_file_dir = Path(__file__).resolve().parent
        candidate_paths.extend([
            current_file_dir.parent.parent / "sample_data" / "zones.json",
            current_file_dir.parent / "sample_data" / "zones.json",
            Path.cwd() / "sample_data" / "zones.json",
            Path.cwd().parent / "sample_data" / "zones.json",
        ])

        found_path: Optional[Path] = None
        for path in candidate_paths:
            if path and path.exists():
                found_path = path
                break

        if found_path and found_path.exists():
            with open(found_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.zones = [Zone(**item) for item in data]

        if self.is_webcam_enabled and not any(z.id == "live_hall" for z in self.zones):
            self.zones.append(
                Zone(
                    id="live_hall",
                    name="Live Hall",
                    points=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                    area_m2=self.live_hall_area_m2,
                    critical_threshold=4.0,
                )
            )

        return self


settings = Settings()
