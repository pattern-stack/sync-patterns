# SPEC: Electric + Broadcast Sync Architecture

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-009 |
| **Title** | Electric + Broadcast Sync Architecture |
| **Status** | Draft |
| **Created** | 2025-12-26 |
| **Supersedes** | SYNC-008 (Event-Sourced Sync Architecture) |
| **Depends On** | [ADR-001](../adr/001-sync-stack-selection.md), [SYNC-002](SYNC-002-client-architecture.md) |
| **See Also** | [backend-patterns broadcast subsystem](https://github.com/pattern-stack/backend-patterns/tree/main/pattern_stack/atoms/broadcast) |

---

## Executive Summary

This specification defines a simplified sync architecture that combines **ElectricSQL** for data synchronization with **backend-patterns broadcast** for real-time push notifications. This replaces the more complex event-sourced approach proposed in SYNC-008.

### Key Insight

Electric already solves the hard sync problems (Postgres replication, conflict resolution, offline persistence). We don't need to rebuild it. We only need to add a thin **broadcast notification layer** to enable instant "something changed" signals.

### Goals

1. **Use Electric for data sync** - Postgres → PGlite via Electric ShapeStream
2. **Use Broadcast for push notifications** - Instant "entity changed" signals via WebSocket
3. **Collection-level auto-subscription** - Entities auto-refresh by default
4. **Page-level opt-out** - `live: false` option for edit forms and settings pages
5. **Minimal custom code** - Leverage existing infrastructure, don't rebuild

### Non-Goals

- Custom event store (Electric handles persistence)
- Hybrid Logical Clocks (Electric handles ordering)
- Custom materializers (TanStack DB handles state)
- Custom sync engine (Electric IS the sync engine)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Browser/App)                       │
│                                                                      │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │  React UI    │────▶│  TanStack DB │────▶│   PGlite     │        │
│   │  useOrder()  │◀────│  Collection  │◀────│  (local DB)  │        │
│   └──────────────┘     └──────────────┘     └──────────────┘        │
│          │                    ▲                    ▲                 │
│          │                    │                    │                 │
│          │    ┌───────────────┴────────────────────┘                 │
│          │    │                                                      │
│          │    │    ┌────────────────────────────────┐               │
│          │    │    │  BroadcastProvider             │               │
│          │    │    │  (WebSocket connection)        │               │
│          │    │    │  - Receives "entity changed"   │               │
│          │    │    │  - Triggers collection.invalidate()            │
│          │    │    └────────────────────────────────┘               │
│          │    │                    ▲                                 │
│          ▼    │                    │ WebSocket                       │
│   ┌──────────────────────┐        │                                 │
│   │  Mutation Handler    │        │                                 │
│   │  (POST to API)       │        │                                 │
│   └──────────┬───────────┘        │                                 │
└──────────────│────────────────────│─────────────────────────────────┘
               │                    │
               │ HTTP POST          │ ws://
               │                    │
┌──────────────▼────────────────────▼─────────────────────────────────┐
│                         BACKEND (FastAPI)                            │
│                                                                      │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │  API Router  │────▶│   Service    │────▶│  Postgres    │        │
│   │  /orders     │     │  (business   │     │  (source of  │        │
│   └──────────────┘     │   logic)     │     │   truth)     │        │
│                        └──────┬───────┘     └──────┬───────┘        │
│                               │                    │                 │
│                               ▼                    │                 │
│                        ┌──────────────┐     ┌──────────────┐        │
│                        │  Broadcast   │     │  ElectricSQL │        │
│                        │  (Redis)     │     │  (service)   │        │
│                        └──────────────┘     └──────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Two Sync Mechanisms

| Mechanism | Purpose | Latency | Data |
|-----------|---------|---------|------|
| **Electric** | Full data sync (Postgres → PGlite) | ~100-500ms | Complete entity state |
| **Broadcast** | "Something changed" notification | ~10-50ms | Just event type + entity ID |

### Why Both?

