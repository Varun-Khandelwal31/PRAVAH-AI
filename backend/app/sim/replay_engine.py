"""Source adapter and replay engine driving the live 5 FPS pipeline loop."""
import asyncio
from collections import deque
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import time
from typing import Any, Deque, Dict, List, Optional, Tuple
import cv2
import numpy as np

from app.alerts.ai_summary import generate_incident_summary_hindi
from app.alerts.voice import voice_resolver
from app.config import Zone, settings
from app.pipeline.density import compute_zone_densities, point_in_polygon
from app.pipeline.detector import PersonDetector
from app.pipeline.drill import drill_metrics
from app.pipeline.flow import FlowAnalyzer
from app.pipeline.hybrid_density import fuse_zone_count
from app.pipeline.playbook import playbook_for
from app.pipeline.risk import eta_to_critical, level, risk_score
from app.sim.simulator import CrowdSimulator

logger = logging.getLogger(__name__)

ZONE_ALIAS_MAP = {
    "z1": "north_entry",
    "z2": "ticket_queue",
    "z3": "barricade_corridor",
    "z4": "side_passage",
    "z5": "main_concourse",
    "z6": "east_wing",
    "z7": "gate_2_overflow",
    "z8": "exit_lane",
    "z9": "live_hall",
}


class SourceAdapter:
    """Base interface for video and simulation sources."""

    def read(self) -> Tuple[bool, Optional[np.ndarray], Optional[List[Tuple[float, float, float]]]]:
        raise NotImplementedError

    def release(self):
        pass


class SimulatorSource(SourceAdapter):
    """Synthetic crowd source generating frames and agent centroids."""

    def __init__(self, simulator: Optional[CrowdSimulator] = None):
        self.simulator = simulator if simulator is not None else CrowdSimulator()

    def read(self) -> Tuple[bool, Optional[np.ndarray], Optional[List[Tuple[float, float, float]]]]:
        self.simulator.update(dt=0.2)
        frame = self.simulator.render_frame()
        centroids = self.simulator.get_agent_centroids()
        return True, frame, centroids

    def release(self):
        pass


