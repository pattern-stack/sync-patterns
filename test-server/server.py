"""Standalone WebSocket broadcast test server for E2E testing.

This is a self-contained server that doesn't depend on pattern_stack,
designed to run in a Docker container for E2E integration tests.

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any
from collections.abc import AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRouter
from pydantic import BaseModel


class BroadcastRequest(BaseModel):
    """Request model for programmatic broadcast triggering."""
    channel: str
    event_type: str
    payload: dict[str, Any]


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""
    status: str
    backend_type: str
    backend_healthy: bool


class BroadcastResponse(BaseModel):
    """Response model for broadcast endpoint."""
    success: bool
    channel: str
    event_type: str
    subscriber_count: int


class WebSocketBroadcastBackend:
    """Minimal WebSocket broadcast backend for testing."""

    def __init__(self) -> None:
        self._connections: dict[WebSocket, set[str]] = {}
        self._lock = asyncio.Lock()

    def get_router(self) -> APIRouter:
        """Get FastAPI router with WebSocket endpoint."""
        router = APIRouter()

        @router.websocket("/ws/broadcast")
        async def websocket_broadcast(websocket: WebSocket) -> None:
            await websocket.accept()
            async with self._lock:
                self._connections[websocket] = set()

            try:
                while True:
                    data = await websocket.receive_json()

                    if "subscribe" in data:
                        channels = data["subscribe"]
                        if isinstance(channels, list):
                            async with self._lock:
                                self._connections[websocket].update(channels)

                    if "unsubscribe" in data:
                        channels = data["unsubscribe"]
                        if isinstance(channels, list):
                            async with self._lock:
                                self._connections[websocket].difference_update(channels)

            except WebSocketDisconnect:
                pass
            finally:
                async with self._lock:
                    self._connections.pop(websocket, None)

        return router

    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Broadcast a message to all subscribers of a channel."""
        message = {
            "channel": channel,
            "event": event_type,
            "payload": payload,
        }
        message_json = json.dumps(message)

        async with self._lock:
            for ws, channels in list(self._connections.items()):
                if channel in channels:
                    try:
                        await ws.send_text(message_json)
                    except Exception:
                        # Connection might be closed
                        pass

    def get_subscriber_count(self, channel: str) -> int:
        """Get the number of subscribers for a channel."""
        count = 0
        for channels in self._connections.values():
            if channel in channels:
                count += 1
        return count

    def get_total_connections(self) -> int:
        """Get the total number of connected clients."""
        return len(self._connections)

    async def health_check(self) -> bool:
        """Check if the backend is healthy."""
        return True

    async def close(self) -> None:
        """Close all connections."""
        async with self._lock:
            for ws in list(self._connections.keys()):
                try:
                    await ws.close()
                except Exception:
                    pass
            self._connections.clear()


# Create backend instance
backend = WebSocketBroadcastBackend()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application lifespan."""
    yield
    await backend.close()


# Create FastAPI app
app = FastAPI(
    title="SYNC-012 Broadcast Test Server",
    description="Standalone test server for sync-patterns E2E testing",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include WebSocket router
app.include_router(backend.get_router())


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """Check server health."""
    backend_healthy = await backend.health_check()
    return HealthResponse(
        status="healthy" if backend_healthy else "degraded",
        backend_type="WebSocketBroadcastBackend",
        backend_healthy=backend_healthy,
    )


@app.post("/test/broadcast", response_model=BroadcastResponse, tags=["test"])
async def trigger_broadcast(request: BroadcastRequest) -> BroadcastResponse:
    """Trigger a broadcast programmatically for testing."""
    await backend.broadcast(
        channel=request.channel,
        event_type=request.event_type,
        payload=request.payload,
    )

    return BroadcastResponse(
        success=True,
        channel=request.channel,
        event_type=request.event_type,
        subscriber_count=backend.get_subscriber_count(request.channel),
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")

    print("Starting SYNC-012 Broadcast Test Server (Standalone)")
    print(f"  WebSocket: ws://{host}:{port}/ws/broadcast")
    print(f"  Health:    http://{host}:{port}/health")
    print(f"  Broadcast: POST http://{host}:{port}/test/broadcast")

    uvicorn.run(app, host=host, port=port)