- **Electric alone**: Data syncs, but no instant notification that something changed
- **Broadcast alone**: Notification arrives, but you'd have to fetch data via API
- **Electric + Broadcast**: Instant notification triggers Electric shape refresh → sub-100ms perceived latency

---

## Concrete Example: Order Updated

**Tablet A** (cashier adds item):
```
1. User clicks "Add Burger"
2. TanStack DB optimistically updates local state (instant UI)
3. Mutation handler POSTs to /orders/{id}/items
4. Backend:
   a. Saves to Postgres
   b. Broadcasts: { channel: "order", event: "item_added", order_id: "123" }
5. Electric syncs the change to PGlite (confirms optimistic update)
```

**Tablet B** (kitchen display):
```
1. Receives broadcast via WebSocket: "order.item_added for order 123"
2. Calls ordersCollection.invalidate("123")
3. Electric immediately re-syncs that shape
4. UI updates with new item (~50-100ms total)
```

---

## Implementation Plan

### Phase 1: Backend - WebSocket Broadcast Endpoint

**Files to create/modify:**

#### 1.1 WebSocket Router

**File**: `backend-patterns/pattern_stack/atoms/broadcast/websocket.py`

```python
"""WebSocket endpoint for broadcast subscriptions.

Allows frontend clients to subscribe to broadcast channels
and receive real-time notifications.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pattern_stack.atoms.broadcast.factory import get_broadcast

router = APIRouter(prefix="/ws", tags=["broadcast"])

# Connected clients: channel -> set of websockets
_connections: dict[str, set[WebSocket]] = {}


@router.websocket("/broadcast")
async def broadcast_websocket(websocket: WebSocket):
    """WebSocket endpoint for broadcast subscriptions.

    Protocol:
    - Client sends: {"subscribe": ["order", "contact"]}
    - Server sends: {"channel": "order", "event": "item_added", "payload": {...}}
    """
    await websocket.accept()
    subscribed_channels: set[str] = set()

    try:
        # Handle subscription messages
        while True:
            data = await websocket.receive_json()

            if "subscribe" in data:
                for channel in data["subscribe"]:
                    subscribed_channels.add(channel)
                    if channel not in _connections:
                        _connections[channel] = set()
                    _connections[channel].add(websocket)

            if "unsubscribe" in data:
                for channel in data["unsubscribe"]:
                    subscribed_channels.discard(channel)
                    if channel in _connections:
                        _connections[channel].discard(websocket)

    except WebSocketDisconnect:
        # Clean up subscriptions
        for channel in subscribed_channels:
            if channel in _connections:
                _connections[channel].discard(websocket)


async def broadcast_to_websockets(channel: str, event_type: str, payload: dict):
    """Broadcast event to all WebSocket clients subscribed to channel."""
    if channel not in _connections:
        return

    message = {
        "channel": channel,
        "event": event_type,
        "payload": payload,
    }

    dead_connections = set()
    for ws in _connections[channel]:
        try:
            await ws.send_json(message)
        except Exception:
            dead_connections.add(ws)

    # Clean up dead connections
    _connections[channel] -= dead_connections
```

#### 1.2 WebSocket Broadcast Backend

**File**: `backend-patterns/pattern_stack/atoms/broadcast/backends/websocket_push.py`

```python
"""WebSocket-aware broadcast backend.

Wraps another backend (Redis/Memory) and additionally pushes
to connected WebSocket clients.
"""

from typing import Any
from pattern_stack.atoms.broadcast.base import BroadcastBackend, BroadcastHandler
from pattern_stack.atoms.broadcast.websocket import broadcast_to_websockets


class WebSocketBroadcastBackend(BroadcastBackend):
    """Broadcast backend that pushes to WebSocket clients.

    Wraps an underlying backend (Redis for persistence/fan-out)
    and additionally pushes to connected WebSocket clients.
    """

    def __init__(self, underlying: BroadcastBackend):
        self._underlying = underlying

    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        # Broadcast to underlying (Redis pub/sub for multi-server)
        await self._underlying.broadcast(channel, event_type, payload)

        # Also push to local WebSocket clients
        await broadcast_to_websockets(channel, event_type, payload)

    async def subscribe(self, channel: str, handler: BroadcastHandler) -> None:
        await self._underlying.subscribe(channel, handler)

    async def unsubscribe(self, channel: str) -> None:
        await self._underlying.unsubscribe(channel)

    @property
    def supports_push(self) -> bool:
        return True

    async def health_check(self) -> bool:
        return await self._underlying.health_check()

    async def close(self) -> None:
        await self._underlying.close()
```

