"""YOLOv8 person detector module returning normalized centroid coordinates."""
from pathlib import Path
from typing import List, Optional, Tuple, Union
import logging
import shutil
import numpy as np
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class PersonDetector:
    """Detects people in video frames using YOLOv8n.

    Extracts bounding boxes for class 'person' (COCO class 0), filters by confidence
    threshold (>= 0.35), and normalizes bounding box centroids to [0.0, 1.0].
    """

    def __init__(
        self,
        weights_path: Optional[Union[str, Path]] = None,
        frame_skip: int = 0,
        conf_threshold: float = 0.35,
    ):
        self.frame_skip = max(0, frame_skip)
        self.conf_threshold = conf_threshold
        self.frame_count = 0
        self.last_centroids: List[Tuple[float, float, float]] = []

        if weights_path is None:
            try:
                from app.config import settings
                weights_path = settings.weights_path
            except Exception:
                weights_path = "vendor/weights/yolov8n.pt"

        self.weights_path = Path(weights_path)
        self.model = self._load_or_download_model()

    def _load_or_download_model(self) -> YOLO:
        """Loads YOLO weights, automatically downloading if missing."""
        if not self.weights_path.exists():
            logger.info("Weights not found at %s. Downloading yolov8n.pt...", self.weights_path)
            self.weights_path.parent.mkdir(parents=True, exist_ok=True)
            # Instantiating YOLO with 'yolov8n.pt' triggers Ultralytics auto-download
            model = YOLO("yolov8n.pt")
            # If downloaded into current directory, relocate to self.weights_path
            temp_file = Path("yolov8n.pt")
            if temp_file.exists() and temp_file.resolve() != self.weights_path.resolve():
                shutil.move(str(temp_file), str(self.weights_path))
            return YOLO(str(self.weights_path) if self.weights_path.exists() else "yolov8n.pt")

        return YOLO(str(self.weights_path))

    def detect(
        self,
        frame: np.ndarray,
        frame_skip: Optional[int] = None,
    ) -> List[Tuple[float, float, float]]:
        """Detects people and returns normalized centroids [(cx, cy, conf), ...].

        Args:
            frame: Input image array (BGR or RGB).
            frame_skip: Optional override for frame skip count.

        Returns:
            List of (cx, cy, conf) tuples in normalized coordinates [0.0, 1.0].
        """
        skip = self.frame_skip if frame_skip is None else max(0, frame_skip)
        self.frame_count += 1

        # Return cached centroids if skipping this frame
        if skip > 0 and (self.frame_count - 1) % (skip + 1) != 0:
            return self.last_centroids

        h, w = frame.shape[:2]
        if h == 0 or w == 0:
            return []

        # Run inference in inference mode without verbose output (resized to 640 for speed)
        results = self.model.predict(
            source=frame,
            classes=[0],  # COCO class 0 is person
            conf=self.conf_threshold,
            imgsz=640,
            verbose=False,
        )

        centroids: List[Tuple[float, float, float]] = []
        if results and len(results) > 0:
            boxes = results[0].boxes
            if boxes is not None and len(boxes) > 0:
                xyxy = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()

                for box, conf in zip(xyxy, confs):
                    x1, y1, x2, y2 = box
                    # Compute normalized centroid
                    cx = float((x1 + x2) / (2.0 * w))
                    cy = float((y1 + y2) / (2.0 * h))
                    # Clamp to [0.0, 1.0]
                    cx = max(0.0, min(1.0, cx))
                    cy = max(0.0, min(1.0, cy))
                    centroids.append((round(cx, 4), round(cy, 4), round(float(conf), 4)))

        self.last_centroids = centroids
        return centroids

    def detect_with_details(
        self,
        frame: np.ndarray,
        imgsz: int = 640,
    ) -> Tuple[List[Tuple[float, float, float]], List[Tuple[float, float, float, float, float]]]:
        """Detects people and returns (centroids, pixel_boxes) with imgsz resized to 640.

        Returns:
            centroids: [(cx, cy, conf), ...] normalized to [0.0, 1.0]
            boxes: [(x1, y1, x2, y2, conf), ...] in absolute pixel coordinates
        """
        h, w = frame.shape[:2]
        if h == 0 or w == 0:
            return [], []

        results = self.model.predict(
            source=frame,
            classes=[0],
            conf=self.conf_threshold,
            imgsz=imgsz,
            verbose=False,
        )

        centroids: List[Tuple[float, float, float]] = []
        boxes_list: List[Tuple[float, float, float, float, float]] = []

        if results and len(results) > 0:
            boxes = results[0].boxes
            if boxes is not None and len(boxes) > 0:
                xyxy = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()

                for box, conf in zip(xyxy, confs):
                    x1, y1, x2, y2 = box
                    cx = float((x1 + x2) / (2.0 * w))
                    cy = float((y1 + y2) / (2.0 * h))
                    cx = max(0.0, min(1.0, cx))
                    cy = max(0.0, min(1.0, cy))
                    c_float = float(conf)
                    centroids.append((round(cx, 4), round(cy, 4), round(c_float, 4)))
                    boxes_list.append((float(x1), float(y1), float(x2), float(y2), round(c_float, 4)))

        return centroids, boxes_list
