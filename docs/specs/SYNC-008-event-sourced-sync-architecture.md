# SYNC-008: Event-Sourced Sync Architecture

> **Status**: Superseded
> **Author**: Claude + Dug
> **Date**: 2025-12-06
> **Supersedes**: SYNC-007 (Unified Offline Architecture)
> **Superseded By**: [SYNC-012: Broadcast + Optimistic Sync](./SYNC-012-broadcast-optimistic-sync.md)
>
> **Note**: This spec proposed a full event-sourcing architecture with Dexie, custom materializers, and a sync engine. This was deemed too complex for current requirements. SYNC-012 provides a simpler approach using TanStack Query optimistic mutations + Broadcast.

## Executive Summary

This spec proposes replacing the current 3-mode sync system (api/realtime/offline) with a unified event-sourced architecture. All mutations become timestamped events that persist locally, sync to the server, and broadcast to other clients. This aligns with Pattern Stack's existing backend event system and properly solves offline-first requirements.

## 1. Problem Statement

### Current Architecture Issues

The existing sync-patterns implementation has three separate modes:

| Mode | Implementation | Persistence | Issues |
|------|----------------|-------------|--------|
| `api` | TanStack Query | None | No offline support |
| `realtime` | TanStack DB + Electric | In-memory | Lost on refresh |
| `offline` | TanStack DB + offline-transactions | Mutation queue only | Data not persisted, only pending mutations |

**Key problems:**

1. **Three paradigms**: Different code paths, complex generator, mental overhead
2. **Offline is incomplete**: Mutation queue persists, but cached data doesn't survive refresh
3. **No event history**: Only current state is tracked, no audit trail
4. **Misaligned with backend**: Backend has full event sourcing (SystemEvent), frontend doesn't use it

### Target Use Case: Restaurant POS

```
Server A (offline at 2:00pm)     Server B (online)
├─ 2:01 - Adds appetizer         ├─ 2:02 - Adds drink
├─ 2:03 - Adds main course       ├─ 2:05 - Removes drink
├─ 2:07 - Reconnects             │
│   └─ Syncs all 3 events        │
│      with original timestamps  │
└─ Both see consistent order     └─ Both see consistent order
```

**Requirements:**
- UI updates instantly (< 5ms) on user action
- Works completely offline for minutes/hours
- Events sync with correct timestamps when online
- Multiple devices see consistent state
- Full audit trail of what happened when

## 2. Architecture Overview

### Event Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (iPad)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Action                                                 │
│      │                                                       │
│      ▼ (1-2ms)                                              │
│  ┌─────────────────┐                                        │
│  │  Event Store    │  IndexedDB via Dexie                   │
│  │  (local)        │  - All events persisted                │
│  │                 │  - Survives refresh/restart            │
│  └────────┬────────┘                                        │
│           │                                                  │
│      ┌────┴────┐                                            │
│      ▼         ▼                                            │
│  ┌────────┐ ┌────────┐                                      │
│  │Materialize│ │Sync    │                                    │
│  │State   │ │Engine  │  Background, async                   │
│  └────┬───┘ └────┬───┘                                      │
│       │          │                                           │
│       ▼          ▼                                           │
│  React UI    POST /events ──────────────────────────────────┼──►
│  (instant)                                                   │
│                                                              │
│  ◄─────────────────────────────── Receive events ───────────┼──
│  (Electric / WebSocket / Polling)                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /events/batch                                          │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  Validate &     │───►│  SystemEvent    │  PostgreSQL     │
│  │  Deduplicate    │    │  (existing)     │                 │
│  └─────────────────┘    └────────┬────────┘                 │
│                                  │                           │
│                                  ▼                           │
│                         ┌─────────────────┐                 │
│                         │  Apply to       │  Update entity  │
│                         │  Entities       │  tables          │
│                         └────────┬────────┘                 │
│                                  │                           │
│                                  ▼                           │
│                         ┌─────────────────┐                 │
│                         │  Notification   │  Broadcast to   │
│                         │  Subsystem      │  other clients  │
│                         └─────────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Unified Model

