"""WebSocket streaming router broadcasting live pipeline ticks."""
import asyncio
import json
import logging
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket client connections and broadcasts live ticks."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("WebSocket client connected. Total clients: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info("WebSocket client disconnected. Remaining clients: %d", len(self.active_connections))

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        payload = json.dumps(message)
        to_remove = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                to_remove.add(connection)

        for dead_conn in to_remove:
            self.active_connections.discard(dead_conn)


ws_manager = ConnectionManager()


@router.websocket("/ws/stream")
@router.websocket("/ws/live")
async def websocket_stream_endpoint(websocket: WebSocket):
    """Streams live per-second crowd metric ticks to connected command center clients."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep-alive receive loop
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug("WebSocket exception: %s", e)
        ws_manager.disconnect(websocket)