#### 1.3 OpenAPI Extension for Broadcast Config

**File**: `backend-patterns/pattern_stack/atoms/patterns/openapi.py` (modify)

Add broadcast configuration to OpenAPI `x-sync` extension:

```python
def get_sync_extension(pattern_class) -> dict:
    """Generate x-sync OpenAPI extension from Pattern config."""
    config = getattr(pattern_class, 'Pattern', None)
    if not config:
        return {}

    extension = {}

    # Existing: local_first mode
    if hasattr(config, 'local_first'):
        extension['local_first'] = config.local_first

    # New: broadcast configuration
    if hasattr(config, 'broadcast') and config.broadcast.enabled:
        extension['broadcast'] = {
            'channel': config.broadcast.get_channel_name(pattern_class.__name__),
            'events': config.broadcast.events,
        }

    return extension
```

**OpenAPI output example:**

```yaml
/orders:
  x-sync:
    local_first: true
    broadcast:
      channel: order
      events: [created, item_added, item_removed, status_changed]
```

---

### Phase 2: Frontend - BroadcastProvider and Collection Integration

**Files to create:**

#### 2.1 Broadcast Client

**File**: `sync-patterns/src/runtime/broadcast.ts`

```typescript
/**
 * Broadcast client for real-time notifications.
 *
 * Connects to backend WebSocket and dispatches events
 * to subscribed handlers (typically collections).
 */

export interface BroadcastEvent {
  channel: string
  event: string
  payload: {
    entity_id?: string
    [key: string]: unknown
  }
}

type BroadcastHandler = (event: BroadcastEvent) => void

class BroadcastClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<BroadcastHandler>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000

  constructor(private url: string) {}

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      // Resubscribe to all channels
      const channels = Array.from(this.handlers.keys())
      if (channels.length > 0) {
        this.ws?.send(JSON.stringify({ subscribe: channels }))
      }
    }

    this.ws.onmessage = (event) => {
      const data: BroadcastEvent = JSON.parse(event.data)
      this.dispatch(data)
    }

    this.ws.onclose = () => {
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return

    setTimeout(() => {
      this.reconnectAttempts++
      this.connect()
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts))
  }

  subscribe(channel: string, handler: BroadcastHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set())
      // Subscribe on WebSocket if connected
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ subscribe: [channel] }))
      }
    }

    this.handlers.get(channel)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.handlers.get(channel)?.delete(handler)
      if (this.handlers.get(channel)?.size === 0) {
        this.handlers.delete(channel)
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ unsubscribe: [channel] }))
        }
      }
    }
  }

  private dispatch(event: BroadcastEvent): void {
    const handlers = this.handlers.get(event.channel)
    if (handlers) {
      handlers.forEach(handler => handler(event))
    }
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }
}

// Singleton instance
let client: BroadcastClient | null = null

export function initBroadcast(url: string): void {
  client = new BroadcastClient(url)
  client.connect()
}

export function getBroadcastClient(): BroadcastClient {
  if (!client) {
    throw new Error('Broadcast not initialized. Call initBroadcast() first.')
  }
  return client
}

export function subscribeToBroadcast(
  channel: string,
  handler: BroadcastHandler
): () => void {
  return getBroadcastClient().subscribe(channel, handler)
}
```

#### 2.2 React Provider

**File**: `sync-patterns/src/runtime/BroadcastProvider.tsx`

