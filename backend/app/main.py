"""FastAPI main application entrypoint for PRAVAHAI.

Wires WebSocket telemetry streaming, REST configuration and incident endpoints,
CORS middleware for frontend, and the background ReplayEngine runner.
"""
import asyncio
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.rest import router as rest_router, set_services
from app.api.ws import router as ws_router, ws_manager
from app.config import settings
from app.sim.demo_script import DemoController
from app.sim.replay_engine import ReplayEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("pravahai.main")

engine: ReplayEngine = None
demo_controller: DemoController = None
broadcaster_task: asyncio.Task = None


async def queue_broadcaster(replay_engine: ReplayEngine):
    """Continuously reads ticks from the engine's queue and broadcasts them to WebSocket subscribers."""
    while True:
        try:
            tick = await replay_engine.queue.get()
            await ws_manager.broadcast(tick)
            replay_engine.queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error broadcasting tick to WebSockets: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle management."""
    global engine, demo_controller, broadcaster_task

    logger.info("Initializing PRAVAHAI Replay Engine and Demo Controller...")
    engine = ReplayEngine()
    demo_controller = DemoController(engine)
    set_services(engine, demo_controller)

    # Start background tick broadcaster
    broadcaster_task = asyncio.create_task(queue_broadcaster(engine))

    # Start engine loop (~5 FPS)
    engine.start()

    yield

    logger.info("Shutting down PRAVAHAI services...")
    if broadcaster_task:
        broadcaster_task.cancel()
        try:
            await broadcaster_task
        except asyncio.CancelledError:
            pass

    if demo_controller and demo_controller.running:
        await demo_controller.clear()

    if engine:
        await engine.stop()


app = FastAPI(
    title="PRAVAHAI - AI Crowd Safety Command Center",
    description="Predicts crowd crushes on CCTV feeds with risk index, critical countdown, and Hindi voice alerts.",
    version="0.3.0",
    lifespan=lifespan,
)

# CORS middleware for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(ws_router)
app.include_router(rest_router)

# Mount static audio files for voice alert broadcasts
from pathlib import Path
from fastapi.staticfiles import StaticFiles

audio_dir = Path(__file__).resolve().parent.parent.parent / "sample_data" / "audio"
audio_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/audio", StaticFiles(directory=str(audio_dir)), name="static_audio")


@app.get("/health")
def health_check():
    """Health status check."""
    return {
        "status": "healthy",
        "zones_count": len(settings.zones),
        "voice_provider": "sarvam" if settings.sarvam_api_key else "edge-tts",
        "engine_active": engine.running if engine else False,
    }