Instead of 3 modes, there's **one paradigm**:

1. **All mutations are events** - structured, timestamped, immutable
2. **Events persist locally** - IndexedDB, survives anything
3. **State is derived** - materialized from event log
4. **Sync is background** - doesn't block UI
5. **Notification is pluggable** - Electric, Redis, WebSocket, polling

## 3. Backend Changes

### 3.1 Pattern Class Configuration

> **Note:** Unlike `ExtensibleFieldsMixin` which adds columns, sync functionality requires no mixin. Simply setting `sync_mode = "events"` in the Pattern class is sufficient - the metaclass automatically adds the necessary methods.

Extend Pattern class to declare sync behavior:

```python
# backend-patterns/pattern_stack/atoms/patterns/base.py

class Pattern:
    """Pattern configuration for model behavior."""

    # Existing
    track_changes: bool = True

    # New: Sync configuration
    sync_mode: Literal["api", "events"] = "api"
    sync_events: list[str] = []  # e.g., ["created", "updated", "item_added"]
    sync_notification: str = "electric"  # backend name
```

Usage in application models:

```python
# sales-patterns/app/features/orders/models.py

class Order(EventPattern):
    __tablename__ = "orders"

    class Pattern:
        sync_mode = "events"
        sync_events = [
            "created",
            "item_added",
            "item_removed",
            "state_changed",
            "archived"
        ]
        sync_notification = "electric"

    # Fields...
    table_number = Field(int, required=True)
    status = Field(str, default="open")
    items = Field(JSON, default=list)
```

### 3.2 Notification Subsystem

Following the existing subsystem pattern (like cache):

```
backend-patterns/pattern_stack/atoms/notifications/
├── __init__.py
├── backends/
│   ├── __init__.py
│   ├── base.py              # Abstract interface
│   ├── electric.py          # ElectricSQL streaming
│   ├── redis_pubsub.py      # Redis pub/sub
│   ├── websocket.py         # Native WebSocket
│   └── polling.py           # Client polling (no push)
├── factory.py               # Backend instantiation
├── service.py               # Unified interface
└── types.py                 # Shared types
```

**Base Interface:**

```python
# backends/base.py

from abc import ABC, abstractmethod
from typing import Callable, Any

class NotificationBackend(ABC):
    """Abstract base for notification backends."""

    @abstractmethod
    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict[str, Any]
    ) -> None:
        """Broadcast event to all subscribers of a channel."""
        pass

    @abstractmethod
    async def subscribe(
        self,
        channel: str,
        handler: Callable[[str, dict], None]
    ) -> None:
        """Subscribe to events on a channel."""
        pass

    @abstractmethod
    async def unsubscribe(self, channel: str) -> None:
        """Unsubscribe from a channel."""
        pass

    @property
    @abstractmethod
    def supports_push(self) -> bool:
        """Whether this backend supports server-initiated push."""
        pass
```

**Electric Backend Example:**

```python
# backends/electric.py

class ElectricNotificationBackend(NotificationBackend):
    """ElectricSQL-based notifications via shape streaming."""

    def __init__(self, electric_url: str):
        self.electric_url = electric_url

    async def broadcast(self, channel: str, event_type: str, payload: dict) -> None:
        # Electric handles this automatically via Postgres replication
        # Events written to system_events table are streamed to clients
        pass

    @property
    def supports_push(self) -> bool:
        return True
```

**Redis Backend Example:**

```python
# backends/redis_pubsub.py

class RedisNotificationBackend(NotificationBackend):
    """Redis pub/sub based notifications."""

    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        self._subscriptions: dict[str, Callable] = {}

    async def broadcast(self, channel: str, event_type: str, payload: dict) -> None:
        message = json.dumps({"type": event_type, "payload": payload})
        await self.redis.publish(f"sync:{channel}", message)

    async def subscribe(self, channel: str, handler: Callable) -> None:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(f"sync:{channel}")
        self._subscriptions[channel] = handler
        # Start listener task...

    @property
    def supports_push(self) -> bool:
        return True
```