```typescript
/**
 * React provider for broadcast subscriptions.
 *
 * Initializes WebSocket connection and provides context
 * for collection auto-subscription.
 */

import { createContext, useContext, useEffect, ReactNode } from 'react'
import { initBroadcast, getBroadcastClient } from './broadcast'

interface BroadcastContextValue {
  isConnected: boolean
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null)

interface BroadcastProviderProps {
  url: string
  children: ReactNode
}

export function BroadcastProvider({ url, children }: BroadcastProviderProps) {
  useEffect(() => {
    initBroadcast(url)
    return () => {
      // Cleanup on unmount
    }
  }, [url])

  return (
    <BroadcastContext.Provider value={{ isConnected: true }}>
      {children}
    </BroadcastContext.Provider>
  )
}

export function useBroadcastContext() {
  return useContext(BroadcastContext)
}
```

#### 2.3 Collection Integration Hook

**File**: `sync-patterns/src/runtime/useBroadcastSync.ts`

```typescript
/**
 * Hook that connects a collection to broadcast notifications.
 *
 * When a broadcast event arrives for the configured channel,
 * invalidates the relevant entity in the collection.
 */

import { useEffect, useRef } from 'react'
import { subscribeToBroadcast, BroadcastEvent } from './broadcast'

interface UseBroadcastSyncOptions {
  /** Channel to subscribe to (e.g., 'order') */
  channel: string
  /** Whether broadcast sync is enabled (default: true) */
  enabled?: boolean
  /** Callback when entity should be invalidated */
  onInvalidate: (entityId?: string) => void
  /** Callback when any change occurs (for isStale tracking) */
  onStale?: () => void
}

export function useBroadcastSync(options: UseBroadcastSyncOptions): void {
  const { channel, enabled = true, onInvalidate, onStale } = options
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = subscribeToBroadcast(channel, (event: BroadcastEvent) => {
      if (!enabledRef.current) {
        // live: false - just mark as stale, don't invalidate
        onStale?.()
        return
      }

      // live: true - invalidate the entity
      onInvalidate(event.payload.entity_id)
    })

    return unsubscribe
  }, [channel, enabled, onInvalidate, onStale])
}
```

---

### Phase 3: Code Generation Updates

**Files to modify:**

#### 3.1 Update Parser for Broadcast Config

**File**: `sync-patterns/src/generators/parser.ts` (modify)

```typescript
// Add to ParsedEndpoint interface
export interface ParsedEndpoint {
  // ... existing fields ...

  // Broadcast configuration (new)
  broadcast?: {
    channel: string
    events: string[]
  }
}

// In parseEndpoint method, extract x-sync.broadcast
private parseEndpoint(path: string, method: HTTPMethod, operation: OpenAPIV3.OperationObject): ParsedEndpoint {
  const xSync = (operation as any)['x-sync'] || {}

  return {
    // ... existing fields ...
    broadcast: xSync.broadcast,
  }
}
```

#### 3.2 Collection Generator with Broadcast

**File**: `sync-patterns/src/generators/collection-generator.ts` (create)

```typescript
/**
 * Generates TanStack DB collections with Electric + Broadcast integration.
 */

import { ParsedEndpoint, ParsedSchema } from './parser'
import { toPascalCase, toCamelCase } from './naming'

export interface CollectionGeneratorOptions {
  /** Entity name (e.g., 'order') */
  entityName: string
  /** Parsed schema */
  schema: ParsedSchema
  /** Broadcast config from x-sync */
  broadcast?: {
    channel: string
    events: string[]
  }
  /** Whether entity is local_first */
  localFirst: boolean
}

export function generateCollection(options: CollectionGeneratorOptions): string {
  const { entityName, schema, broadcast, localFirst } = options
  const pascalName = toPascalCase(entityName)
  const camelName = toCamelCase(entityName)
  const pluralName = `${camelName}s` // Simple pluralization

  if (!localFirst) {
    // Non-local-first entities don't get collections
    return ''
  }

  const broadcastImport = broadcast
    ? `import { useBroadcastSync } from '../runtime/useBroadcastSync'`
    : ''

  const broadcastConfig = broadcast
    ? `
    // Broadcast configuration (auto-refresh on remote changes)
    broadcast: {
      channel: '${broadcast.channel}',
      events: ${JSON.stringify(broadcast.events)},
    },`
    : ''

  return `/**
 * TanStack DB collection for ${pascalName}.
 *
 * Generated by sync-patterns CLI.
 * DO NOT EDIT - changes will be overwritten.
 */