class CameraInstance:
    """Manages an individual video camera stream, its zone definitions, crop rect, and detection state."""

    def __init__(self, config: Dict[str, Any], base_dir: Path):
        self.cam_id = config.get("cam_id", "CAM-01")
        self.name = config.get("name", self.cam_id)
        raw_source = config.get("source", "sample_data/crowd1.mp4")

        self.is_webcam = False
        self.is_connected = True
        self.cap: Optional[cv2.VideoCapture] = None
        self.source_path: Optional[Path] = None

        if raw_source == 0 or raw_source == "0" or str(raw_source).lower() in ("webcam", "live"):
            self.is_webcam = True
            try:
                self.cap = cv2.VideoCapture(0)
                if not self.cap or not self.cap.isOpened():
                    self.is_connected = False
                    logger.warning("Webcam CAM-LIVE (index 0) could not be opened initially.")
                else:
                    self.is_connected = True
            except Exception as e:
                self.is_connected = False
                logger.warning("Error opening webcam index 0: %s", e)
        else:
            # Resolve video file path
            source_path = Path(raw_source)
            if not source_path.is_absolute():
                source_path = base_dir / source_path

            # If designated file doesn't exist, search for existing files in sample_data
            if not source_path.exists():
                for candidate in [
                    base_dir / "sample_data" / "crowd1.mp4",
                    base_dir / "sample_data" / "crowd2.mp4",
                    base_dir / "sample_data" / "crowd.mp4",
                    Path("sample_data/crowd1.mp4"),
                    Path("sample_data/crowd2.mp4"),
                    Path("sample_data/crowd.mp4"),
                ]:
                    if candidate.exists():
                        source_path = candidate
                        break

            self.source_path = source_path
            if self.source_path and self.source_path.exists():
                self.cap = cv2.VideoCapture(str(self.source_path))

        self.crop = config.get("crop", None)  # Optional normalized [x, y, w, h]

        # Parse zones
        raw_zones = config.get("zones", [])
        self.zones: List[Zone] = []
        for z in raw_zones:
            raw_zid = z.get("zone_id", "Z1")
            canonical_id = ZONE_ALIAS_MAP.get(str(raw_zid).lower(), raw_zid)
            default_zone = next((sz for sz in settings.zones if sz.id == canonical_id), None)
            name = z.get("name", default_zone.name if default_zone else canonical_id.replace("_", " ").title())
            area = float(z.get("area_m2", default_zone.area_m2 if default_zone else 30.0))
            poly = z.get("polygon", default_zone.points if default_zone else [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]])
            crit = float(z.get("critical_threshold", default_zone.critical_threshold if default_zone else 4.0))
            self.zones.append(Zone(id=canonical_id, name=name, points=poly, area_m2=area, critical_threshold=crit))

        self.last_frame_time: float = 0.0
        self.prev_frame: Optional[np.ndarray] = None
        self.latest_raw_frame: Optional[np.ndarray] = None
        self.latest_annotated_frame: Optional[np.ndarray] = None
        self.latest_annotated_jpeg: Optional[bytes] = None
        self.latest_centroids: List[Tuple[float, float, float]] = []
        self.latest_boxes: List[Tuple[float, float, float, float, float]] = []
        self.zone_metrics: Dict[str, Dict[str, Any]] = {
            z.id: {
                "count": 0,
                "density": 0.0,
                "jam": 0.0,
                "surge": 0.0,
                "mean_flow": 0.0,
                "yolo_count": 0,
                "occlusion": 0.0,
                "count_source": "yolo",
                "confidence": 1.0,
            }
            for z in self.zones
        }

    def read_frame(self) -> Optional[np.ndarray]:
        if self.is_webcam:
            if not self.cap or not self.cap.isOpened():
                try:
                    self.cap = cv2.VideoCapture(0)
                except Exception:
                    self.cap = None
                if not self.cap or not self.cap.isOpened():
                    self.is_connected = False
                    return None

            try:
                ret, frame = self.cap.read()
            except Exception as e:
                logger.warning("Exception reading webcam: %s", e)
                ret, frame = False, None

            if not ret or frame is None:
                self.is_connected = False
                return None

            self.is_connected = True
            self.last_frame_time = time.time()
            self.latest_raw_frame = frame
            return frame

        if not self.cap or not self.cap.isOpened():
            if self.source_path and self.source_path.exists():
                self.cap = cv2.VideoCapture(str(self.source_path))
            if not self.cap or not self.cap.isOpened():
                self.is_connected = False
                return None

        ret, frame = self.cap.read()
        if not ret or frame is None:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
            if not ret or frame is None:
                self.is_connected = False
                return None

        self.is_connected = True
        self.last_frame_time = time.time()

        # Apply normalized crop if present: [x, y, w, h]
        if self.crop and len(self.crop) == 4:
            cx, cy, cw, ch = self.crop
            h, w = frame.shape[:2]
            x1 = int(np.clip(cx * w, 0, w - 2))
            y1 = int(np.clip(cy * h, 0, h - 2))
            x2 = int(np.clip((cx + cw) * w, x1 + 2, w))
            y2 = int(np.clip((cy + ch) * h, y1 + 2, h))
            frame = frame[y1:y2, x1:x2]

        self.latest_raw_frame = frame
        return frame

    def annotate(self, frame: np.ndarray, boxes: List[Tuple[float, float, float, float, float]]) -> np.ndarray:
        annotated = frame.copy()
        h, w = annotated.shape[:2]

        # Draw zone boundaries and zone labels
        for zone in self.zones:
            pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in zone.points], dtype=np.int32)
            cv2.polylines(annotated, [pts], True, (0, 229, 255), 2)
            zm = self.zone_metrics.get(zone.id, {"count": 0, "density": 0.0})
            src = zm.get("count_source", "yolo")
            z_label = f"{zone.name}: {zm['count']}p ({zm['density']:.1f} p/m2) [{src}]"
            cv2.putText(
                annotated,
                z_label,
                (max(5, pts[0][0] + 5), max(22, pts[0][1] + 22)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 136),
                1,
                cv2.LINE_AA,
            )

        # Draw person detection bounding boxes
        for (x1, y1, x2, y2, conf) in boxes:
            cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 136), 2)
            cv2.putText(
                annotated,
                f"P {conf:.2f}",
                (int(x1), max(14, int(y1) - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (0, 255, 136),
                1,
                cv2.LINE_AA,
            )

        # Camera HUD overlay
        hud_tag = "[LIVE WEBCAM]" if self.is_webcam else "[LIVE CV]"
        cv2.putText(
            annotated,
            f"{self.cam_id} - {self.name} {hud_tag}",
            (12, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 229, 255),
            2,
            cv2.LINE_AA,
        )

        ret, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 68])
        if ret:
            self.latest_annotated_jpeg = jpeg.tobytes()
        self.latest_annotated_frame = annotated
        return annotated

    def release(self):
        if self.cap and self.cap.isOpened():
            self.cap.release()
            self.cap = None