### 3.3 Event Batch Endpoint

New endpoint for receiving client events:

```python
# Generated or manual in app/organisms/api/routers/events.py

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/events", tags=["events"])

class EventBatchRequest(BaseModel):
    events: list[ClientEvent]

class ClientEvent(BaseModel):
    id: str                          # Client-generated UUID
    event_type: str                  # e.g., "order.item_added"
    entity_type: str                 # e.g., "Order"
    entity_id: str                   # UUID
    payload: dict[str, Any]          # Event-specific data
    timestamp: datetime              # Client timestamp
    user_id: str | None = None
    idempotency_key: str | None = None

class EventBatchResponse(BaseModel):
    accepted: list[str]              # Event IDs accepted
    rejected: list[RejectedEvent]    # Events that failed

@router.post("/batch", response_model=EventBatchResponse)
async def receive_events(
    request: EventBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Receive batch of events from client."""
    accepted = []
    rejected = []

    for event in request.events:
        try:
            # 1. Check idempotency (skip if already processed)
            if event.idempotency_key:
                existing = await check_idempotency(db, event.idempotency_key)
                if existing:
                    accepted.append(event.id)
                    continue

            # 2. Validate event against schema
            validate_event(event)

            # 3. Store in SystemEvent (transactional)
            system_event = SystemEvent(
                event_category=EventCategory.CHANGE,
                event_type=event.event_type,
                entity_type=event.entity_type,
                entity_id=UUID(event.entity_id),
                new_value=event.payload,
                user_id=current_user.id,
                timestamp=event.timestamp,
                event_metadata={"client_id": event.id},
            )
            db.add(system_event)

            # 4. Apply to entity (domain logic)
            await apply_event_to_entity(db, event)

            await db.commit()
            accepted.append(event.id)

            # 5. Broadcast to other clients (after commit)
            await notifications.broadcast(
                channel=event.entity_type.lower(),
                event_type=event.event_type,
                payload=system_event.to_dict()
            )

        except Exception as e:
            rejected.append(RejectedEvent(id=event.id, reason=str(e)))
            await db.rollback()

    return EventBatchResponse(accepted=accepted, rejected=rejected)


@router.get("/since")
async def get_events_since(
    entity_type: str,
    since: datetime,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Get events since a timestamp (for polling/catch-up)."""
    events = await db.execute(
        select(SystemEvent)
        .where(SystemEvent.entity_type == entity_type)
        .where(SystemEvent.timestamp > since)
        .order_by(SystemEvent.timestamp)
        .limit(limit)
    )
    return [e.to_dict() for e in events.scalars()]
```

### 3.4 Event Application

Events are applied to entities via handlers:

```python
# sales-patterns/app/molecules/entities/order/handlers.py

async def apply_event_to_entity(db: AsyncSession, event: ClientEvent) -> None:
    """Apply event to entity state."""

    handlers = {
        "order.created": handle_order_created,
        "order.item_added": handle_item_added,
        "order.item_removed": handle_item_removed,
        "order.state_changed": handle_state_changed,
    }

    handler = handlers.get(event.event_type)
    if handler:
        await handler(db, event)


async def handle_item_added(db: AsyncSession, event: ClientEvent) -> None:
    """Handle item_added event."""
    order = await db.get(Order, UUID(event.entity_id))
    if order:
        order.items = [*order.items, event.payload["item"]]
        order.updated_at = event.timestamp
```

### 3.5 Auto-Generated Model Methods

When `sync_mode="events"` is set in the Pattern class, the metaclass automatically adds these methods to the model:

- `emit_event(event_type: str, payload: dict)` - Queue an event for this entity
- `get_event_history(limit: int = 100)` - Fetch events for this entity from SystemEvent

**Implementation in `__init_subclass__`:**

