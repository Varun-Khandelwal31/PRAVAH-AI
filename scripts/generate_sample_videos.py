"""Generates sample crowd videos in sample_data/ for testing multi-camera video mode."""
import os
from pathlib import Path
import cv2
import numpy as np

def generate_crowd_video(output_path: str, num_frames: int = 150, width: int = 1280, height: int = 720, pattern: str = "escalating"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_path, fourcc, 10.0, (width, height))

    # Agents walking in the frame
    np.random.seed(42 if pattern == "escalating" else 99)
    max_agents = 80
    agents = []
    for _ in range(max_agents):
        agents.append({
            "x": float(np.random.uniform(0.1, 0.9)),
            "y": float(np.random.uniform(0.1, 0.9)),
            "vx": float(np.random.uniform(-0.005, 0.005)),
            "vy": float(np.random.uniform(-0.005, 0.005)),
            "radius": int(np.random.randint(10, 16)),
            "enter_frame": int(np.random.randint(0, 80)) if pattern == "escalating" else 0,
        })

    for f in range(num_frames):
        frame = np.full((height, width, 3), (35, 30, 28), dtype=np.uint8)

        # Draw venue corridor lines
        cv2.line(frame, (0, int(height * 0.5)), (width, int(height * 0.5)), (50, 45, 42), 2)
        cv2.line(frame, (int(width * 0.5), 0), (int(width * 0.5), height), (50, 45, 42), 2)

        active_count = 0
        for a in agents:
            if pattern == "escalating" and f < a["enter_frame"]:
                continue
            active_count += 1
            a["x"] += a["vx"]
            a["y"] += a["vy"]

            if a["x"] < 0.05 or a["x"] > 0.95:
                a["vx"] = -a["vx"]
            if a["y"] < 0.05 or a["y"] > 0.95:
                a["vy"] = -a["vy"]

            px = int(a["x"] * width)
            py = int(a["y"] * height)
            r = a["radius"]

            # Draw person (torso + head)
            cv2.ellipse(frame, (px, py + r), (r, int(r * 1.6)), 0, 0, 360, (50, 140, 210), -1)
            cv2.circle(frame, (px, py), int(r * 0.7), (200, 215, 230), -1)
            cv2.circle(frame, (px, py), int(r * 0.7), (20, 20, 20), 1)

        cv2.putText(frame, f"PRAVAHAI VENUE CAM - FRAME {f:03d} (AGENTS: {active_count})",
                    (30, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 229, 255), 2)
        out.write(frame)

    out.release()
    print(f"Generated {output_path} ({num_frames} frames)")

if __name__ == "__main__":
    p1 = "sample_data/crowd1.mp4"
    p2 = "sample_data/crowd2.mp4"
    if not os.path.exists(p1):
        generate_crowd_video(p1, pattern="escalating")
    if not os.path.exists(p2):
        generate_crowd_video(p2, pattern="steady")