import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { getElectricUrl, getSyncConfig } from '../config'
import { ${pascalName}Schema } from '../schemas/${camelName}.schema'
import { ${camelName}Api } from '../client/${camelName}'
${broadcastImport}

export const ${camelName}Collection = createCollection(
  electricCollectionOptions({
    id: '${pluralName}',

    shapeOptions: {
      url: \`\${getElectricUrl()}/v1/shape\`,
      params: {
        table: '${pluralName}',
      },
    },

    getKey: (item) => item.id,
    schema: ${pascalName}Schema,
    ${broadcastConfig}

    // Mutation handlers
    onInsert: async ({ transaction }) => {
      const item = transaction.mutations[0].modified
      const response = await ${camelName}Api.create(item)
      return { txid: response.txid }
    },

    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0]
      const response = await ${camelName}Api.update(original.id, changes)
      return { txid: response.txid }
    },

    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0]
      const response = await ${camelName}Api.delete(original.id)
      return { txid: response.txid }
    },
  })
)
`
}
```

#### 3.3 Entity Hook Generator with Live Option

**File**: `sync-patterns/src/generators/entity-hook-generator.ts` (create)

```typescript
/**
 * Generates unified entity hooks with live/broadcast support.
 */

import { toPascalCase, toCamelCase } from './naming'

export interface EntityHookGeneratorOptions {
  entityName: string
  localFirst: boolean
  broadcast?: {
    channel: string
    events: string[]
  }
}

export function generateEntityHook(options: EntityHookGeneratorOptions): string {
  const { entityName, localFirst, broadcast } = options
  const pascalName = toPascalCase(entityName)
  const camelName = toCamelCase(entityName)

  const broadcastHook = broadcast ? `
  // Broadcast sync (live: true = auto-refresh, live: false = manual)
  const [isStale, setIsStale] = useState(false)

  useBroadcastSync({
    channel: '${broadcast.channel}',
    enabled: live,
    onInvalidate: (entityId) => {
      if (entityId) {
        ${camelName}Collection.invalidate(entityId)
      } else {
        ${camelName}Collection.invalidateAll()
      }
    },
    onStale: () => setIsStale(true),
  })` : ''

  const staleReturn = broadcast ? `
    isStale,
    refresh: () => {
      setIsStale(false)
      ${camelName}Collection.invalidateAll()
    },` : ''

  return `/**
 * Unified hook for ${pascalName} entity.
 *
 * Abstracts TanStack DB (local_first: true) vs TanStack Query (local_first: false)
 * and integrates broadcast sync for real-time updates.
 *
 * @param options.live - Enable auto-refresh on broadcast (default: true)
 *                       Set to false for edit forms, settings pages, etc.
 *
 * Generated by sync-patterns CLI.
 */

import { useState, useCallback } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { ${camelName}Collection } from '../collections/${camelName}'
import { useBroadcastSync } from '../runtime/useBroadcastSync'
import { isLocalFirst } from '../config'
import type { ${pascalName} } from '../schemas/${camelName}.schema'

export interface Use${pascalName}Options {
  /** Enable live updates via broadcast (default: true) */
  live?: boolean
}

export interface Use${pascalName}sResult {
  data: ${pascalName}[] | undefined
  isLoading: boolean
  error: Error | null
  ${broadcast ? `isStale: boolean` : ''}
  ${broadcast ? `refresh: () => void` : ''}
}

export function use${pascalName}s(
  options: Use${pascalName}Options = {}
): Use${pascalName}sResult {
  const { live = true } = options

  // Use TanStack DB for local_first entities
  const query = useLiveQuery(${camelName}Collection)
  ${broadcastHook}

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,${staleReturn}
  }
}

export interface Use${pascalName}Result {
  data: ${pascalName} | undefined
  isLoading: boolean
  error: Error | null
  ${broadcast ? `isStale: boolean` : ''}
  ${broadcast ? `refresh: () => void` : ''}
}

export function use${pascalName}(
  id: string,
  options: Use${pascalName}Options = {}
): Use${pascalName}Result {
  const { live = true } = options

  const query = useLiveQuery(${camelName}Collection, {
    where: { id },
  })

  ${broadcast ? `
  const [isStale, setIsStale] = useState(false)

  useBroadcastSync({
    channel: '${broadcast.channel}',
    enabled: live,
    onInvalidate: (entityId) => {
      if (!entityId || entityId === id) {
        ${camelName}Collection.invalidate(id)
      }
    },
    onStale: () => setIsStale(true),
  })` : ''}

  return {
    data: query.data?.[0],
    isLoading: query.isLoading,
    error: query.error,
    ${broadcast ? `isStale,
    refresh: () => {
      setIsStale(false)
      ${camelName}Collection.invalidate(id)
    },` : ''}
  }
}
`
}
```

---

### Phase 4: Configuration Updates

#### 4.1 Sync Config Extension

**File**: `sync-patterns/src/runtime/config.ts` (modify)

```typescript
export interface SyncConfig {
  /** ElectricSQL service URL */
  electricUrl: string

  /** WebSocket URL for broadcast (new) */
  broadcastUrl: string

  /** Default local_first mode */
  defaultLocalFirst: boolean

  /** Per-entity mode overrides */
  entities: Record<string, boolean>
}

let config: SyncConfig = {
  electricUrl: '',
  broadcastUrl: '',
  defaultLocalFirst: false,
  entities: {},
}

export function configureSync(overrides: Partial<SyncConfig>): void {
  config = { ...config, ...overrides }

  // Initialize broadcast if URL provided
  if (config.broadcastUrl) {
    initBroadcast(config.broadcastUrl)
  }
}

export function getElectricUrl(): string {
  return config.electricUrl
}

export function getBroadcastUrl(): string {
  return config.broadcastUrl
}

export function isLocalFirst(entity: string): boolean {
  if (!config.electricUrl) return false
  return config.entities[entity] ?? config.defaultLocalFirst
}
```

---

## Usage Examples

### App Initialization

```typescript
// main.tsx
import { configureSync } from '@/generated/config'
import { BroadcastProvider } from '@/generated/runtime/BroadcastProvider'

configureSync({
  electricUrl: import.meta.env.VITE_ELECTRIC_URL ?? '',
  broadcastUrl: import.meta.env.VITE_BROADCAST_URL ?? '',
})

function App() {
  return (
    <BroadcastProvider url={import.meta.env.VITE_BROADCAST_URL}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </BroadcastProvider>
  )
}
```

### Kitchen Display (Auto-refresh)

```typescript
function KitchenDisplay() {
  // Auto-refreshes when any order changes
  const { data: orders } = useOrders()

  return <OrderQueue orders={orders} />
}
```

### Order Edit Form (Stable)

```typescript
function OrderEditPage({ id }) {
  // Stable - won't refresh while editing
  const { data: order, isStale, refresh } = useOrder(id, { live: false })
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    if (order) setDraft(order)
  }, [order])

  return (
    <div>
      {isStale && (
        <Banner>
          Order was updated elsewhere.
          <Button onClick={refresh}>Reload</Button>
        </Banner>
      )}
      <OrderForm value={draft} onChange={setDraft} />
    </div>
  )
}
```

### Settings Page (Never Live)

```typescript
function SettingsPage() {
  // Never auto-refreshes
  const { data: settings, refresh } = useSettings({ live: false })

  return (
    <div>
      <SettingsForm settings={settings} />
      <Button onClick={refresh}>Reload Settings</Button>
    </div>
  )
}
```

---

## Testing Strategy

### Backend Tests

```python
# test_broadcast_websocket.py

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

async def test_websocket_subscription():
    """Test WebSocket subscription and event delivery."""
    client = TestClient(app)

    with client.websocket_connect("/ws/broadcast") as ws:
        # Subscribe to channel
        ws.send_json({"subscribe": ["order"]})

        # Trigger broadcast from service
        await broadcast.broadcast("order", "item_added", {"order_id": "123"})

        # Should receive event
        event = ws.receive_json()
        assert event["channel"] == "order"
        assert event["event"] == "item_added"
        assert event["payload"]["order_id"] == "123"
```

### Frontend Tests

```typescript
// broadcast.test.ts

describe('BroadcastClient', () => {
  it('reconnects on disconnect', async () => {
    const client = new BroadcastClient('ws://localhost/ws/broadcast')
    client.connect()

    // Simulate disconnect
    client['ws']?.close()

    // Should attempt reconnect
    await vi.advanceTimersByTimeAsync(1000)
    expect(client['ws']).not.toBeNull()
  })
})

// useOrder.test.tsx

describe('useOrder with broadcast', () => {
  it('auto-refreshes when live: true', async () => {
    const { result } = renderHook(() => useOrder('123'))

    // Simulate broadcast event
    act(() => {
      broadcastClient.dispatch({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '123' }
      })
    })

    // Should have triggered invalidation
    expect(mockInvalidate).toHaveBeenCalledWith('123')
  })

  it('sets isStale when live: false', async () => {
    const { result } = renderHook(() => useOrder('123', { live: false }))

    // Simulate broadcast event
    act(() => {
      broadcastClient.dispatch({
        channel: 'order',
        event: 'updated',
        payload: { entity_id: '123' }
      })
    })

    // Should be stale but not invalidated
    expect(result.current.isStale).toBe(true)
    expect(mockInvalidate).not.toHaveBeenCalled()
  })
})
```

---

## Validation Commands

### Backend

```bash
cd backend-patterns
uv run ruff format .
uv run ruff check .
uv run mypy pattern_stack/
uv run pytest pattern_stack/__tests__/test_broadcast*.py -v
```

### Frontend (sync-patterns)

```bash
cd sync-patterns
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## Migration from SYNC-008