```python
def __init_subclass__(cls, **kwargs):
    super().__init_subclass__(**kwargs)

    # Auto-add sync methods if sync_mode == "events"
    if hasattr(cls, "Pattern"):
        sync_mode = getattr(cls.Pattern, "sync_mode", "api")
        if sync_mode == "events":
            cls.emit_event = _create_emit_event_method()
            cls.get_event_history = _create_get_event_history_method()
```

**Example usage:**

```python
order = Order(table_number=5)
await order.emit_event("item_added", {"item": "burger"})
history = await order.get_event_history()
```

### 3.6 Extension Architecture

To avoid BasePattern becoming a god-class, sync functionality is implemented as an internal extension:

```
atoms/patterns/
├── base.py              # Thin orchestrator
├── extensions/          # Internal extensions
│   ├── __init__.py
│   ├── fields.py        # Field processing logic
│   ├── changes.py       # Change tracking logic
│   ├── events.py        # Event emission logic
│   └── sync.py          # NEW: Sync methods
```

**Extension pattern:**

```python
# extensions/sync.py
class SyncExtension:
    @staticmethod
    def should_apply(cls) -> bool:
        if not hasattr(cls, "Pattern"):
            return False
        return getattr(cls.Pattern, "sync_mode", "api") == "events"

    @staticmethod
    def setup(cls) -> None:
        cls.emit_event = SyncExtension._emit_event
        cls.get_event_history = SyncExtension._get_event_history
```

**BasePattern orchestrates extensions:**

```python
EXTENSIONS = [FieldExtension, ChangeTrackingExtension, EventExtension, SyncExtension]

class BasePattern(UUIDMixin, Base):
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        for extension in EXTENSIONS:
            if extension.should_apply(cls):
                extension.setup(cls)
```

### 3.7 Discovery and Auto-Registration

Complete discovery → factory → registration pattern (mirroring ExtensibleFieldsMixin):

**Discovery function:**

```python
# sync/discovery.py
def discover_syncable_models(base_class: type) -> list[type]:
    """Discover all models where Pattern.sync_mode == 'events'"""
    syncable = []
    for mapper in base_class.registry.mappers:
        model = mapper.class_
        if not hasattr(model, "Pattern"):
            continue
        if getattr(model.Pattern, "sync_mode", "api") != "events":
            continue
        syncable.append(model)
    return syncable

def get_sync_config(model_class: type) -> dict:
    """Extract sync configuration from model's Pattern class."""
    return {
        "entity": getattr(model_class.Pattern, "entity", model_class.__tablename__),
        "sync_events": getattr(model_class.Pattern, "sync_events", []),
        "sync_notification": getattr(model_class.Pattern, "sync_notification", "redis"),
    }
```

**Router factory:**

```python
# api/routers/events.py
def create_events_router(
    syncable_models: list[type],
    prefix: str = "/api/v1/events",
    db_dependency = None,
    auth_dependency = None,
) -> APIRouter:
    """Create events router for all syncable models.

    Similar to create_field_router(), generates:
    - POST /batch - Receive events from clients
    - GET /since - Get events since timestamp
    - WS /stream - WebSocket for real-time events
    """
```

**App factory integration:**

```python
# app/factory.py
def create_app(settings) -> FastAPI:
    app = FastAPI(...)

    # Auto-register sync infrastructure
    if getattr(settings, "ENABLE_SYNC", False):
        from pattern_stack.atoms.sync.discovery import discover_syncable_models
        from pattern_stack.atoms.api.routers.events import create_events_router

        models = discover_syncable_models(Base)
        if models:
            router = create_events_router(
                syncable_models=models,
                auth_dependency=get_current_user if settings.AUTH_ENABLED else None,
            )
            app.include_router(router)

    return app
```

### 3.8 WebSocket Endpoint

WebSocket endpoint that bridges Redis pub/sub to clients:

```python
@router.websocket("/stream")
async def websocket_stream(
    websocket: WebSocket,
    channels: str = Query(None),  # Optional: filter channels
):
    """WebSocket endpoint for real-time event streaming.

    Subscribes to Redis pub/sub and forwards events to connected client.
    """
    await websocket.accept()

    # Subscribe to entity channels
    channel_list = channels.split(",") if channels else list(allowed_entities.keys())
    notifications = get_notification_service()

    try:
        async for channel, event in notifications.subscribe(*channel_list):
            await websocket.send_json({"channel": channel, "event": event})
    except WebSocketDisconnect:
        pass
    finally:
        await notifications.close()
```

## 4. Frontend Changes

### 4.1 Event Store (Dexie)

Core local event storage:

```typescript
// Generated: src/generated/store/eventStore.ts

import Dexie from 'dexie'

export interface LocalEvent {
  id: string                    // Client-generated UUID
  event_type: string            // e.g., "order.item_added"
  entity_type: string           // e.g., "Order"
  entity_id: string             // UUID of entity
  payload: Record<string, any>  // Event-specific data
  timestamp: number             // Unix ms (for ordering)
  user_id: string | null
  synced: boolean               // Has this been sent to server?
  server_id: string | null      // ID assigned by server after sync
  idempotency_key: string       // For deduplication
}

class EventStoreDB extends Dexie {
  events!: Dexie.Table<LocalEvent, string>

  constructor(dbName: string = 'pattern-stack-events') {
    super(dbName)

    this.version(1).stores({
      events: [
        'id',
        'entity_type',
        'entity_id',
        'timestamp',
        'synced',
        '[entity_type+entity_id]',
        '[entity_type+timestamp]',
        'idempotency_key'
      ].join(', ')
    })
  }
}

export const eventStore = new EventStoreDB()

// Core operations
export async function recordEvent(
  event: Omit<LocalEvent, 'id' | 'timestamp' | 'synced' | 'server_id' | 'idempotency_key'>
): Promise<LocalEvent> {
  const localEvent: LocalEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    synced: false,
    server_id: null,
    idempotency_key: crypto.randomUUID(),
  }

  await eventStore.events.add(localEvent)

  // Trigger background sync
  syncEngine.scheduleSync()

  return localEvent
}

export async function getEventsForEntity(
  entityType: string,
  entityId: string
): Promise<LocalEvent[]> {
  return eventStore.events
    .where('[entity_type+entity_id]')
    .equals([entityType, entityId])
    .sortBy('timestamp')
}

export async function getUnsyncedEvents(): Promise<LocalEvent[]> {
  return eventStore.events
    .where('synced')
    .equals(false)
    .sortBy('timestamp')
}

export async function markEventsSynced(eventIds: string[]): Promise<void> {
  await eventStore.events
    .where('id')
    .anyOf(eventIds)
    .modify({ synced: true })
}
```

### 4.2 Materializers

Convert event log to current state:

```typescript
// Generated: src/generated/materializers/order.ts

import { LocalEvent, getEventsForEntity } from '../store/eventStore'

export interface Order {
  id: string
  table_number: number
  status: string
  items: OrderItem[]
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
  added_at: string
}

export async function materializeOrder(orderId: string): Promise<Order | null> {
  const events = await getEventsForEntity('Order', orderId)

  if (events.length === 0) return null

  return events.reduce<Order | null>((order, event) => {
    switch (event.event_type) {
      case 'order.created':
        return {
          id: event.entity_id,
          table_number: event.payload.table_number,
          status: 'open',
          items: [],
          created_at: new Date(event.timestamp).toISOString(),
          updated_at: new Date(event.timestamp).toISOString(),
        }

      case 'order.item_added':
        if (!order) return null
        return {
          ...order,
          items: [...order.items, {
            ...event.payload.item,
            added_at: new Date(event.timestamp).toISOString(),
          }],
          updated_at: new Date(event.timestamp).toISOString(),
        }

      case 'order.item_removed':
        if (!order) return null
        return {
          ...order,
          items: order.items.filter(i => i.id !== event.payload.item_id),
          updated_at: new Date(event.timestamp).toISOString(),
        }

      case 'order.state_changed':
        if (!order) return null
        return {
          ...order,
          status: event.payload.new_status,
          updated_at: new Date(event.timestamp).toISOString(),
        }

      default:
        return order
    }
  }, null)
}

export async function materializeOrders(): Promise<Order[]> {
  // Get all unique order IDs from events
  const events = await eventStore.events
    .where('entity_type')
    .equals('Order')
    .toArray()

  const orderIds = [...new Set(events.map(e => e.entity_id))]

  const orders = await Promise.all(
    orderIds.map(id => materializeOrder(id))
  )

  return orders.filter((o): o is Order => o !== null)
}
```

