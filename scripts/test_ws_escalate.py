"""WebSocket test client verifying live ticks, Barricade Corridor escalation, and alert generation."""
import asyncio
import json
import httpx
import websockets

WS_URL = "ws://127.0.0.1:8000/ws/stream"
HTTP_BASE = "http://127.0.0.1:8000"


async def main():
    print(f"Connecting to WebSocket: {WS_URL}...")
    async with websockets.connect(WS_URL) as ws:
        print("Connected to WebSocket stream successfully.")

        # Receive 1 initial tick
        init_raw = await ws.recv()
        init_tick = json.loads(init_raw)
        bc_init = next(z for z in init_tick["zones"] if z["id"] == "barricade_corridor")
        print(f"Initial State: Barricade Corridor density={bc_init['density']}, level={bc_init['level']}")

        # Trigger escalation via REST API (accelerated 6x for fast test)
        async with httpx.AsyncClient(base_url=HTTP_BASE) as client:
            print("Triggering POST /demo/escalate?speed_mult=6.0...")
            resp = await client.post("/demo/escalate?speed_mult=6.0")
            print("Response:", resp.status_code, resp.json())

        # Collect stream ticks as density rises until red alert fires
        escalating_ticks = []
        alert_detected = False
        prev_density = -1.0

        for _ in range(80):  # listen up to ~16 seconds
            raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            tick = json.loads(raw)
            bc = next((z for z in tick["zones"] if z["id"] == "barricade_corridor"), None)
            if not bc:
                continue

            current_density = bc["density"]
            escalating_ticks.append((current_density, bc["level"], tick))

            if tick.get("alerts") and len(tick["alerts"]) > 0:
                alert_detected = True
                print("\n>>> CRITICAL ALERT DETECTED IN TICK PAYLOAD! <<<")
                break

        if not alert_detected:
            print("Alert not detected within window")
            return

        # Select 3 consecutive ticks showing rising density up to the alert
        selected_3 = [t[2] for t in escalating_ticks[-3:]]

        print("\n" + "=" * 60)
        print("3 CONSECUTIVE TICKS SHOWING DENSITY RISING AND ALERT APPEARING:")
        print("=" * 60)
        for i, t in enumerate(selected_3, 1):
            bc = next(z for z in t["zones"] if z["id"] == "barricade_corridor")
            print(f"\n--- TICK {i} ({t['ts']}) ---")
            print(f"Barricade Corridor: density={bc['density']} p/m², slope={bc['trend_slope']}, risk={bc['risk']}, eta_s={bc['eta_s']}, level={bc['level']}")
            print(f"Alerts in tick ({len(t['alerts'])}):")
            for a in t["alerts"]:
                print(f"  Alert ID: {a['id']}, Zone: {a['zone']}, ETA: {a['eta_s']}s, Actions: {a['actions']}")
            print("Full Zone Snapshot:")
            print(json.dumps(bc, indent=2))

        # Reset demo to nominal
        async with httpx.AsyncClient(base_url=HTTP_BASE) as client:
            await client.post("/demo/clear")
            print("\nDemo state reset to nominal.")


if __name__ == "__main__":
    asyncio.run(main())
