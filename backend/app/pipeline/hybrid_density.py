"""Occlusion-aware crowd count fusion.

YOLOv8 box detectors undercount when torsos overlap. This module does not invent
a neural density map; it applies a bounded, testable correction from pairwise
box overlap and merged-box area, then labels the source so the command center
stays honest.
"""
from typing import List, Sequence, Tuple, TypedDict, Union

Box = Tuple[float, float, float, float, float]
Centroid = Union[Tuple[float, float], Tuple[float, float, float], List[float]]


class FusedCount(TypedDict):
    yolo_count: int
    fused_count: int
    density: float
    occlusion: float
    merge_score: float
    count_source: str
    confidence: float


def box_iou(a: Sequence[float], b: Sequence[float]) -> float:
    """Intersection-over-union for two xyxy boxes."""
    ax1, ay1, ax2, ay2 = float(a[0]), float(a[1]), float(a[2]), float(a[3])
    bx1, by1, bx2, by2 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = area_a + area_b - inter
    if denom <= 0.0:
        return 0.0
    return inter / denom


def occlusion_index(boxes: Sequence[Sequence[float]]) -> float:
    """Mean pairwise IoU among boxes that overlap. 0 if none overlap."""
    n = len(boxes)
    if n < 2:
        return 0.0
    ious: List[float] = []
    for i in range(n):
        for j in range(i + 1, n):
            iou = box_iou(boxes[i], boxes[j])
            if iou > 0.0:
                ious.append(iou)
    if not ious:
        return 0.0
    return round(min(1.0, sum(ious) / len(ious)), 4)


def merge_score(boxes: Sequence[Sequence[float]]) -> float:
    """Fraction of boxes whose area is unusually large vs the median (merged torsos)."""
    areas = []
    for b in boxes:
        w = max(0.0, float(b[2]) - float(b[0]))
        h = max(0.0, float(b[3]) - float(b[1]))
        areas.append(w * h)
    if len(areas) < 2:
        return 0.0
    ordered = sorted(areas)
    median = ordered[len(ordered) // 2]
    if median <= 1.0:
        return 0.0
    merged = sum(1 for a in areas if a > 1.8 * median)
    return round(min(1.0, merged / len(areas)), 4)


def fuse_zone_count(
    yolo_count: int,
    boxes_in_zone: Sequence[Sequence[float]],
    area_m2: float,
) -> FusedCount:
    """Fuse YOLO headcount with an occlusion boost when boxes collide.

    Boost is capped at 2.2x so sparse scenes cannot fabricate a crush.
    Fusion only engages at moderate density or measurable overlap.
    """
    yolo_n = max(0, int(yolo_count))
    area = float(area_m2) if area_m2 else 0.0
    occ = occlusion_index(boxes_in_zone)
    merge = merge_score(boxes_in_zone)
    yolo_density = (yolo_n / area) if area > 0 else 0.0

    if yolo_n == 0:
        return FusedCount(
            yolo_count=0,
            fused_count=0,
            density=0.0,
            occlusion=occ,
            merge_score=merge,
            count_source="yolo",
            confidence=1.0,
        )

    apply_fusion = yolo_density >= 2.0 or occ >= 0.12 or merge >= 0.25
    if apply_fusion:
        boost = 1.0 + 0.65 * occ + 0.40 * merge
        fused = int(round(yolo_n * boost))
        fused = min(fused, int(round(yolo_n * 2.2)))
        fused = max(fused, yolo_n)
        source = "fused" if fused != yolo_n else "yolo"
    else:
        fused = yolo_n
        source = "yolo"

    density = round(fused / area, 2) if area > 0 else 0.0
    confidence = round(max(0.45, 0.94 - 0.45 * occ), 2)
    return FusedCount(
        yolo_count=yolo_n,
        fused_count=fused,
        density=density,
        occlusion=occ,
        merge_score=merge,
        count_source=source,
        confidence=confidence,
    )