### 4.3 Sync Engine

Background synchronization:

```typescript
// Generated: src/generated/store/syncEngine.ts

import { getUnsyncedEvents, markEventsSynced, eventStore } from './eventStore'
import { apiClient } from '../client'

class SyncEngine {
  private syncing = false
  private syncTimeout: number | null = null
  private lastSyncAttempt: number = 0
  private retryDelay: number = 1000
  private maxRetryDelay: number = 30000

  scheduleSync(delay: number = 100): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }
    this.syncTimeout = window.setTimeout(() => this.sync(), delay)
  }

  async sync(): Promise<void> {
    if (this.syncing || !navigator.onLine) {
      return
    }

    this.syncing = true
    this.lastSyncAttempt = Date.now()

    try {
      const unsynced = await getUnsyncedEvents()

      if (unsynced.length === 0) {
        this.retryDelay = 1000 // Reset retry delay
        return
      }

      const response = await apiClient.postEventsBatch({
        events: unsynced.map(e => ({
          id: e.id,
          event_type: e.event_type,
          entity_type: e.entity_type,
          entity_id: e.entity_id,
          payload: e.payload,
          timestamp: new Date(e.timestamp).toISOString(),
          user_id: e.user_id,
          idempotency_key: e.idempotency_key,
        }))
      })

      // Mark accepted events as synced
      if (response.accepted.length > 0) {
        await markEventsSynced(response.accepted)
      }

      // Handle rejected events (log for now, could implement retry logic)
      if (response.rejected.length > 0) {
        console.warn('Events rejected by server:', response.rejected)
      }

      // Reset retry delay on success
      this.retryDelay = 1000

      // If there were more events, schedule another sync
      if (unsynced.length > 0) {
        this.scheduleSync(100)
      }

    } catch (error) {
      console.error('Sync failed:', error)

      // Exponential backoff
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay)
      this.scheduleSync(this.retryDelay)

    } finally {
      this.syncing = false
    }
  }

  // Called when receiving events from server (via Electric/WebSocket/polling)
  async receiveEvents(events: ServerEvent[]): Promise<void> {
    for (const event of events) {
      // Check if we already have this event (from our own sync)
      const existing = await eventStore.events
        .where('idempotency_key')
        .equals(event.idempotency_key)
        .first()

      if (existing) {
        // Update with server info
        await eventStore.events.update(existing.id, {
          synced: true,
          server_id: event.server_id,
        })
      } else {
        // New event from another client
        await eventStore.events.add({
          id: crypto.randomUUID(),
          event_type: event.event_type,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          payload: event.payload,
          timestamp: new Date(event.timestamp).getTime(),
          user_id: event.user_id,
          synced: true,
          server_id: event.server_id,
          idempotency_key: event.idempotency_key,
        })
      }
    }
  }
}

export const syncEngine = new SyncEngine()

// Listen for online status
window.addEventListener('online', () => {
  console.log('[Sync] Online - triggering sync')
  syncEngine.scheduleSync(0)
})

window.addEventListener('offline', () => {
  console.log('[Sync] Offline - sync paused')
})
```

### 4.4 React Hooks

Clean React integration:

```typescript
// Generated: src/generated/hooks/useOrder.ts

import { useState, useEffect, useCallback } from 'react'
import { recordEvent, eventStore } from '../store/eventStore'
import { materializeOrder, materializeOrders, Order, OrderItem } from '../materializers/order'

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Initial load
    materializeOrders().then(setOrders).finally(() => setIsLoading(false))

    // Subscribe to changes (Dexie live query)
    const subscription = eventStore.events
      .where('entity_type')
      .equals('Order')
      .toArray()
      .then(() => materializeOrders().then(setOrders))

    // Re-materialize when events change
    const handleChange = () => {
      materializeOrders().then(setOrders)
    }

    eventStore.events.hook('creating', handleChange)
    eventStore.events.hook('updating', handleChange)

    return () => {
      eventStore.events.hook('creating').unsubscribe(handleChange)
      eventStore.events.hook('updating').unsubscribe(handleChange)
    }
  }, [])

  return { orders, isLoading }
}

export function useOrder(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    materializeOrder(orderId).then(setOrder).finally(() => setIsLoading(false))

    const handleChange = () => {
      materializeOrder(orderId).then(setOrder)
    }

    eventStore.events.hook('creating', handleChange)
    eventStore.events.hook('updating', handleChange)

    return () => {
      eventStore.events.hook('creating').unsubscribe(handleChange)
      eventStore.events.hook('updating').unsubscribe(handleChange)
    }
  }, [orderId])

  return { order, isLoading }
}

export function useOrderMutations() {
  const createOrder = useCallback(async (tableNumber: number): Promise<string> => {
    const orderId = crypto.randomUUID()

    await recordEvent({
      event_type: 'order.created',
      entity_type: 'Order',
      entity_id: orderId,
      payload: { table_number: tableNumber },
      user_id: getCurrentUserId(),
    })

    return orderId
  }, [])

  const addItem = useCallback(async (orderId: string, item: Omit<OrderItem, 'added_at'>) => {
    await recordEvent({
      event_type: 'order.item_added',
      entity_type: 'Order',
      entity_id: orderId,
      payload: { item: { ...item, id: crypto.randomUUID() } },
      user_id: getCurrentUserId(),
    })
  }, [])

  const removeItem = useCallback(async (orderId: string, itemId: string) => {
    await recordEvent({
      event_type: 'order.item_removed',
      entity_type: 'Order',
      entity_id: orderId,
      payload: { item_id: itemId },
      user_id: getCurrentUserId(),
    })
  }, [])

  const changeStatus = useCallback(async (orderId: string, newStatus: string) => {
    await recordEvent({
      event_type: 'order.state_changed',
      entity_type: 'Order',
      entity_id: orderId,
      payload: { new_status: newStatus },
      user_id: getCurrentUserId(),
    })
  }, [])

  return { createOrder, addItem, removeItem, changeStatus }
}
```

## 5. Generator Changes

### 5.1 New Generation Targets

sync-patterns will generate:

```
src/generated/
├── events/                    # Event type definitions
│   ├── order.events.ts        # OrderCreated, OrderItemAdded, etc.
│   └── index.ts
├── store/                     # Core infrastructure
│   ├── eventStore.ts          # Dexie database
│   ├── syncEngine.ts          # Background sync
│   └── index.ts
├── materializers/             # Event → State
│   ├── order.ts
│   └── index.ts
├── hooks/                     # React integration
│   ├── useOrder.ts
│   └── index.ts
├── client/                    # API client (existing, extended)
│   └── methods.ts             # Includes postEventsBatch
└── schemas/                   # Zod schemas (existing)
    └── ...
```

### 5.2 Backend Generation (New)

For entities with `sync_mode = "events"`:

```
app/generated/
├── events/
│   └── order_handlers.py      # Event application handlers
└── api/
    └── events_router.py       # Event batch endpoint
```

### 5.3 OpenAPI Extensions

Extend x-sync to include event configuration:

