# SYNC-012 Integration Test Plan

## Overview

This document outlines the integration testing strategy for the SYNC-012 broadcast + optimistic sync implementation. Tests are organized by layer and complexity.

## Test Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 3: End-to-End (E2E)                                          │
│  - Browser → WebSocket → Backend → Redis → WebSocket → Browser      │
│  - Playwright or similar                                            │
└─────────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 2: Integration Tests                                          │
│  - Frontend WebSocket client → FastAPI test server                   │
│  - Backend broadcast → Redis pub/sub → multiple subscribers          │
└─────────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 1: Unit Tests (DONE)                                          │
│  - BroadcastClient with mock WebSocket                               │
│  - useBroadcastInvalidation with mock context                        │
│  - WebSocketBroadcastBackend with mock connections                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Current Status

| Layer | Backend | Frontend | Status |
|-------|---------|----------|--------|
| Unit Tests | 31 tests | 61+ tests | ✅ Done |
| Integration Tests | Redis pub/sub tests exist | None | 🚧 Partial |
| E2E Tests | - | - | ❌ Not started |

---

## Layer 2: Integration Tests

### 2.1 Backend WebSocket Integration (with Test Server)

**Goal**: Test real WebSocket connections without mocks

**File**: `backend-patterns/pattern_stack/__tests__/integration/test_websocket_broadcast_integration.py`

```python
"""
Integration tests for WebSocket broadcast with real connections.

Uses FastAPI TestClient with websocket support.
"""

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from pattern_stack.atoms.broadcast.backends.websocket import WebSocketBroadcastBackend


@pytest.fixture
def app_with_broadcast():
    """Create a FastAPI app with broadcast WebSocket endpoint."""
    app = FastAPI()
    backend = WebSocketBroadcastBackend()
    app.include_router(backend.get_router())

    app.state.broadcast = backend
    return app, backend


class TestWebSocketIntegration:
    """Integration tests with real WebSocket connections."""

    def test_client_connects_and_subscribes(self, app_with_broadcast):
        """Test that a client can connect and subscribe to a channel."""
        app, backend = app_with_broadcast

        with TestClient(app) as client:
            with client.websocket_connect("/ws/broadcast") as ws:
                # Subscribe to channel
                ws.send_json({"subscribe": ["orders"]})

                # Verify subscription
                assert backend.get_subscriber_count("orders") == 1

    def test_client_receives_broadcast(self, app_with_broadcast):
        """Test that a subscribed client receives broadcast messages."""
        app, backend = app_with_broadcast

        with TestClient(app) as client:
            with client.websocket_connect("/ws/broadcast") as ws:
                ws.send_json({"subscribe": ["orders"]})

                # Backend broadcasts
                import asyncio
                asyncio.get_event_loop().run_until_complete(
                    backend.broadcast("orders", "created", {"entity_id": "123"})
                )

                # Client receives
                data = ws.receive_json()
                assert data["channel"] == "orders"
                assert data["event"] == "created"
                assert data["payload"]["entity_id"] == "123"

    def test_multiple_clients_same_channel(self, app_with_broadcast):
        """Test multiple clients subscribing to the same channel."""
        app, backend = app_with_broadcast

        with TestClient(app) as client:
            with client.websocket_connect("/ws/broadcast") as ws1:
                with client.websocket_connect("/ws/broadcast") as ws2:
                    ws1.send_json({"subscribe": ["orders"]})
                    ws2.send_json({"subscribe": ["orders"]})

                    assert backend.get_subscriber_count("orders") == 2

    def test_client_unsubscribe(self, app_with_broadcast):
        """Test client unsubscribing from a channel."""
        app, backend = app_with_broadcast

        with TestClient(app) as client:
            with client.websocket_connect("/ws/broadcast") as ws:
                ws.send_json({"subscribe": ["orders"]})
                assert backend.get_subscriber_count("orders") == 1

                ws.send_json({"unsubscribe": ["orders"]})
                assert backend.get_subscriber_count("orders") == 0
```

### 2.2 Redis + WebSocket Integration

**Goal**: Test the full pub/sub flow for multi-instance deployments

**File**: `backend-patterns/pattern_stack/__tests__/integration/test_redis_websocket_integration.py`