If any SYNC-008 implementation was started:

1. **Remove** custom PGlite event store code
2. **Remove** HLC implementation
3. **Remove** custom materializers
4. **Remove** custom sync engine
5. **Keep** existing Electric integration (SYNC-002)
6. **Add** broadcast WebSocket endpoint
7. **Add** frontend BroadcastProvider
8. **Update** generated hooks with `live` option

---

## Summary

This architecture provides:

| Feature | How It's Achieved |
|---------|-------------------|
| **Offline support** | Electric + PGlite persists data locally |
| **Real-time sync** | Electric ShapeStream from Postgres |
| **Instant notifications** | Broadcast via WebSocket |
| **Auto-refresh** | Collection-level broadcast subscription |
| **Edit protection** | `live: false` opt-out per hook |
| **Staleness tracking** | `isStale` state for non-live hooks |

**What we're NOT building** (Electric handles):
- Custom event store
- Custom sync engine
- Custom conflict resolution
- Custom persistence layer

---

## References

- [ADR-001: Sync Stack Selection](../adr/001-sync-stack-selection.md)
- [SYNC-002: Client Architecture](SYNC-002-client-architecture.md)
- [backend-patterns broadcast subsystem](../../backend-patterns/pattern_stack/atoms/broadcast/)
- [TanStack DB Electric Collection](https://tanstack.com/db/latest/docs/collections/electric-collection)
- [ElectricSQL Documentation](https://electric-sql.com/docs)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-26 | Initial draft - Electric + Broadcast architecture |
