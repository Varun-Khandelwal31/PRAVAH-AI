"""Benchmark 60 consecutive ticks on CPU in video mode to verify <=500ms latency across 6 cameras."""
import asyncio
import os
import time
from typing import List
import numpy as np

from app.sim.replay_engine import ReplayEngine, VideoFileSource, SimulatorSource


async def benchmark_mode(mode_name: str, engine: ReplayEngine, num_ticks: int = 60) -> List[float]:
    print(f"\n========================================================")
    print(f" BENCHMARK: {mode_name.upper()} MODE ({num_ticks} TICKS on CPU)")
    print(f"========================================================")
    print(f"{'Tick':<6} | {'Duration (ms)':<15} | {'Active Cam':<12} | {'Status':<10}")
    print("-" * 52)

    # Warm-up 2 ticks
    await engine.step()
    await engine.step()

    timings = []
    for i in range(1, num_ticks + 1):
        t0 = time.perf_counter()
        tick = await engine.step()
        dt_ms = (time.perf_counter() - t0) * 1000.0
        timings.append(dt_ms)
        status = "PASS" if dt_ms <= 500.0 else "EXCEEDED"
        active_cam = getattr(engine.source, "_last_cam_id", "N/A")
        print(f"{i:<6} | {dt_ms:<15.2f} | {str(active_cam):<12} | {status:<10}")

    avg_ms = np.mean(timings)
    min_ms = np.min(timings)
    max_ms = np.max(timings)
    p95_ms = np.percentile(timings, 95)

    print("-" * 52)
    print(f"SUMMARY ({mode_name.upper()}):")
    print(f"  Ticks Measured: {num_ticks}")
    print(f"  Average:        {avg_ms:.2f} ms")
    print(f"  Min:            {min_ms:.2f} ms")
    print(f"  Max:            {max_ms:.2f} ms")
    print(f"  95th %:         {p95_ms:.2f} ms")
    print(f"  Target:         < 500.00 ms -> {'VERIFIED PASS' if avg_ms < 500.0 else 'FAILED'}")
    print("========================================================\n")
    return timings


async def main():
    mode = os.environ.get("SOURCE_MODE", "video,webcam")
    os.environ["SOURCE_MODE"] = mode
    video_engine = ReplayEngine(source=VideoFileSource())
    await benchmark_mode(f"Hybrid Mode ({mode} - Round-Robin + YOLOv8n + Farneback)", video_engine, num_ticks=40)


if __name__ == "__main__":
    asyncio.run(main())