```python
"""
Integration tests for Redis pub/sub with WebSocket fanout.

This tests the multi-instance scenario where:
1. Backend Instance A receives mutation request
2. Instance A broadcasts via Redis
3. All backend instances receive Redis message
4. Each instance fans out to its connected WebSocket clients

Requires: Redis running (docker-compose up redis)
"""

import asyncio
import pytest

from pattern_stack.atoms.broadcast.backends.redis import RedisBroadcastBackend
from pattern_stack.atoms.broadcast.backends.websocket import WebSocketBroadcastBackend


@pytest.fixture
async def redis_backend():
    """Create Redis broadcast backend."""
    backend = RedisBroadcastBackend(
        redis_url="redis://localhost:6379/0",
        channel_prefix="test_integration",
    )
    yield backend
    await backend.close()


class TestRedisWebSocketBridge:
    """Tests for bridging Redis pub/sub to WebSocket clients."""

    @pytest.mark.asyncio
    async def test_redis_broadcast_fans_out_to_websockets(
        self, redis_backend
    ):
        """Test that Redis broadcasts reach WebSocket clients."""
        ws_backend = WebSocketBroadcastBackend()
        received = []

        # Subscribe WebSocket backend to Redis channel
        async def bridge_handler(event_type, payload):
            await ws_backend.broadcast(
                channel=payload.get("channel", "unknown"),
                event_type=event_type,
                payload=payload,
            )
            received.append((event_type, payload))

        await redis_backend.subscribe("orders", bridge_handler)
        await asyncio.sleep(0.1)  # Let subscription establish

        # Broadcast via Redis
        await redis_backend.broadcast(
            channel="orders",
            event_type="created",
            payload={"entity_id": "123", "channel": "orders"},
        )

        # Wait for message
        await asyncio.sleep(0.2)

        assert len(received) == 1
        assert received[0][0] == "created"
        assert received[0][1]["entity_id"] == "123"
```

### 2.3 Frontend Integration Tests (Node.js)

**Goal**: Test frontend WebSocket client against real backend

**File**: `sync-patterns/test/integration/broadcast-client.integration.test.ts`

```typescript
/**
 * Integration tests for BroadcastClient with real WebSocket server.
 *
 * Requires: Backend running with WebSocket endpoint
 *   cd backend-patterns && make services-up
 *   uvicorn test_server:app --reload
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import { BroadcastClient, type BroadcastEvent } from '../../src/runtime/broadcast.js'

// Polyfill WebSocket for Node.js
globalThis.WebSocket = WebSocket as any

const TEST_URL = process.env.BROADCAST_URL || 'ws://localhost:8000/ws/broadcast'

describe('BroadcastClient Integration', () => {
  let client: BroadcastClient

  beforeAll(() => {
    client = new BroadcastClient(TEST_URL)
    client.connect()
  })

  afterAll(() => {
    client.disconnect()
  })

  it('connects to real WebSocket server', async () => {
    await waitForState(client, 'connected', 5000)
    expect(client.state).toBe('connected')
  })

  it('subscribes and receives broadcast messages', async () => {
    const events: BroadcastEvent[] = []

    const unsubscribe = client.subscribe('integration-test', (event) => {
      events.push(event)
    })

    // Wait for subscription to be sent
    await new Promise(r => setTimeout(r, 100))

    // Trigger broadcast from backend (via HTTP endpoint)
    await fetch('http://localhost:8000/test/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'integration-test',
        event: 'test_event',
        payload: { message: 'hello' },
      }),
    })

    // Wait for message
    await new Promise(r => setTimeout(r, 200))

    expect(events).toHaveLength(1)
    expect(events[0].channel).toBe('integration-test')
    expect(events[0].event).toBe('test_event')

    unsubscribe()
  })

  it('reconnects after disconnection', async () => {
    // Simulate server restart by disconnecting
    const states: string[] = []
    const unsub = client.onStateChange((s) => states.push(s))

    // Server-side disconnect (would need test endpoint)
    // For now, test manual reconnect
    client.disconnect()
    await waitForState(client, 'disconnected', 1000)

    client.connect()
    await waitForState(client, 'connected', 5000)

    expect(states).toContain('disconnected')
    expect(client.state).toBe('connected')

    unsub()
  })
})

// Helper function
function waitForState(
  client: BroadcastClient,
  targetState: string,
  timeout: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for state: ${targetState}`))
    }, timeout)

    if (client.state === targetState) {
      clearTimeout(timer)
      resolve()
      return
    }

    const unsub = client.onStateChange((state) => {
      if (state === targetState) {
        clearTimeout(timer)
        unsub()
        resolve()
      }
    })
  })
}
```

---

## Test Infrastructure

### Docker Compose for Tests

**File**: `docker-compose.test.yml`

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  test-backend:
    build:
      context: ./backend-patterns
      dockerfile: Dockerfile.test
    ports:
      - "8000:8000"
    depends_on:
      redis:
        condition: service_healthy
    environment:
      - REDIS_URL=redis://redis:6379/0
    command: uvicorn test_server:app --host 0.0.0.0 --port 8000
```