```yaml
paths:
  /orders:
    x-sync:
      mode: events
      events:
        - created
        - item_added
        - item_removed
        - state_changed
      notification: electric
```

## 6. Migration Path

### Phase 1: Infrastructure (No Breaking Changes)

1. Extract existing BasePattern functionality into extensions (fields, changes, events)
2. Add sync extension
3. Add notification subsystem to backend-patterns
4. Add event batch endpoint generation
5. Add Dexie event store to frontend-patterns
6. Keep existing 3-mode generator working

### Phase 2: Parallel Implementation

1. Add `sync_mode: "events"` option to Pattern class
2. Generate event-based code alongside existing code
3. Apps can opt-in per entity
4. Test with one entity (Order in sales-patterns)

### Phase 3: Migration Helpers

1. Provide migration scripts for existing apps
2. Deprecate 3-mode system (api/realtime/offline)
3. Update documentation

### Phase 4: Cleanup

1. Remove old generator code
2. Remove TanStack DB dependencies (unless needed for other purposes)
3. Simplify sync-patterns codebase

## 7. Configuration

### Backend Configuration

```python
# settings.py

class Settings(BaseSettings):
    # Notification backend
    NOTIFICATION_BACKEND: str = "electric"

    # Electric configuration
    ELECTRIC_URL: str = "http://localhost:3000"

    # Redis configuration (if using redis backend)
    REDIS_URL: str = "redis://localhost:6379"

    # Polling configuration (if using polling backend)
    POLLING_INTERVAL_SECONDS: int = 2
```

### Frontend Configuration

```typescript
// src/config/sync.ts

export const syncConfig = {
  // API endpoint for events
  eventsEndpoint: '/api/v1/events',

  // Notification strategy
  notification: 'electric' as 'electric' | 'websocket' | 'polling',

  // Electric URL (if using electric)
  electricUrl: import.meta.env.VITE_ELECTRIC_URL,

  // Polling interval (if using polling)
  pollingIntervalMs: 2000,

  // Sync behavior
  syncOnFocus: true,
  syncOnOnline: true,
  maxRetryDelayMs: 30000,
}
```

## 8. Open Questions

### 8.1 Conflict Resolution

**Current approach**: Last-write-wins based on timestamp.

**Questions**:
- Is timestamp-based ordering sufficient?
- Do we need vector clocks for true distributed ordering?
- Should specific event types have custom merge logic?

**Recommendation**: Start with timestamp ordering. Add custom handlers if specific entities need complex merging.

### 8.2 Event Retention

**Questions**:
- How long to keep events in IndexedDB?
- Should we compact old events into snapshots?
- How to handle device storage limits?

**Recommendation**: Keep 7 days of events locally. Implement snapshot compaction in future iteration.

### 8.3 Multi-Tenant Considerations

**Questions**:
- How to isolate events between tenants?
- Should tenant_id be part of event structure?
- How does this affect Electric shapes?

**Recommendation**: Add tenant_id to event schema. Filter by tenant in all queries.

### 8.4 Error Recovery

**Questions**:
- What happens if event application fails on server?
- How to handle schema version mismatches?
- Should clients retry indefinitely?

**Recommendation**: Rejected events stay in outbox with error reason. Surface to UI after N retries. Allow manual resolution.

## 9. Success Criteria

1. **Instant mutations**: UI updates in < 5ms on user action
2. **Full offline support**: Works completely offline for hours
3. **Correct ordering**: Events sync with original timestamps
4. **Multi-device consistency**: All devices see same state eventually
5. **Audit trail**: Complete history of what happened when
6. **Simpler codebase**: One paradigm instead of three
7. **Smaller bundle**: Remove TanStack DB, Electric client-side complexity

## 10. References

- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [Dexie.js Documentation](https://dexie.org/)
- [Pattern Stack Events System](/backend-patterns/pattern_stack/atoms/shared/events/)
- [SYNC-007: Unified Offline Architecture](./SYNC-007-unified-offline-architecture.md) (superseded)