class VideoFileSource(SourceAdapter):
    """Opens all cameras from cameras.json and serves frames round-robin at ~5 total inference FPS."""

    def __init__(self, single_video_path: Optional[str] = None, cameras_file: Optional[Path] = None):
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        self.base_dir = base_dir

        if cameras_file is None:
            candidate_paths = [
                base_dir / "backend" / "cameras.json",
                base_dir / "cameras.json",
                Path("backend/cameras.json"),
                Path("cameras.json"),
            ]
            for p in candidate_paths:
                if p.exists():
                    cameras_file = p
                    break

        self.cameras: List[CameraInstance] = []
        if cameras_file and cameras_file.exists():
            try:
                with open(cameras_file, "r", encoding="utf-8") as f:
                    configs = json.load(f)
                    for cfg in configs[:6]:
                        self.cameras.append(CameraInstance(cfg, base_dir))
                logger.info("VideoFileSource initialized with %d cameras from %s", len(self.cameras), cameras_file)
            except Exception as e:
                logger.error("Failed to load cameras.json: %s", e)

        # Fallback if no cameras loaded: create default cameras from settings.zones or single video
        if not self.cameras:
            vid = single_video_path or os.environ.get("SOURCE_VIDEO", "sample_data/crowd1.mp4")
            self.cameras.append(CameraInstance({
                "cam_id": "CAM-01",
                "name": "Main Entry",
                "source": vid,
                "zones": [{"zone_id": "north_entry", "polygon": [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]], "area_m2": 35.0}],
            }, base_dir))

        # Check if live webcam should be appended or used standalone
        raw_mode = os.environ.get("SOURCE_MODE", getattr(settings, "source_mode", "video")).lower()
        is_webcam = "webcam" in raw_mode or getattr(settings, "is_webcam_enabled", False)
        is_video = "video" in raw_mode or getattr(settings, "is_video_enabled", True)

        if is_webcam:
            live_hall_area = float(os.environ.get("LIVE_HALL_AREA_M2", getattr(settings, "live_hall_area_m2", 30.0)))
            live_cam = CameraInstance({
                "cam_id": "CAM-LIVE",
                "name": "Live Hall",
                "source": 0,
                "zones": [{
                    "zone_id": "live_hall",
                    "alias": "Z9",
                    "name": "Live Hall",
                    "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                    "area_m2": live_hall_area,
                    "critical_threshold": 4.0,
                }],
            }, base_dir)

            if not is_video or not self.cameras:
                self.cameras = [live_cam]
            else:
                self.cameras.append(live_cam)
            logger.info("Attached CAM-LIVE (Live Hall, %.1f m2) to active cameras (total %d)", live_hall_area, len(self.cameras))

        self.camera_index = 0

    def add_camera(self, config: Dict[str, Any]) -> CameraInstance:
        """Dynamically appends a new camera instance to the video source."""
        cam = CameraInstance(config, self.base_dir)
        self.cameras.append(cam)
        logger.info("VideoFileSource dynamically attached camera: %s (%s)", cam.cam_id, cam.name)
        return cam

    def get_camera_jpeg(self, cam_id: str) -> Optional[bytes]:
        clean_target = cam_id.lower().replace("_", "-").replace(" ", "")
        for cam in self.cameras:
            c_id = cam.cam_id.lower().replace("_", "-").replace(" ", "")
            if (
                clean_target in (c_id, c_id.replace("cam-", ""), c_id.replace("cam-0", ""), f"cam-{clean_target}", f"cam-0{clean_target}")
                or (clean_target in ("cam-live", "live", "webcam", "live-hall") and cam.cam_id.upper() == "CAM-LIVE")
            ):
                if cam.latest_annotated_jpeg is not None:
                    return cam.latest_annotated_jpeg
                if cam.latest_annotated_frame is not None:
                    ret, jpeg = cv2.imencode(".jpg", cam.latest_annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 68])
                    if ret:
                        cam.latest_annotated_jpeg = jpeg.tobytes()
                        return cam.latest_annotated_jpeg
                # If camera is webcam and currently offline, return a generated offline JPEG
                if getattr(cam, "is_webcam", False):
                    placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
                    cv2.putText(placeholder, "CAM-LIVE OFFLINE / BUSY", (80, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                    ret_enc, j_bytes = cv2.imencode(".jpg", placeholder)
                    if ret_enc:
                        return j_bytes.tobytes()
        # Fallback to first camera
        if self.cameras and self.cameras[0].latest_annotated_jpeg is not None:
            return self.cameras[0].latest_annotated_jpeg
        return None

    def get_zone_metrics(self, zone_id: str) -> Dict[str, Any]:
        """Returns the latest metric dictionary for a given zone from whichever camera monitors it."""
        for cam in self.cameras:
            if zone_id in cam.zone_metrics:
                return cam.zone_metrics[zone_id]
        return {
            "count": 0,
            "density": 0.0,
            "jam": 0.0,
            "surge": 0.0,
            "mean_flow": 0.0,
            "yolo_count": 0,
            "occlusion": 0.0,
            "count_source": "yolo",
            "confidence": 1.0,
        }

    def read(self) -> Tuple[bool, Optional[np.ndarray], Optional[List[Tuple[float, float, float]]]]:
        if not self.cameras:
            return False, None, None
        cam = self.cameras[self.camera_index]
        self.camera_index = (self.camera_index + 1) % len(self.cameras)
        frame = cam.read_frame()
        return (frame is not None), frame, None

    def release(self):
        for cam in self.cameras:
            cam.release()


class WebcamSource(SourceAdapter):
    """Captures live camera feed from device webcam index 0."""

    def __init__(self, camera_index: int = 0):
        self.cap = cv2.VideoCapture(camera_index)

    def read(self) -> Tuple[bool, Optional[np.ndarray], Optional[List[Tuple[float, float, float]]]]:
        if not self.cap.isOpened():
            return False, None, None
        ret, frame = self.cap.read()
        return bool(ret), frame, None

    def release(self):
        if self.cap and self.cap.isOpened():
            self.cap.release()


class TimelineSource(SourceAdapter):
    """Zero-compute source serving pre-recorded ticks at 1 Hz from timeline.json."""

    def __init__(self, timeline_path: Optional[Path] = None):
        if timeline_path is None:
            timeline_path = (
                Path(__file__).resolve().parent.parent.parent.parent
                / "sample_data"
                / "timeline.json"
            )
        self.timeline_path = Path(timeline_path)
        self.ticks: List[Dict[str, Any]] = []
        self.index = 0
        self._load()

    def _load(self):
        if self.timeline_path.exists():
            with open(self.timeline_path, "r", encoding="utf-8") as f:
                self.ticks = json.load(f)
            logger.info("TimelineSource loaded %d ticks from %s", len(self.ticks), self.timeline_path)
        else:
            logger.warning("TimelineSource file not found at %s", self.timeline_path)

    def read_tick(self) -> Optional[Dict[str, Any]]:
        if not self.ticks:
            return None
        raw_tick = self.ticks[self.index % len(self.ticks)]
        self.index += 1

        now_iso = datetime.now(timezone.utc).isoformat()
        tick = {
            "ts": now_iso,
            "tick_index": self.index - 1,
            "zones": [dict(z) for z in raw_tick.get("zones", [])],
            "alerts": [dict(a) for a in raw_tick.get("alerts", [])],
            "cameras": [
                dict(c)
                for c in raw_tick.get(
                    "cameras",
                    [
                        {
                            "id": f"cam-0{i}",
                            "name": f"CAM-0{i}",
                            "online": True,
                            "last_seen_s": 0.1,
                            "is_webcam": False,
                        }
                        for i in range(1, 7)
                    ],
                )
            ],
        }
        for alert in tick["alerts"]:
            alert["ts"] = now_iso
        return tick

    def get_camera_jpeg(self, cam_id: str) -> Optional[bytes]:
        """Generate a labeled synthetic preview frame for a camera in timeline mode."""
        frame = np.zeros((360, 640, 3), dtype=np.uint8)
        frame[:] = (26, 14, 10)
        cv2.rectangle(frame, (8, 8), (632, 352), (180, 100, 255), 1)
        cv2.putText(
            frame,
            f"{cam_id.upper()} [TIMELINE REPLAY]",
            (24, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (210, 160, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            "OFFLINE DRILL REPLAY @ 1 Hz (Zero CV Compute)",
            (24, 85),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 136),
            1,
            cv2.LINE_AA,
        )
        ret, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
        return jpeg.tobytes() if ret else None

    def read(self) -> Tuple[bool, Optional[np.ndarray], Optional[List[Tuple[float, float, float]]]]:
        dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        dummy_frame[:] = (26, 14, 10)
        cv2.putText(
            dummy_frame,
            "PRAVAHAI - ZERO COMPUTE BACKUP MODE",
            (240, 330),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.1,
            (0, 229, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            dummy_frame,
            "Serving timeline.json @ 1 Hz (No GPU / No CV Compute)",
            (280, 390),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (0, 255, 136),
            2,
            cv2.LINE_AA,
        )
        return True, dummy_frame, None

    def release(self):
        pass


class ReplayEngine:
    """Runs the computer vision and crowd safety analytics loop at ~5 processed FPS.

    Broadcasts per-second ticks into an asyncio.Queue and persists critical alert events
    into a local JSONL incident store.
    """

    def __init__(
        self,
        source: Optional[SourceAdapter] = None,
        incidents_path: Optional[Path] = None,
        fps: float = 5.0,
    ):
        # Resolve Source Adapter from environment
        raw_mode = os.environ.get("SOURCE_MODE", getattr(settings, "source_mode", "simulator")).lower()
        pipeline_fps_env = os.environ.get("PIPELINE_FPS")
        if pipeline_fps_env:
            try:
                fps = float(pipeline_fps_env)
            except ValueError:
                pass
        elif "timeline" in raw_mode:
            fps = 1.0
        else:
            fps = getattr(settings, "pipeline_fps", fps)

        self.fps = fps
        self.dt = 1.0 / fps
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.running = False
        self.task: Optional[asyncio.Task] = None

        # Ensure live_hall zone is dynamically registered in settings.zones if webcam is active
        if "webcam" in raw_mode and not any(z.id == "live_hall" for z in settings.zones):
            live_hall_area = float(os.environ.get("LIVE_HALL_AREA_M2", getattr(settings, "live_hall_area_m2", 30.0)))
            settings.zones.append(
                Zone(
                    id="live_hall",
                    name="Live Hall",
                    points=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                    area_m2=live_hall_area,
                    critical_threshold=4.0,
                )
            )

        if source is not None:
            self.source = source
        elif "timeline" in raw_mode:
            self.source = TimelineSource()
        elif "video" in raw_mode or "webcam" in raw_mode:
            video_path = os.environ.get("SOURCE_VIDEO", None)
            self.source = VideoFileSource(single_video_path=video_path)
        else:
            self.source = SimulatorSource()

        # Pipeline modules
        self.detector = PersonDetector(frame_skip=settings.frame_skip)
        self.flow_analyzer = FlowAnalyzer()
        self.prev_frame: Optional[np.ndarray] = None
        self.current_frame: Optional[np.ndarray] = None

        # State tracking: history of (timestamp, density) for each zone over last 15s (75 samples)
        self.density_history: Dict[str, Deque[Tuple[float, float]]] = {
            z.id: deque(maxlen=75) for z in settings.zones
        }
        self.prev_levels: Dict[str, str] = {z.id: "green" for z in settings.zones}
        self.active_alerts: Dict[str, Dict[str, Any]] = {}

        # Incident log storage path
        if incidents_path is None:
            incidents_path = Path(__file__).resolve().parent.parent.parent.parent / "sample_data" / "incidents.jsonl"
        self.incidents_path = Path(incidents_path)
        self.incidents_path.parent.mkdir(parents=True, exist_ok=True)
        self.latest_tick: Dict[str, Any] = {}
        self.drill: Dict[str, Any] = {
            "active": False,
            "zone_id": "barricade_corridor",
            "t0": 0.0,
            "speed_mult": 1.0,
        }

    def start_drill(self, zone_id: str = "barricade_corridor", speed_mult: float = 1.0) -> None:
        """Start a labeled training overlay. Live CV continues; risk math is overlaid."""
        self.drill = {
            "active": True,
            "zone_id": zone_id,
            "t0": time.time(),
            "speed_mult": max(0.1, float(speed_mult)),
        }
        self.prev_levels[zone_id] = "green"
        if zone_id in self.active_alerts:
            del self.active_alerts[zone_id]
        self.log_incident_event(
            event_type="drill_start",
            zone_id=zone_id,
            zone_name=next((z.name for z in settings.zones if z.id == zone_id), zone_id),
            payload={"speed_mult": self.drill["speed_mult"], "labeled": True},
        )

    def stop_drill(self) -> None:
        zone_id = str(self.drill.get("zone_id") or "barricade_corridor")
        was_active = bool(self.drill.get("active"))
        self.drill["active"] = False
        if zone_id in self.active_alerts:
            del self.active_alerts[zone_id]
        self.prev_levels[zone_id] = "green"
        if was_active:
            self.log_incident_event(
                event_type="drill_end",
                zone_id=zone_id,
                zone_name=next((z.name for z in settings.zones if z.id == zone_id), zone_id),
                payload={"labeled": True},
            )

    def _drill_overlay(self, zone_id: str, now: float) -> Optional[Tuple[float, float, float]]:
        if not self.drill.get("active") or zone_id != self.drill.get("zone_id"):
            return None
        elapsed = (now - float(self.drill.get("t0") or now)) * float(self.drill.get("speed_mult") or 1.0)
        metrics = drill_metrics(elapsed)
        if metrics is None:
            return None
        return metrics

    def get_highest_risk_zone(self) -> Dict[str, Any]:
        """Returns the active zone with the highest risk (or highest density if risks are equal)."""
        zones = self.latest_tick.get("zones", [])
        if not zones:
            if isinstance(self.source, VideoFileSource):
                best_zone = None
                max_d = -1.0
                for c in self.source.cameras:
                    for z in c.zones:
                        zm = self.source.get_zone_metrics(z.id)
                        d = zm.get("density", 0.0)
                        if d > max_d:
                            max_d = d
                            best_zone = {"id": z.id, "name": z.name, "density": d, "risk": 20.0}
                if best_zone:
                    return best_zone
            return {"id": "barricade_corridor", "name": "Barricade Corridor", "density": 4.6, "risk": 87.0}

        return max(zones, key=lambda z: (float(z.get("risk", 0.0)), float(z.get("density", 0.0))))

    def add_camera_source(
        self,
        video_path: str,
        cam_id: str,
        cam_name: str,
        zone_id: str,
        zone_name: str,
        area_m2: float = 40.0,
    ):
        """Dynamically attaches a new video camera stream and zone to the active engine."""
        # 1. Register zone in settings.zones if not present
        if not any(z.id == zone_id for z in settings.zones):
            new_zone = Zone(
                id=zone_id,
                name=zone_name,
                points=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                area_m2=area_m2,
                critical_threshold=4.0,
            )
            settings.zones.append(new_zone)

        if zone_id not in self.density_history:
            self.density_history[zone_id] = deque(maxlen=75)
            self.prev_levels[zone_id] = "green"

        # 2. Ensure engine.source is VideoFileSource
        if not isinstance(self.source, VideoFileSource):
            self.source = VideoFileSource()

        # 3. Create camera config and attach to source
        cam_config = {
            "cam_id": cam_id.upper(),
            "name": cam_name,
            "source": video_path,
            "crop": [0.0, 0.0, 1.0, 1.0],
            "zones": [
                {
                    "zone_id": zone_id,
                    "name": zone_name,
                    "polygon": [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
                    "area_m2": area_m2,
                }
            ],
        }
        cam = self.source.add_camera(cam_config)
        logger.info("ReplayEngine successfully registered new camera: %s (%s)", cam_id, cam_name)
        return cam

    def get_camera_jpeg(self, cam_id: str) -> Optional[bytes]:
        """Returns the latest annotated JPEG frame for a specific camera ID."""
        if isinstance(self.source, VideoFileSource):
            return self.source.get_camera_jpeg(cam_id)
        if isinstance(self.source, TimelineSource):
            return self.source.get_camera_jpeg(cam_id)
        if self.current_frame is not None:
            ret, jpeg = cv2.imencode(".jpg", self.current_frame, [cv2.IMWRITE_JPEG_QUALITY, 68])
            if ret:
                return jpeg.tobytes()
        return None

    def log_incident_event(self, event_type: str, zone_id: str, zone_name: str, payload: Dict[str, Any]):
        """Appends an event record to sample_data/incidents.jsonl."""
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event_type,
            "zone_id": zone_id,
            "zone": zone_name,
            **payload,
        }
        try:
            with open(self.incidents_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception as e:
            logger.error("Failed to write incident record: %s", e)

    def _compute_trend_slope(self, zid: str, current_density: float, now: float) -> float:
        """Computes rate of density change in people/m^2/min using linear progression over window."""
        history = self.density_history.get(zid)
        if history is None:
            history = deque(maxlen=75)
            self.density_history[zid] = history
        history.append((now, current_density))

        if len(history) < 5:
            return 0.0

        # Time elapsed between oldest reading in window and now
        t_old, d_old = history[0]
        dt_sec = now - t_old
        if dt_sec < 1.0:
            return 0.0

        # Rate of change per minute
        slope = (current_density - d_old) / (dt_sec / 60.0)
        return round(float(slope), 3)

    async def step(self) -> Dict[str, Any]:
        """Executes a single pipeline iteration and returns the tick payload."""
        now = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Zero-compute timeline mode: stream directly from pre-computed timeline.json
        if isinstance(self.source, TimelineSource):
            tick = self.source.read_tick()
            if tick:
                _, frame, _ = self.source.read()
                self.current_frame = frame
                self.latest_tick = tick

                # Track active alerts and trigger incident events
                current_alerts = tick.get("alerts", [])
                for alert in current_alerts:
                    zid = alert.get("zone_id", "barricade_corridor")
                    if zid not in self.active_alerts:
                        self.active_alerts[zid] = alert
                        self.log_incident_event(
                            event_type="alert",
                            zone_id=zid,
                            zone_name=alert.get("zone", "Barricade Corridor"),
                            payload={
                                "actions": alert.get("actions", []),
                                "eta_s": alert.get("eta_s", 0),
                                "density": alert.get("density", 0.0),
                                "risk": alert.get("risk", 0.0),
                                "audio_url": alert.get("audio_url", ""),
                                "via": alert.get("provider", "via edge-tts"),
                            },
                        )
                if not current_alerts and self.active_alerts:
                    for zid in list(self.active_alerts.keys()):
                        del self.active_alerts[zid]
                        self.log_incident_event(
                            event_type="cleared",
                            zone_id=zid,
                            zone_name="Barricade Corridor",
                            payload={"density": 0.6, "risk": 7.0},
                        )

                if self.queue.full():
                    try:
                        self.queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                await self.queue.put(tick)
                return tick

        if isinstance(self.source, VideoFileSource):
            if not self.source.cameras:
                await asyncio.sleep(self.dt)
                return {"ts": now_iso, "zones": []}

            # Round-robin camera selection
            cam = self.source.cameras[self.source.camera_index]
            self.source.camera_index = (self.source.camera_index + 1) % len(self.source.cameras)
            frame = cam.read_frame()
            if frame is None:
                if getattr(cam, "is_webcam", False):
                    # Clean error handling: generate dark offline frame and emit amber toast alert
                    placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
                    cv2.putText(placeholder, "CAM-LIVE OFFLINE / BUSY", (80, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                    ret_enc, j_bytes = cv2.imencode(".jpg", placeholder)
                    if ret_enc:
                        cam.latest_annotated_jpeg = j_bytes.tobytes()
                    self.active_alerts["cam_live_error"] = {
                        "id": "cam_live_error",
                        "type": "device_error",
                        "zone_id": "live_hall",
                        "zone": "Live Hall",
                        "message": "CAM-LIVE webcam is busy or disconnected. Video sources unaffected.",
                        "level": "amber",
                        "timestamp": now_iso,
                    }
                    if "live_hall" in cam.zone_metrics:
                        cam.zone_metrics["live_hall"]["count"] = 0
                        cam.zone_metrics["live_hall"]["density"] = 0.0

                if len(self.source.cameras) <= 1:
                    await asyncio.sleep(self.dt)
                    return {"ts": now_iso, "zones": [], "alerts": list(self.active_alerts.values())}
            else:
                if getattr(cam, "is_webcam", False) and "cam_live_error" in self.active_alerts:
                    del self.active_alerts["cam_live_error"]

                # Run YOLOv8n person detection (conf >= 0.35, input resized to 640 for speed)
                centroids, boxes = self.detector.detect_with_details(frame, imgsz=640)
                cam.latest_centroids = centroids
                cam.latest_boxes = boxes

                # Assign to that camera's zone polygons -> per-zone count and density = count / area_m2
                for zone in cam.zones:
                    matching_count = sum(1 for c in centroids if point_in_polygon(c, zone.points))
                    dens = round(matching_count / zone.area_m2, 2) if zone.area_m2 > 0 else 0.0
                    cam.zone_metrics[zone.id]["count"] = matching_count
                    cam.zone_metrics[zone.id]["density"] = dens

                # Optical flow (Farneback) per camera on consecutive processed frames
                dens_map = {z.id: cam.zone_metrics[z.id]["density"] for z in cam.zones}
                if cam.prev_frame is not None and cam.prev_frame.shape == frame.shape:
                    flow_data = self.flow_analyzer.analyze(cam.prev_frame, frame, cam.zones, dens_map)
                else:
                    flow_data = {
                        z.id: {"jam_score": 0.0, "surge_score": 0.0, "mean_flow_magnitude": 0.0}
                        for z in cam.zones
                    }
                cam.prev_frame = frame.copy()

                for zone in cam.zones:
                    f_info = flow_data.get(zone.id, {})
                    cam.zone_metrics[zone.id]["jam"] = f_info.get("jam_score", 0.0)
                    cam.zone_metrics[zone.id]["surge"] = f_info.get("surge_score", 0.0)
                    cam.zone_metrics[zone.id]["mean_flow"] = f_info.get("mean_flow_magnitude", 0.0)

                # Draw annotated frames (detections and zones drawn) for streaming
                annotated = cam.annotate(frame, boxes)
                self.current_frame = annotated
        else:
            # 1. Acquire Frame & Centroids (Simulator / Webcam)
            ret, frame, sim_centroids = self.source.read()
            if not ret or frame is None:
                # If video failed or ended, wait and return empty tick
                await asyncio.sleep(self.dt)
                return {"ts": now_iso, "zones": []}

            self.current_frame = frame

            if sim_centroids is not None:
                centroids = sim_centroids
            else:
                centroids = self.detector.detect(frame)

            # 2. Zone Density Computation
            density_results = compute_zone_densities(centroids, settings.zones)
            densities_map = {zid: d["density"] for zid, d in density_results.items()}

            # 3. Optical Flow Analysis
            if self.prev_frame is not None and self.prev_frame.shape == frame.shape:
                flow_data = self.flow_analyzer.analyze(self.prev_frame, frame, settings.zones, densities_map)
            else:
                flow_data = {
                    z.id: {"mean_flow_magnitude": 0.0, "jam_score": 0.0, "surge_score": 0.0}
                    for z in settings.zones
                }
            self.prev_frame = frame.copy()

        # 4. Pure Risk Math & Alert State Evaluation
        zone_payloads = []
        for zone in settings.zones:
            zid = zone.id
            if isinstance(self.source, VideoFileSource):
                zm = self.source.get_zone_metrics(zid)
                dens = zm.get("density", 0.0)
                count = zm.get("count", 0)
                jam = zm.get("jam", 0.0)
                surge = zm.get("surge", 0.0)
            else:
                dens = densities_map.get(zid, 0.0)
                count = int(round(dens * zone.area_m2))
                flow_info = flow_data.get(zid, {})
                jam = flow_info.get("jam_score", 0.0)
                surge = flow_info.get("surge_score", 0.0)

            # Compute actual trend slope (people/m^2/min)
            slope = self._compute_trend_slope(zid, dens, now)

            risk = risk_score(density=dens, jam=jam, surge=surge, trend_slope=slope)
            eta_s = eta_to_critical(density=dens, slope=slope, threshold=zone.critical_threshold)
            curr_lvl = level(risk)
            prev_lvl = self.prev_levels.get(zid, "green")

            # Evaluate state transitions & alert trigger rule
            if prev_lvl != "amber" and curr_lvl == "amber":
                self.log_incident_event(
                    event_type="amber",
                    zone_id=zid,
                    zone_name=zone.name,
                    payload={"density": dens, "risk": risk, "eta_s": eta_s},
                )
            elif prev_lvl != "red" and curr_lvl == "red":
                # Rule 5: Zone flips to "red" -> trigger alert event with 3 fixed actions
                actions = [
                    "Open Gate 2 for overflow",
                    "Divert flow via Side Passage",
                    "Dispatch 2 marshals",
                ]

                # Phase 5: Build Hindi message template using zone name
                if zid == "barricade_corridor":
                    hindi_msg = "ज़ोन 3 में भीड़ खतरनाक स्तर पर पहुँच रही है। गेट 2 खोलें, भीड़ को साइड पैसेज मोड़ें, दो मार्शल भेजें।"
                else:
                    hindi_msg = f"{zone.name} में भीड़ खतरनाक स्तर पर पहुँच रही है। गेट 2 खोलें, भीड़ को साइड पैसेज मोड़ें, दो मार्शल भेजें।"

                # Synthesize Hindi voice alert (Sarvam primary -> Edge-TTS fallback)
                audio_url, provider_tag = await voice_resolver.synthesize(hindi_msg)

                alert_obj = {
                    "id": f"alert_{zid}_{int(now)}",
                    "ts": now_iso,
                    "zone": zone.name,
                    "zone_id": zid,
                    "eta_s": eta_s,
                    "actions": actions,
                    "density": dens,
                    "risk": risk,
                    "text_hindi": hindi_msg,
                    "audio_url": audio_url,
                    "provider": provider_tag,
                    "via": provider_tag,
                }
                self.active_alerts[zid] = alert_obj

                self.log_incident_event(
                    event_type="red",
                    zone_id=zid,
                    zone_name=zone.name,
                    payload={"density": dens, "risk": risk, "eta_s": eta_s},
                )
                self.log_incident_event(
                    event_type="alert",
                    zone_id=zid,
                    zone_name=zone.name,
                    payload={
                        "actions": actions,
                        "eta_s": eta_s,
                        "density": dens,
                        "risk": risk,
                        "audio_url": audio_url,
                        "via": provider_tag,
                    },
                )
            elif prev_lvl in ("red", "amber") and curr_lvl == "green":
                # Cleared event
                if zid in self.active_alerts:
                    del self.active_alerts[zid]

                cleared_payload: Dict[str, Any] = {"density": dens, "risk": risk}
                ai_summary = await generate_incident_summary_hindi(zone.name, dens)
                if ai_summary:
                    cleared_payload["ai_summary_hindi"] = ai_summary

                self.log_incident_event(
                    event_type="cleared",
                    zone_id=zid,
                    zone_name=zone.name,
                    payload=cleared_payload,
                )

            self.prev_levels[zid] = curr_lvl

            zone_payloads.append({
                "id": zid,
                "name": zone.name,
                "density": dens,
                "count": count,
                "jam": jam,
                "surge": surge,
                "trend_slope": slope,
                "risk": risk,
                "eta_s": eta_s,
                "level": curr_lvl,
            })

        # Latest or all active alerts in tick
        current_alerts = list(self.active_alerts.values())

        # Real Camera Delivery Health Tracking
        cameras_status = []
        if isinstance(self.source, VideoFileSource):
            for c in self.source.cameras:
                last_t = getattr(c, "last_frame_time", 0.0)
                # Online if connected and delivered a frame in the last 5.0 seconds
                is_online = c.is_connected and (now - last_t <= 5.0 if last_t > 0 else c.is_connected)
                cameras_status.append({
                    "id": c.cam_id.lower(),
                    "name": c.name,
                    "online": is_online,
                    "last_seen_s": round(now - last_t, 1) if last_t > 0 else None,
                    "is_webcam": getattr(c, "is_webcam", False),
                })
        else:
            for i in range(1, 7):
                cameras_status.append({
                    "id": f"cam-0{i}",
                    "name": f"CAM-0{i}",
                    "online": True,
                    "last_seen_s": 0.1,
                    "is_webcam": False,
                })

        tick = {
            "ts": now_iso,
            "zones": zone_payloads,
            "alerts": current_alerts,
            "cameras": cameras_status,
        }
        self.latest_tick = tick

        # Put tick in queue (evict oldest if full)
        if self.queue.full():
            try:
                self.queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        await self.queue.put(tick)

        return tick

    async def _run_loop(self):
        """Continuous pipeline background execution loop."""
        logger.info("ReplayEngine background processing loop started at %.1f FPS", self.fps)
        while self.running:
            start_t = time.time()
            try:
                await self.step()
            except Exception as e:
                logger.error("Pipeline tick error: %s", e, exc_info=True)

            elapsed = time.time() - start_t
            sleep_time = max(0.01, self.dt - elapsed)
            await asyncio.sleep(sleep_time)

    def start(self):
        """Starts the asynchronous replay engine task."""
        if not self.running:
            self.running = True
            self.task = asyncio.create_task(self._run_loop())

    async def stop(self):
        """Stops the asynchronous replay engine task and releases resources."""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        if self.source:
            self.source.release()
