"""Zone crowd density computation module assigning person centroids to defined polygons."""
from typing import Any, Dict, List, Sequence, Tuple, Union
import cv2
import numpy as np
from app.config import Zone


def point_in_polygon(point: Union[Tuple[float, float], Tuple[float, float, float], List[float]], polygon_points: List[List[float]]) -> bool:
    """Checks whether a normalized point (cx, cy) is inside or on the boundary of a zone polygon.

    Args:
        point: Coordinates (cx, cy) or (cx, cy, conf) in normalized space [0.0, 1.0].
        polygon_points: List of [x, y] coordinates defining polygon vertices.

    Returns:
        bool: True if point is inside or on the polygon perimeter, False otherwise.
    """
    cx, cy = float(point[0]), float(point[1])
    pts = np.array(polygon_points, dtype=np.float32)
    # cv2.pointPolygonTest returns > 0 (inside), 0 (on edge), < 0 (outside)
    return cv2.pointPolygonTest(pts, (cx, cy), False) >= 0


def compute_zone_densities(
    centroids: Sequence[Union[Tuple[float, float], Tuple[float, float, float], List[float]]],
    zones: List[Zone],
) -> Dict[str, Dict[str, Any]]:
    """Assigns detected person centroids to spatial zones and computes density.

    Args:
        centroids: List of normalized (cx, cy, [conf]) centroids.
        zones: List of Zone configuration models.

    Returns:
        Dict mapping zone_id to:
            {
                "count": int,
                "density": float  # people / m^2 rounded to 2 decimal places
            }
    """
    results: Dict[str, Dict[str, Any]] = {}

    for zone in zones:
        matching_count = sum(
            1 for c in centroids if point_in_polygon(c, zone.points)
        )
        density = round(matching_count / zone.area_m2, 2) if zone.area_m2 > 0 else 0.0
        results[zone.id] = {
            "count": matching_count,
            "density": density,
        }

    return results