### Test Server

**File**: `backend-patterns/test_server.py`

```python
"""
Minimal FastAPI server for integration testing.
"""

from fastapi import FastAPI
from pydantic import BaseModel

from pattern_stack.atoms.broadcast.backends.websocket import WebSocketBroadcastBackend

app = FastAPI(title="Broadcast Test Server")
broadcast = WebSocketBroadcastBackend()

app.include_router(broadcast.get_router())


class BroadcastRequest(BaseModel):
    channel: str
    event: str
    payload: dict


@app.post("/test/broadcast")
async def trigger_broadcast(request: BroadcastRequest):
    """Endpoint to trigger broadcasts for testing."""
    await broadcast.broadcast(
        channel=request.channel,
        event_type=request.event,
        payload=request.payload,
    )
    return {"status": "broadcasted"}


@app.get("/health")
async def health():
    return {"status": "ok"}
```

---

## Running Tests

### Unit Tests (No Services Required)

```bash
# Frontend
cd sync-patterns
npm run test

# Backend
cd backend-patterns
make test-unit
```

### Integration Tests (Redis Required)

```bash
# Start Redis
cd backend-patterns
make services-up

# Run backend integration tests
make test-integration

# Run frontend integration tests (requires test server)
cd sync-patterns
npm run test:integration
```

### Full E2E (All Services)

```bash
# Start all services
docker-compose -f docker-compose.test.yml up -d

# Run E2E tests
npm run test:e2e
```

---

## Test Scenarios

### Scenario 1: Single Client Mutation Flow

```
1. Client A connects to WebSocket
2. Client A subscribes to "orders" channel
3. Client A performs optimistic mutation (creates order)
4. Client A sends API request
5. Backend saves to database
6. Backend broadcasts "order.created"
7. Client A receives broadcast (may ignore since it was the source)
8. Verify: Cache is updated, UI shows new order
```

### Scenario 2: Multi-Client Sync

```
1. Client A and Client B connect to WebSocket
2. Both subscribe to "orders" channel
3. Client A creates an order (optimistic)
4. Backend broadcasts "order.created"
5. Client B receives broadcast
6. Client B invalidates cache and refetches
7. Verify: Both clients show the same order list
```

### Scenario 3: Multi-Tab Sync (BroadcastChannel)

```
1. Tab 1 and Tab 2 are open (same browser)
2. Tab 1 creates an order (optimistic)
3. Tab 1 emits via BroadcastChannel
4. Tab 2 receives BroadcastChannel message
5. Tab 2 invalidates cache immediately
6. Verify: Tab 2 shows new order without waiting for server
```

### Scenario 4: Reconnection Recovery

```
1. Client connects and subscribes
2. WebSocket connection drops (network issue)
3. Client enters "reconnecting" state
4. Client reconnects successfully
5. Client re-subscribes to all channels
6. Verify: Subscriptions restored, messages flow again
```

---

## Success Criteria

| Test Category | Minimum Coverage |
|--------------|------------------|
| Unit Tests | 80% |
| Integration Tests | All scenarios pass |
| E2E Tests | Critical paths pass |

## Timeline

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | 2 days | Backend integration tests |
| Phase 2 | 2 days | Frontend integration tests |
| Phase 3 | 1 day | E2E scenarios |
| Phase 4 | 1 day | CI/CD integration |
