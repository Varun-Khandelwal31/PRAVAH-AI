"""Optical flow analysis module for jam detection and surge pattern recognition."""
from typing import Any, Dict, List, Optional
import cv2
import numpy as np
from app.config import Zone


class FlowAnalyzer:
    """Computes Farneback optical flow and per-zone movement metrics:

    - mean_flow_magnitude: Average velocity in pixels/frame inside zone.
    - jam_score: 0.0 to 1.0, high when magnitude < 0.4 px/frame and density > 2.5 p/m^2.
    - surge_score: 0.0 to 1.0, based on negative divergence (inward convergence) inside zone.
    """

    def __init__(
        self,
        pyr_scale: float = 0.5,
        levels: int = 3,
        winsize: int = 15,
        iterations: int = 3,
        poly_n: int = 5,
        poly_sigma: float = 1.2,
        downscale_width: int = 480,
    ):
        self.pyr_scale = pyr_scale
        self.levels = levels
        self.winsize = winsize
        self.iterations = iterations
        self.poly_n = poly_n
        self.poly_sigma = poly_sigma
        self.downscale_width = downscale_width

    def compute_flow(self, prev_gray: np.ndarray, curr_gray: np.ndarray) -> np.ndarray:
        """Computes dense optical flow between two grayscale frames."""
        return cv2.calcOpticalFlowFarneback(
            prev_gray,
            curr_gray,
            None,
            self.pyr_scale,
            self.levels,
            self.winsize,
            self.iterations,
            self.poly_n,
            self.poly_sigma,
            0,
        )

    def analyze(
        self,
        prev_frame: np.ndarray,
        curr_frame: np.ndarray,
        zones: List[Zone],
        densities: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Dict[str, float]]:
        """Analyzes optical flow for each zone polygon between consecutive frames.

        Args:
            prev_frame: Previous video frame (BGR or Grayscale).
            curr_frame: Current video frame (BGR or Grayscale).
            zones: List of Zone configuration models.
            densities: Optional dict of {zone_id: density_value} used for jam calculation.

        Returns:
            Dict mapping zone_id to:
                {
                    "mean_flow_magnitude": float,
                    "jam_score": float,
                    "surge_score": float
                }
        """
        if densities is None:
            densities = {}

        # Convert to grayscale if necessary
        prev_gray = (
            cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
            if len(prev_frame.shape) == 3
            else prev_frame
        )
        curr_gray = (
            cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)
            if len(curr_frame.shape) == 3
            else curr_frame
        )

        h, w = curr_gray.shape[:2]
        if h == 0 or w == 0:
            return {
                z.id: {"mean_flow_magnitude": 0.0, "jam_score": 0.0, "surge_score": 0.0}
                for z in zones
            }

        # Downscale for high-efficiency CPU execution if frame is large
        if self.downscale_width > 0 and w > self.downscale_width:
            flow_w = self.downscale_width
            scale = flow_w / float(w)
            flow_h = max(1, int(round(h * scale)))
            prev_proc = cv2.resize(prev_gray, (flow_w, flow_h), interpolation=cv2.INTER_AREA)
            curr_proc = cv2.resize(curr_gray, (flow_w, flow_h), interpolation=cv2.INTER_AREA)
            flow = self.compute_flow(prev_proc, curr_proc)
            u = flow[..., 0]
            v = flow[..., 1]
            magnitude = np.sqrt(u**2 + v**2) / scale
        else:
            flow_w, flow_h = w, h
            scale = 1.0
            flow = self.compute_flow(prev_gray, curr_gray)
            u = flow[..., 0]
            v = flow[..., 1]
            magnitude = np.sqrt(u**2 + v**2)

        # Calculate spatial divergence: div = du/dx + dv/dy
        # axis 1 is x (cols), axis 0 is y (rows)
        du_dx = np.gradient(u, axis=1)
        dv_dy = np.gradient(v, axis=0)
        div = du_dx + dv_dy

        results: Dict[str, Dict[str, float]] = {}

        for zone in zones:
            # Build binary polygon mask in flow coordinate space (flow_w, flow_h)
            pts_pixel = np.array(
                [[int(pt[0] * flow_w), int(pt[1] * flow_h)] for pt in zone.points],
                dtype=np.int32,
            )
            mask = np.zeros((flow_h, flow_w), dtype=np.uint8)
            cv2.fillPoly(mask, [pts_pixel], 255)
            zone_pixels = mask > 0

            if not np.any(zone_pixels):
                results[zone.id] = {
                    "mean_flow_magnitude": 0.0,
                    "jam_score": 0.0,
                    "surge_score": 0.0,
                }
                continue

            # Mean flow magnitude within zone
            mean_mag = float(np.mean(magnitude[zone_pixels]))

            # Jam Score (0-1): high when magnitude < 0.4 px/frame AND density > 2.5 p/m^2
            zone_density = float(densities.get(zone.id, 0.0))
            if zone_density > 2.5 and mean_mag < 0.4:
                dens_factor = min(1.0, (zone_density - 2.5) / 2.0)
                flow_factor = max(0.0, (0.4 - mean_mag) / 0.4)
                jam_score = min(1.0, 0.5 * dens_factor + 0.5 * flow_factor)
            else:
                jam_score = 0.0

            # Surge Score (0-1): Negative divergence (inward convergence towards centroid)
            # Inward converging flow has negative divergence (-div > 0)
            neg_div = -div[zone_pixels]
            mean_neg_div = float(np.mean(neg_div))
            if mean_neg_div > 0.0:
                # Normalize typical pixel divergence scale to [0, 1]
                surge_score = min(1.0, max(0.0, mean_neg_div / 0.25))
            else:
                surge_score = 0.0

            results[zone.id] = {
                "mean_flow_magnitude": round(mean_mag, 4),
                "jam_score": round(jam_score, 3),
                "surge_score": round(surge_score, 3),
            }

        return results
