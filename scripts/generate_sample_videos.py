"""Generates compact sample crowd videos in sample_data/ for testing multi-camera video mode."""
import os
from pathlib import Path
import cv2
import numpy as np

def generate_crowd_video(output_path: str, img_paths: list, num_frames: int = 60, width: int = 640, height: int = 360):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    imgs = [cv2.imread(p) for p in img_paths if os.path.exists(p)]
    if not imgs:
        print(f"No source images found for {output_path}")
        return

    resized = [cv2.resize(img, (width, height)) for img in imgs]
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, 10.0, (width, height))

    n_segs = len(resized)
    frames_per_seg = num_frames // n_segs

    for i in range(n_segs):
        img_curr = resized[i]
        img_next = resized[(i + 1) % n_segs]
        for f in range(frames_per_seg):
            alpha = f / frames_per_seg
            dx = int(np.sin(f * 0.1) * 8)
            dy = int(np.cos(f * 0.1) * 6)
            M = np.float32([[1, 0, dx], [0, 1, dy]])
            curr_shifted = cv2.warpAffine(img_curr, M, (width, height), borderMode=cv2.BORDER_REFLECT)

            if alpha > 0.8:
                factor = (alpha - 0.8) / 0.2
                frame = cv2.addWeighted(curr_shifted, 1.0 - factor, img_next, factor, 0)
            else:
                frame = curr_shifted
            out.write(frame)

    out.release()
    size_kb = os.path.getsize(output_path) / 1024
    print(f"Generated {output_path} ({num_frames} frames, {size_kb:.1f} KB)")

if __name__ == "__main__":
    generate_crowd_video(
        "sample_data/crowd1.mp4",
        [
            "frontend/public/images/cctv_3.jpg",
            "frontend/public/images/cctv_1.jpg",
            "frontend/public/images/cctv_2.jpg",
        ],
        num_frames=60,
    )
    generate_crowd_video(
        "sample_data/crowd2.mp4",
        [
            "frontend/public/images/cctv_6.jpg",
            "frontend/public/images/cctv_4.jpg",
            "frontend/public/images/cctv_5.jpg",
        ],
        num_frames=60,
    )
