# Event-Sourced Sync Architecture - Implementation Plan

> **Status**: Planning (Revised)
> **Author**: Claude + Dug
> **Date**: 2025-12-06
> **Revised**: 2025-12-06
> **Spec**: [SYNC-008 Event-Sourced Sync Architecture](../specs/SYNC-008-event-sourced-sync-architecture.md)

## Executive Summary

This implementation plan consolidates the event-sourced sync architecture into a concrete, actionable roadmap. We are replacing the current 3-mode sync system (api/realtime/offline) with a unified event-sourced architecture where all mutations become timestamped events persisting locally and syncing in the background.

### What We're Building

A single, unified sync paradigm that:
- Records all mutations as immutable events in **PGlite** (Postgres WASM)
- Derives current state by materializing event logs (with snapshot optimization)
- Syncs events to server in background (doesn't block UI)
- Broadcasts changes to other clients via pluggable notification backends
- Works completely offline with proper event ordering on reconnect
- Uses **Hybrid Logical Clocks (HLC)** for correct distributed ordering

### Key Architectural Decisions

1. **Pattern-driven**: Configuration in Pattern class drives all code generation
2. **PGlite + Type-safe queries**: Postgres WASM with generated typed query functions (not raw SQL, not full ORM)
3. **Subsystem pattern**: Notification subsystem follows cache/storage pattern
4. **Auto-discovery**: Framework discovers models with `sync_mode="events"` and generates endpoints
5. **Local-first**: Events persist in PGlite before network operation
6. **Snapshot compaction**: Configurable checkpoints prevent unbounded event replay
7. **HLC timestamps**: Hybrid Logical Clocks for causally-correct ordering

### Benefits Over Current System

| Current (3 modes) | Event-Sourced (1 paradigm) |
|-------------------|----------------------------|
| TanStack Query (api) | PGlite event store |
| TanStack DB (realtime) | Same PGlite store |
| RxDB (offline) | Same PGlite store |
| Different code paths | Single code path |
| No offline state persistence | Full state persists |
| No audit trail | Complete event history |
| Complex generator | Simpler generator |
| Wall-clock timestamps | HLC (causally correct) |

### Why PGlite Over Dexie

Per ADR-005 (Local Database Selection), we use PGlite because:
- **Same SQL as backend**: Postgres everywhere, no impedance mismatch
- **Real SQL features**: CTEs, window functions, JSON operators
- **Type-safe generation**: Generate typed query functions from backend schemas
- **Smaller than alternatives**: ~1.4MB vs ~3MB for SQLite WASM

We generate a **typed query layer** (not raw SQL strings) that provides:
- Type-safe parameters and results (Zod validation)
- Generated from OpenAPI/backend schemas
- Composable query builders for complex operations
- Migration support

## Prerequisites

### Backend Sync Methods (Pragmatic Approach)

Rather than waiting for a full extension architecture refactor, we'll add sync methods directly to BasePattern via `__init_subclass__`:

```python
# In BasePattern.__init_subclass__
if hasattr(cls, "Pattern"):
    sync_mode = getattr(cls.Pattern, "sync_mode", "api")
    if sync_mode == "events":
        # Add sync methods directly
        cls.emit_sync_event = _create_emit_sync_event(cls)
        cls.get_event_history = _create_get_event_history(cls)
```

This is a pragmatic first step. A full extension architecture can be added later without changing the public API.

### Required ADRs (To Be Written)

Before implementation, document these decisions:
- **ADR-008**: Why event-sourcing over 3-mode system
- **ADR-009**: Conflict resolution strategy (HLC vs wall-clock)
- **ADR-010**: Snapshot compaction strategy

## Phase 1: Notification Subsystem

**Goal**: Create pluggable notification infrastructure for broadcasting events.

### Dependencies
- None (standalone subsystem)

### Tasks

#### 1.1 Create Notification Base Interface

Following the cache subsystem pattern:

```python
# backend-patterns/pattern_stack/atoms/notifications/base.py

from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable

class NotificationBackend(ABC):
    """Abstract base for notification backends.

    Notification backends handle broadcasting events to connected clients.
    Each backend implements a specific transport mechanism (Redis pub/sub,
    WebSocket, ElectricSQL streaming, etc.).
    """

    @abstractmethod
    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict[str, Any]
    ) -> None:
        """Broadcast an event to all subscribers of a channel.

        Args:
            channel: Channel name (typically entity type, e.g., 'order')
            event_type: Type of event (e.g., 'order.created')
            payload: Event data to broadcast
        """
        pass

    @abstractmethod
    async def subscribe(
        self,
        channel: str,
        handler: Callable[[str, dict[str, Any]], Awaitable[None]]
    ) -> None:
        """Subscribe to events on a channel.

        Args:
            channel: Channel name to subscribe to
            handler: Async function to call when events are received
        """
        pass

    @abstractmethod
    async def unsubscribe(self, channel: str) -> None:
        """Unsubscribe from a channel.

        Args:
            channel: Channel name to unsubscribe from
        """
        pass

    @property
    @abstractmethod
    def supports_push(self) -> bool:
        """Whether this backend supports server-initiated push.

        Returns:
            True if backend can push to clients, False for polling-only
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if notification backend is healthy.

        Returns:
            True if backend is accessible, False otherwise
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close connections and clean up resources."""
        pass
```

#### 1.2 Implement Redis Backend

```python
# backend-patterns/pattern_stack/atoms/notifications/backends/redis.py

import json
import asyncio
from typing import Any, Callable, Awaitable
from redis.asyncio import Redis
from pattern_stack.atoms.notifications.base import NotificationBackend
from pattern_stack.atoms.shared.logging import get_logger

logger = get_logger(__name__)

class RedisNotificationBackend(NotificationBackend):
    """Redis pub/sub based notification backend."""

    def __init__(self, redis_url: str) -> None:
        """Initialize Redis notification backend.

        Args:
            redis_url: Redis connection URL
        """
        self._redis_url = redis_url
        self._redis: Redis | None = None
        self._pubsub: Any = None
        self._subscriptions: dict[str, Callable] = {}
        self._listener_task: asyncio.Task | None = None

    async def _ensure_connected(self) -> Redis:
        """Ensure Redis connection is established."""
        if self._redis is None:
            self._redis = Redis.from_url(
                self._redis_url,
                decode_responses=True,
            )
        return self._redis

    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict[str, Any]
    ) -> None:
        """Broadcast event via Redis pub/sub."""
        redis = await self._ensure_connected()

        message = json.dumps({
            "type": event_type,
            "payload": payload,
        })

        channel_name = f"sync:{channel}"
        await redis.publish(channel_name, message)

        logger.debug(f"Broadcasted {event_type} to channel {channel_name}")

    async def subscribe(
        self,
        channel: str,
        handler: Callable[[str, dict[str, Any]], Awaitable[None]]
    ) -> None:
        """Subscribe to channel via Redis pub/sub."""
        redis = await self._ensure_connected()

        if self._pubsub is None:
            self._pubsub = redis.pubsub()

        channel_name = f"sync:{channel}"
        await self._pubsub.subscribe(channel_name)
        self._subscriptions[channel] = handler

        # Start listener task if not running
        if self._listener_task is None or self._listener_task.done():
            self._listener_task = asyncio.create_task(self._listen())

        logger.info(f"Subscribed to channel {channel_name}")

    async def _listen(self) -> None:
        """Listen for messages from Redis pub/sub."""
        if self._pubsub is None:
            return

        try:
            async for message in self._pubsub.listen():
                if message["type"] != "message":
                    continue

                # Extract channel and data
                channel_full = message["channel"]
                if not channel_full.startswith("sync:"):
                    continue

                channel = channel_full[5:]  # Remove "sync:" prefix

                # Get handler
                handler = self._subscriptions.get(channel)
                if handler is None:
                    continue

                # Parse message
                try:
                    data = json.loads(message["data"])
                    event_type = data["type"]
                    payload = data["payload"]

                    # Call handler
                    await handler(event_type, payload)

                except Exception as e:
                    logger.error(f"Error processing message on {channel}: {e}")

        except Exception as e:
            logger.error(f"Error in Redis listener: {e}")

    async def unsubscribe(self, channel: str) -> None:
        """Unsubscribe from channel."""
        if self._pubsub is None:
            return

        channel_name = f"sync:{channel}"
        await self._pubsub.unsubscribe(channel_name)
        self._subscriptions.pop(channel, None)

        logger.info(f"Unsubscribed from channel {channel_name}")

    @property
    def supports_push(self) -> bool:
        """Redis pub/sub supports server push."""
        return True

    async def health_check(self) -> bool:
        """Check Redis connectivity."""
        try:
            redis = await self._ensure_connected()
            return await redis.ping()
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return False

    async def close(self) -> None:
        """Close Redis connection."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

        if self._pubsub:
            await self._pubsub.close()

        if self._redis:
            await self._redis.close()

        logger.info("Redis notification backend closed")
```

#### 1.3 Implement Memory Backend (Testing)

```python
# backend-patterns/pattern_stack/atoms/notifications/backends/memory.py

from typing import Any, Callable, Awaitable
from pattern_stack.atoms.notifications.base import NotificationBackend

class MemoryNotificationBackend(NotificationBackend):
    """In-memory notification backend for testing."""

    def __init__(self) -> None:
        self._subscriptions: dict[str, list[Callable]] = {}

    async def broadcast(
        self,
        channel: str,
        event_type: str,
        payload: dict[str, Any]
    ) -> None:
        """Broadcast to in-memory subscribers."""
        handlers = self._subscriptions.get(channel, [])
        for handler in handlers:
            await handler(event_type, payload)

    async def subscribe(
        self,
        channel: str,
        handler: Callable[[str, dict[str, Any]], Awaitable[None]]
    ) -> None:
        """Subscribe handler to channel."""
        if channel not in self._subscriptions:
            self._subscriptions[channel] = []
        self._subscriptions[channel].append(handler)

    async def unsubscribe(self, channel: str) -> None:
        """Remove all handlers for channel."""
        self._subscriptions.pop(channel, None)

    @property
    def supports_push(self) -> bool:
        return True

    async def health_check(self) -> bool:
        return True

    async def close(self) -> None:
        self._subscriptions.clear()
```

#### 1.4 Create Factory and Service

```python
# backend-patterns/pattern_stack/atoms/notifications/factory.py

from typing import Any
from pattern_stack.atoms.config.settings import get_settings
from pattern_stack.atoms.notifications.base import NotificationBackend

def get_notification_backend(**kwargs: Any) -> NotificationBackend:
    """Factory function to create notification backend based on settings.

    Returns:
        Configured notification backend instance
    """
    settings = get_settings()
    backend_type = getattr(settings, "NOTIFICATION_BACKEND", "memory")

    if backend_type == "redis":
        from pattern_stack.atoms.notifications.backends.redis import RedisNotificationBackend
        redis_url = kwargs.get("redis_url") or settings.REDIS_URL
        return RedisNotificationBackend(redis_url=redis_url)

    elif backend_type == "memory":
        from pattern_stack.atoms.notifications.backends.memory import MemoryNotificationBackend
        return MemoryNotificationBackend()

    else:
        raise ValueError(f"Unknown notification backend: {backend_type}")


# Singleton instance
_notification_backend: NotificationBackend | None = None

def get_notifications() -> NotificationBackend:
    """Get global notification backend instance.

    Returns:
        Shared notification backend instance
    """
    global _notification_backend
    if _notification_backend is None:
        _notification_backend = get_notification_backend()
    return _notification_backend
```

#### 1.5 Settings Integration

```python
# backend-patterns/pattern_stack/atoms/config/settings.py

class Settings(BaseSettings):
    # ... existing settings ...

    # Notification subsystem
    NOTIFICATION_BACKEND: str = "memory"  # "redis" | "memory" | "electric"

    # Redis settings (if using redis backend)
    REDIS_PUBSUB_CHANNEL_PREFIX: str = "sync"
```

### File Structure

```
backend-patterns/pattern_stack/atoms/notifications/
├── __init__.py
├── base.py                    # NotificationBackend interface
├── backends/
│   ├── __init__.py
│   ├── redis.py              # Redis pub/sub
│   ├── memory.py             # In-memory (testing)
│   └── noop.py               # Disabled backend
├── factory.py                 # Backend creation
└── types.py                   # Shared types
```

## Phase 2: Sync Extension

**Goal**: Add sync capabilities to BasePattern via new extension.

### Dependencies
- BasePattern extension architecture (prerequisite)
- Phase 1 (Notification subsystem)

### Tasks

#### 2.1 Create Sync Extension

```python
# backend-patterns/pattern_stack/atoms/patterns/extensions/sync.py

from typing import TYPE_CHECKING, Any
from datetime import datetime
from uuid import UUID
from pattern_stack.atoms.patterns.extensions.base import PatternExtension
from pattern_stack.atoms.notifications.factory import get_notifications
from pattern_stack.atoms.shared.events import EventCategory, EventData, get_event_store
from pattern_stack.atoms.shared.logging import get_logger

if TYPE_CHECKING:
    from pattern_stack.atoms.patterns.base import BasePattern

logger = get_logger(__name__)

class SyncExtension(PatternExtension):
    """Extension that adds sync event emission and notification capabilities."""

    def setup_class(self) -> None:
        """Set up sync event emission for this pattern class."""
        cls = self.pattern_class

        # Add class methods for sync
        cls.emit_sync_event = classmethod(self._emit_sync_event)
        cls.get_event_history = classmethod(self._get_event_history)

    @staticmethod
    async def _emit_sync_event(
        cls: type["BasePattern"],
        event_type: str,
        entity_id: UUID,
        payload: dict[str, Any],
        user_id: UUID | None = None,
    ) -> None:
        """Emit a sync event and broadcast to clients.

        Args:
            event_type: Type of event (e.g., "order.item_added")
            entity_id: ID of the entity
            payload: Event-specific data
            user_id: User who triggered the event
        """
        # Get entity name from Pattern config
        pattern_config = getattr(cls, "Pattern", None)
        entity_type = (
            getattr(pattern_config, "entity", cls.__name__.lower())
            if pattern_config
            else cls.__name__.lower()
        )

        # Store event in SystemEvent table
        event_store = get_event_store()
        event_data = EventData(
            event_category=EventCategory.CHANGE,
            event_type=event_type,
            entity_type=cls.__name__,
            entity_id=entity_id,
            new_value=payload,
            user_id=user_id,
            timestamp=datetime.now(UTC),
        )

        await event_store.emit(event_data)

        # Broadcast to clients via notification backend
        notifications = get_notifications()
        await notifications.broadcast(
            channel=entity_type,
            event_type=event_type,
            payload={
                "entity_id": str(entity_id),
                "event_type": event_type,
                "payload": payload,
                "user_id": str(user_id) if user_id else None,
                "timestamp": event_data.timestamp.isoformat(),
            }
        )

        logger.info(f"Emitted sync event {event_type} for {entity_type}:{entity_id}")

    @staticmethod
    async def _get_event_history(
        cls: type["BasePattern"],
        entity_id: UUID,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[EventData]:
        """Get sync event history for an entity.

        Args:
            entity_id: Entity ID to get events for
            since: Only return events after this timestamp
            limit: Maximum number of events to return

        Returns:
            List of event data objects
        """
        event_store = get_event_store()

        from pattern_stack.atoms.shared.events import EventFilters

        filters = EventFilters(
            event_category=EventCategory.CHANGE,
            entity_type=cls.__name__,
            entity_id=entity_id,
            timestamp_from=since,
            limit=limit,
        )

        return await event_store.query(filters)
```

#### 2.2 Update BasePattern to Include Sync Extension

Integration point (assumes extension architecture exists):

```python
# backend-patterns/pattern_stack/atoms/patterns/base.py

def __init_subclass__(cls, **kwargs: Any) -> None:
    """Process extensions during class creation."""
    # ... existing extension setup code ...

    # Sync extension (conditional on Pattern.sync_mode)
    if hasattr(cls, "Pattern"):
        sync_mode = getattr(cls.Pattern, "sync_mode", "api")
        if sync_mode == "events":
            from pattern_stack.atoms.patterns.extensions.sync import SyncExtension
            sync_ext = SyncExtension(cls)
            sync_ext.setup_class()
            cls._extensions["sync"] = sync_ext
            logger.info(f"Enabled event sync for {cls.__name__}")
```

#### 2.3 Pattern Configuration

```python
# Usage in application models
class Order(EventPattern):
    __tablename__ = "orders"

    class Pattern:
        entity = "order"
        sync_mode = "events"  # Enable sync extension
        sync_events = [
            "created",
            "item_added",
            "item_removed",
            "state_changed",
        ]
        sync_notification = "redis"  # Which backend to use

    # Fields...
```

#### 2.4 Discovery Function

```python
# backend-patterns/pattern_stack/atoms/app/discovery.py

def discover_syncable_models(
    base_class: type[DeclarativeBase],
) -> list[type["BasePattern"]]:
    """Discover models with sync_mode='events'.

    Args:
        base_class: SQLAlchemy declarative base

    Returns:
        List of models with event sync enabled
    """
    from pattern_stack.atoms.patterns.base import BasePattern

    syncable_models: list[type[BasePattern]] = []

    if not hasattr(base_class, "registry"):
        logger.warning(
            f"Base class {base_class.__name__} has no registry, cannot discover models"
        )
        return syncable_models

    for mapper in base_class.registry.mappers:
        model_class = mapper.class_

        # Must be BasePattern subclass
        if not issubclass(model_class, BasePattern):
            continue

        # Must have Pattern class with sync_mode='events'
        if not hasattr(model_class, "Pattern"):
            continue

        sync_mode = getattr(model_class.Pattern, "sync_mode", "api")
        if sync_mode != "events":
            continue

        syncable_models.append(model_class)
        logger.debug(f"Discovered syncable model: {model_class.__name__}")

    logger.info(f"Discovered {len(syncable_models)} syncable models")
    return syncable_models
```

### Usage Example

```python
# In application code
class OrderEntity:
    """Domain entity that uses sync events."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_item(
        self,
        order_id: UUID,
        item: dict[str, Any],
        user_id: UUID,
    ) -> None:
        """Add item to order with sync event."""
        # 1. Update database
        order = await self.db.get(Order, order_id)
        order.items = [*order.items, item]
        await self.db.commit()

        # 2. Emit sync event (broadcasts to clients)
        await Order.emit_sync_event(
            event_type="order.item_added",
            entity_id=order_id,
            payload={"item": item},
            user_id=user_id,
        )
```

## Phase 3: Router Generation

**Goal**: Auto-generate event batch endpoints for discovered syncable models.

### Dependencies
- Phase 2 (Sync extension and discovery)

### Tasks

#### 3.1 Create Events Router Factory

```python
# backend-patterns/pattern_stack/atoms/api/routers/events.py

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import datetime
from typing import Any

from pattern_stack.atoms.data.session import get_db
from pattern_stack.atoms.shared.events import get_event_store, EventData, EventCategory

class ClientEvent(BaseModel):
    """Event received from client."""
    id: str
    event_type: str
    entity_type: str
    entity_id: str
    payload: dict[str, Any]
    timestamp: datetime
    user_id: str | None = None
    idempotency_key: str | None = None

class EventBatchRequest(BaseModel):
    """Batch of events from client."""
    events: list[ClientEvent]

class RejectedEvent(BaseModel):
    """Event that was rejected."""
    id: str
    reason: str

class EventBatchResponse(BaseModel):
    """Response from event batch endpoint."""
    accepted: list[str]
    rejected: list[RejectedEvent]

def create_events_router(
    model_classes: list[type],
    prefix: str = "/events",
    tags: list[str] | None = None,
) -> APIRouter:
    """Create events router for syncable models.

    Args:
        model_classes: List of models with sync_mode='events'
        prefix: URL prefix
        tags: OpenAPI tags

    Returns:
        Configured router
    """
    router = APIRouter(prefix=prefix, tags=tags or ["events"])

    # Build handler mapping
    event_handlers: dict[str, Any] = {}
    for model_class in model_classes:
        pattern_config = getattr(model_class, "Pattern", None)
        if not pattern_config:
            continue

        entity_type = getattr(pattern_config, "entity", model_class.__name__.lower())
        sync_events = getattr(pattern_config, "sync_events", [])

        for event_name in sync_events:
            event_type = f"{entity_type}.{event_name}"
            # Register handler (to be implemented in Phase 4)
            event_handlers[event_type] = (model_class, event_name)

    @router.post("/batch", response_model=EventBatchResponse)
    async def receive_events(
        request: EventBatchRequest,
        db: AsyncSession = Depends(get_db),
    ) -> EventBatchResponse:
        """Receive batch of events from clients."""
        from pattern_stack.atoms.notifications.factory import get_notifications

        accepted = []
        rejected = []
        event_store = get_event_store()
        notifications = get_notifications()

        for event in request.events:
            try:
                # 1. Validate event type is registered
                if event.event_type not in event_handlers:
                    rejected.append(RejectedEvent(
                        id=event.id,
                        reason=f"Unknown event type: {event.event_type}"
                    ))
                    continue

                # 2. Check idempotency
                if event.idempotency_key:
                    # Check if already processed (implementation needed)
                    pass

                # 3. Store in SystemEvent
                event_data = EventData(
                    event_category=EventCategory.CHANGE,
                    event_type=event.event_type,
                    entity_type=event.entity_type,
                    entity_id=UUID(event.entity_id),
                    new_value=event.payload,
                    user_id=UUID(event.user_id) if event.user_id else None,
                    timestamp=event.timestamp,
                    event_metadata={"client_id": event.id},
                )
                await event_store.emit(event_data)

                # 4. Apply to entity (handler lookup)
                model_class, event_name = event_handlers[event.event_type]
                # Application logic to be implemented per entity

                await db.commit()
                accepted.append(event.id)

                # 5. Broadcast to other clients
                await notifications.broadcast(
                    channel=event.entity_type.lower(),
                    event_type=event.event_type,
                    payload={
                        "entity_id": event.entity_id,
                        "event_type": event.event_type,
                        "payload": event.payload,
                        "timestamp": event.timestamp.isoformat(),
                    }
                )

            except Exception as e:
                rejected.append(RejectedEvent(
                    id=event.id,
                    reason=str(e)
                ))
                await db.rollback()

        return EventBatchResponse(
            accepted=accepted,
            rejected=rejected
        )

    @router.get("/since")
    async def get_events_since(
        entity_type: str,
        since: datetime,
        limit: int = 100,
        db: AsyncSession = Depends(get_db),
    ) -> list[dict[str, Any]]:
        """Get events since a timestamp (for polling/catch-up)."""
        event_store = get_event_store()

        from pattern_stack.atoms.shared.events import EventFilters

        filters = EventFilters(
            event_category=EventCategory.CHANGE,
            entity_type=entity_type,
            timestamp_from=since,
            limit=limit,
        )

        events = await event_store.query(filters)
        return [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "entity_type": e.entity_type,
                "entity_id": str(e.entity_id),
                "payload": e.new_value,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in events
        ]

    return router
```

#### 3.2 App Factory Integration

```python
# backend-patterns/pattern_stack/atoms/app/factory.py

def create_app(settings: Settings | None = None) -> FastAPI:
    """Create FastAPI app with auto-discovered routers."""
    # ... existing app creation ...

    # Auto-discover and register event routers
    from pattern_stack.atoms.app.discovery import discover_syncable_models
    from pattern_stack.atoms.api.routers.events import create_events_router
    from pattern_stack.atoms.data.database import Base

    syncable_models = discover_syncable_models(Base)
    if syncable_models:
        events_router = create_events_router(
            model_classes=syncable_models,
            prefix="/api/v1/events",
            tags=["events"],
        )
        app.include_router(events_router)
        logger.info(f"Registered events router for {len(syncable_models)} models")

    return app
```

## Phase 4: Frontend Generation

**Goal**: Generate TypeScript event store (PGlite), type-safe queries, materializers with snapshot support, sync engine with leader election, and React hooks.

### Dependencies
- Phase 3 (Backend endpoints available)

### Tasks

#### 4.1 Update OpenAPI Generator

Parse `x-sync` extensions from OpenAPI spec:

```typescript
// sync-patterns/src/parsers/openapi-parser.ts

export interface SyncConfig {
  mode: 'api' | 'events'
  events?: string[]
  notification?: string
  snapshot?: SnapshotConfig  // NEW: Snapshot configuration
}

export interface SnapshotConfig {
  enabled: boolean
  eventsPerSnapshot: number  // Create snapshot every N events (default: 50)
  maxEventsBeforeSnapshot: number  // Force snapshot if events exceed (default: 100)
}

export interface EntitySpec {
  name: string
  schema: any
  sync: SyncConfig
  endpoints: EndpointSpec[]
}

export function parseOpenAPISpec(spec: any): EntitySpec[] {
  const entities: EntitySpec[] = []

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const xSync = pathItem['x-sync']
    if (!xSync) continue

    entities.push({
      name: extractEntityName(path),
      schema: extractSchema(spec, pathItem),
      sync: {
        mode: xSync.mode || 'api',
        events: xSync.events || [],
        notification: xSync.notification || 'polling',
        snapshot: {
          enabled: xSync.snapshot?.enabled ?? true,
          eventsPerSnapshot: xSync.snapshot?.events_per_snapshot ?? 50,
          maxEventsBeforeSnapshot: xSync.snapshot?.max_events ?? 100,
        },
      },
      endpoints: parseEndpoints(pathItem),
    })
  }

  return entities
}
```

#### 4.2 Generate PGlite Event Store with Type-Safe Queries

Using PGlite with generated typed query functions (not raw SQL, not full ORM):

```typescript
// sync-patterns/src/generators/event-store-generator.ts

export function generateEventStore(entities: EntitySpec[]): GeneratedFile[] {
  return [
    {
      path: 'store/db.ts',
      content: `
import { PGlite } from '@electric-sql/pglite'
import { z } from 'zod'

// Initialize PGlite with IndexedDB persistence
export const db = new PGlite('idb://pattern-stack-events')

// Initialize schema
export async function initEventStore(): Promise<void> {
  await db.exec(\`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      hlc_timestamp TEXT NOT NULL,  -- Hybrid Logical Clock
      wall_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id TEXT,
      synced BOOLEAN DEFAULT FALSE,
      server_id TEXT,
      idempotency_key TEXT UNIQUE NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_entity
      ON events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_events_unsynced
      ON events(synced) WHERE synced = FALSE;
    CREATE INDEX IF NOT EXISTS idx_events_hlc
      ON events(entity_type, entity_id, hlc_timestamp);

    -- Snapshots table for materialization optimization
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      state JSONB NOT NULL,
      last_event_id TEXT NOT NULL,
      last_hlc TEXT NOT NULL,
      event_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_entity
      ON snapshots(entity_type, entity_id);
  \`)
}
      `
    },
    {
      path: 'store/eventStore.ts',
      content: `
import { db } from './db'
import { z } from 'zod'
import { HLC } from './hlc'

// ============================================================
// TYPE-SAFE QUERY LAYER (generated from OpenAPI schemas)
// ============================================================

// Event schema with Zod validation
export const LocalEventSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  payload: z.record(z.unknown()),
  hlc_timestamp: z.string(),
  wall_timestamp: z.string(),
  user_id: z.string().uuid().nullable(),
  synced: z.boolean(),
  server_id: z.string().nullable(),
  idempotency_key: z.string(),
})

export type LocalEvent = z.infer<typeof LocalEventSchema>

// Snapshot schema
export const SnapshotSchema = z.object({
  id: z.string().uuid(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  state: z.record(z.unknown()),
  last_event_id: z.string(),
  last_hlc: z.string(),
  event_count: z.number(),
  created_at: z.string(),
})

export type Snapshot = z.infer<typeof SnapshotSchema>

// ============================================================
// TYPED QUERY FUNCTIONS (compile-time safe, runtime validated)
// ============================================================

export const eventQueries = {
  /** Insert a new event */
  async insert(event: Omit<LocalEvent, 'wall_timestamp'>): Promise<LocalEvent> {
    const result = await db.query<LocalEvent>(
      \`INSERT INTO events (id, event_type, entity_type, entity_id, payload,
         hlc_timestamp, user_id, synced, server_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *\`,
      [event.id, event.event_type, event.entity_type, event.entity_id,
       JSON.stringify(event.payload), event.hlc_timestamp, event.user_id,
       event.synced, event.server_id, event.idempotency_key]
    )
    return LocalEventSchema.parse(result.rows[0])
  },

  /** Get events for an entity, starting from optional snapshot */
  async getForEntity(
    entityType: string,
    entityId: string,
    afterHlc?: string
  ): Promise<LocalEvent[]> {
    const query = afterHlc
      ? \`SELECT * FROM events
         WHERE entity_type = $1 AND entity_id = $2 AND hlc_timestamp > $3
         ORDER BY hlc_timestamp\`
      : \`SELECT * FROM events
         WHERE entity_type = $1 AND entity_id = $2
         ORDER BY hlc_timestamp\`

    const params = afterHlc
      ? [entityType, entityId, afterHlc]
      : [entityType, entityId]

    const result = await db.query<LocalEvent>(query, params)
    return result.rows.map(row => LocalEventSchema.parse(row))
  },

  /** Get unsynced events for batch upload */
  async getUnsynced(limit = 100): Promise<LocalEvent[]> {
    const result = await db.query<LocalEvent>(
      \`SELECT * FROM events WHERE synced = FALSE
       ORDER BY hlc_timestamp LIMIT $1\`,
      [limit]
    )
    return result.rows.map(row => LocalEventSchema.parse(row))
  },

  /** Mark events as synced */
  async markSynced(eventIds: string[]): Promise<void> {
    await db.query(
      \`UPDATE events SET synced = TRUE WHERE id = ANY($1)\`,
      [eventIds]
    )
  },

  /** Count events for an entity (for snapshot decision) */
  async countForEntity(entityType: string, entityId: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      \`SELECT COUNT(*) as count FROM events
       WHERE entity_type = $1 AND entity_id = $2\`,
      [entityType, entityId]
    )
    return parseInt(result.rows[0].count, 10)
  },
}

export const snapshotQueries = {
  /** Get snapshot for an entity */
  async get(entityType: string, entityId: string): Promise<Snapshot | null> {
    const result = await db.query<Snapshot>(
      \`SELECT * FROM snapshots WHERE entity_type = $1 AND entity_id = $2\`,
      [entityType, entityId]
    )
    return result.rows[0] ? SnapshotSchema.parse(result.rows[0]) : null
  },

  /** Upsert snapshot */
  async upsert(snapshot: Omit<Snapshot, 'created_at'>): Promise<Snapshot> {
    const result = await db.query<Snapshot>(
      \`INSERT INTO snapshots (id, entity_type, entity_id, state, last_event_id,
         last_hlc, event_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entity_type, entity_id)
       DO UPDATE SET state = $4, last_event_id = $5, last_hlc = $6,
         event_count = $7, created_at = NOW()
       RETURNING *\`,
      [snapshot.id, snapshot.entity_type, snapshot.entity_id,
       JSON.stringify(snapshot.state), snapshot.last_event_id,
       snapshot.last_hlc, snapshot.event_count]
    )
    return SnapshotSchema.parse(result.rows[0])
  },

  /** Delete old events that are covered by snapshot */
  async pruneEvents(entityType: string, entityId: string, beforeHlc: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      \`WITH deleted AS (
         DELETE FROM events
         WHERE entity_type = $1 AND entity_id = $2
           AND hlc_timestamp < $3 AND synced = TRUE
         RETURNING 1
       )
       SELECT COUNT(*) as count FROM deleted\`,
      [entityType, entityId, beforeHlc]
    )
    return parseInt(result.rows[0].count, 10)
  },
}
      `
    },
    {
      path: 'store/hlc.ts',
      content: `
/**
 * Hybrid Logical Clock implementation
 * Provides causally-correct timestamps without requiring synchronized clocks
 */
export class HLC {
  private counter: number = 0
  private lastTime: number = 0

  /** Generate next HLC timestamp */
  now(): string {
    const physicalTime = Date.now()

    if (physicalTime > this.lastTime) {
      this.lastTime = physicalTime
      this.counter = 0
    } else {
      this.counter++
    }

    // Format: {physical_time}.{counter}.{node_id}
    // Lexicographically sortable
    return \`\${this.lastTime.toString().padStart(15, '0')}.\${
      this.counter.toString().padStart(5, '0')
    }.\${this.nodeId}\`
  }

  /** Update clock when receiving remote event */
  receive(remoteHlc: string): void {
    const [remoteTime, remoteCounter] = this.parse(remoteHlc)
    const physicalTime = Date.now()

    if (remoteTime > this.lastTime && remoteTime > physicalTime) {
      this.lastTime = remoteTime
      this.counter = remoteCounter + 1
    } else if (remoteTime === this.lastTime) {
      this.counter = Math.max(this.counter, remoteCounter) + 1
    } else {
      // Local time is ahead, just increment
      if (physicalTime > this.lastTime) {
        this.lastTime = physicalTime
        this.counter = 0
      } else {
        this.counter++
      }
    }
  }

  private parse(hlc: string): [number, number] {
    const [time, counter] = hlc.split('.')
    return [parseInt(time, 10), parseInt(counter, 10)]
  }

  private nodeId = crypto.randomUUID().slice(0, 8)
}

export const hlc = new HLC()
      `
    }
  ]
}
```

#### 4.3 Generate Materializers with Snapshot Support

```typescript
// sync-patterns/src/generators/materializer-generator.ts

export function generateMaterializers(entities: EntitySpec[]): GeneratedFile[] {
  const files: GeneratedFile[] = []

  for (const entity of entities) {
    if (entity.sync.mode !== 'events') continue

    files.push({
      path: `materializers/${entity.name}.ts`,
      content: generateMaterializerCode(entity)
    })
  }

  // Generate shared materializer utilities
  files.push({
    path: 'materializers/utils.ts',
    content: generateMaterializerUtils()
  })

  return files
}

function generateMaterializerUtils(): string {
  return `
import { eventQueries, snapshotQueries, LocalEvent, Snapshot } from '../store/eventStore'

export interface MaterializeOptions {
  /** Create snapshot after this many events */
  snapshotThreshold: number
  /** Force snapshot if events exceed this count */
  forceSnapshotAt: number
}

export const DEFAULT_MATERIALIZE_OPTIONS: MaterializeOptions = {
  snapshotThreshold: 50,
  forceSnapshotAt: 100,
}

/**
 * Base materializer that handles snapshot logic
 */
export async function materializeWithSnapshots<T>(
  entityType: string,
  entityId: string,
  reducer: (state: T | null, event: LocalEvent) => T | null,
  initialState: T | null,
  options: MaterializeOptions = DEFAULT_MATERIALIZE_OPTIONS
): Promise<T | null> {
  // 1. Try to load snapshot
  const snapshot = await snapshotQueries.get(entityType, entityId)

  let state: T | null = snapshot
    ? (snapshot.state as T)
    : initialState

  // 2. Get events since snapshot (or all events if no snapshot)
  const events = await eventQueries.getForEntity(
    entityType,
    entityId,
    snapshot?.last_hlc
  )

  if (events.length === 0 && !snapshot) {
    return null
  }

  // 3. Apply events to state
  for (const event of events) {
    state = reducer(state, event)
  }

  // 4. Maybe create new snapshot
  const totalEvents = (snapshot?.event_count ?? 0) + events.length
  const shouldSnapshot =
    events.length >= options.snapshotThreshold ||
    totalEvents >= options.forceSnapshotAt

  if (shouldSnapshot && state !== null && events.length > 0) {
    const lastEvent = events[events.length - 1]
    await snapshotQueries.upsert({
      id: crypto.randomUUID(),
      entity_type: entityType,
      entity_id: entityId,
      state: state as Record<string, unknown>,
      last_event_id: lastEvent.id,
      last_hlc: lastEvent.hlc_timestamp,
      event_count: totalEvents,
    })

    // Optionally prune old synced events
    if (snapshot) {
      await snapshotQueries.pruneEvents(entityType, entityId, snapshot.last_hlc)
    }
  }

  return state
}
  `
}

function generateMaterializerCode(entity: EntitySpec): string {
  const snapshotConfig = entity.sync.snapshot ?? {
    enabled: true,
    eventsPerSnapshot: 50,
    maxEventsBeforeSnapshot: 100,
  }

  const eventHandlers = entity.sync.events?.map(eventName => `
    case '${entity.name}.${eventName}':
      return handle${capitalize(eventName)}(state, event)
  `).join('\n')

  return `
import { LocalEvent } from '../store/eventStore'
import { materializeWithSnapshots, MaterializeOptions } from './utils'
import { ${entity.name}Schema, ${entity.name} } from '../schemas/${entity.name}.schema'

// Snapshot configuration (from backend Pattern config)
const SNAPSHOT_OPTIONS: MaterializeOptions = {
  snapshotThreshold: ${snapshotConfig.eventsPerSnapshot},
  forceSnapshotAt: ${snapshotConfig.maxEventsBeforeSnapshot},
}

/**
 * Materialize ${entity.name} from event log with automatic snapshot optimization
 */
export async function materialize${entity.name}(id: string): Promise<${entity.name} | null> {
  return materializeWithSnapshots<${entity.name}>(
    '${entity.name}',
    id,
    ${entity.name.toLowerCase()}Reducer,
    null,
    SNAPSHOT_OPTIONS
  )
}

/**
 * Pure reducer: (state, event) => newState
 */
function ${entity.name.toLowerCase()}Reducer(
  state: ${entity.name} | null,
  event: LocalEvent
): ${entity.name} | null {
  switch (event.event_type) {
    ${eventHandlers}
    default:
      return state
  }
}

// Event handlers (generated from sync_events)
${generateEventHandlers(entity)}
  `
}
```

#### 4.4 Generate Sync Engine with Leader Election

```typescript
// sync-patterns/src/generators/sync-engine-generator.ts

export function generateSyncEngine(): GeneratedFile {
  return {
    path: 'store/syncEngine.ts',
    content: `
import { eventQueries } from './eventStore'
import { apiClient } from '../client'
import { hlc } from './hlc'

/**
 * Leader election using BroadcastChannel + Web Locks API
 * Only one tab syncs at a time to prevent duplicate API calls
 */
class LeaderElection {
  private channel: BroadcastChannel
  private isLeader = false
  private lockPromise: Promise<void> | null = null

  constructor(private name: string) {
    this.channel = new BroadcastChannel(\`sync-leader-\${name}\`)
  }

  async acquireLeadership(): Promise<boolean> {
    // Use Web Locks API for cross-tab coordination
    if (!navigator.locks) {
      // Fallback: assume leader if no Web Locks support
      this.isLeader = true
      return true
    }

    try {
      // Try to acquire lock without waiting
      const result = await navigator.locks.request(
        \`sync-leader-\${this.name}\`,
        { ifAvailable: true },
        async (lock) => {
          if (lock) {
            this.isLeader = true
            // Hold lock until page unloads
            return new Promise(() => {}) // Never resolves
          }
          return false
        }
      )
      return this.isLeader
    } catch {
      return false
    }
  }

  get amLeader(): boolean {
    return this.isLeader
  }
}

class SyncEngine {
  private syncing = false
  private syncTimeout: number | null = null
  private leader = new LeaderElection('pattern-stack')
  private retryDelay = 1000
  private maxRetryDelay = 30000
  private onRejection?: (event: any, reason: string) => void

  async initialize(): Promise<void> {
    await this.leader.acquireLeadership()

    // Listen for online status
    window.addEventListener('online', () => this.scheduleSync(0))
    window.addEventListener('offline', () => this.cancelSync())

    // Initial sync
    if (navigator.onLine) {
      this.scheduleSync(100)
    }
  }

  /** Register handler for rejected events */
  onEventRejected(handler: (event: any, reason: string) => void): void {
    this.onRejection = handler
  }

  scheduleSync(delay = 100): void {
    if (!this.leader.amLeader) return

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
    }
    this.syncTimeout = window.setTimeout(() => this.sync(), delay)
  }

  cancelSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout)
      this.syncTimeout = null
    }
  }

  async sync(): Promise<void> {
    if (this.syncing || !navigator.onLine || !this.leader.amLeader) {
      return
    }

    this.syncing = true

    try {
      const unsynced = await eventQueries.getUnsynced(50)

      if (unsynced.length === 0) {
        this.retryDelay = 1000
        return
      }

      const response = await apiClient.postEventsBatch({
        events: unsynced.map(e => ({
          id: e.id,
          event_type: e.event_type,
          entity_type: e.entity_type,
          entity_id: e.entity_id,
          payload: e.payload,
          timestamp: e.hlc_timestamp,
          user_id: e.user_id,
          idempotency_key: e.idempotency_key,
        }))
      })

      // Mark accepted events as synced
      if (response.accepted.length > 0) {
        await eventQueries.markSynced(response.accepted)
      }

      // Handle rejected events
      if (response.rejected.length > 0) {
        for (const rejection of response.rejected) {
          const event = unsynced.find(e => e.id === rejection.id)
          if (event && this.onRejection) {
            this.onRejection(event, rejection.reason)
          }
        }
      }

      // Reset retry delay on success
      this.retryDelay = 1000

      // If there were more events, schedule another sync
      if (unsynced.length >= 50) {
        this.scheduleSync(100)
      }

    } catch (error) {
      console.error('[SyncEngine] Sync failed:', error)

      // Exponential backoff
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay)
      this.scheduleSync(this.retryDelay)

    } finally {
      this.syncing = false
    }
  }

  /** Receive events from server (via WebSocket/Electric/polling) */
  async receiveEvents(events: Array<{
    id: string
    event_type: string
    entity_type: string
    entity_id: string
    payload: Record<string, unknown>
    timestamp: string
    user_id: string | null
    idempotency_key: string
  }>): Promise<void> {
    for (const event of events) {
      // Update our HLC from remote timestamp
      hlc.receive(event.timestamp)

      // Check if we already have this event
      const existing = await eventQueries.getByIdempotencyKey?.(event.idempotency_key)

      if (existing) {
        // Update with server confirmation
        await eventQueries.markSynced([existing.id])
      } else {
        // New event from another client
        await eventQueries.insert({
          id: crypto.randomUUID(),
          event_type: event.event_type,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          payload: event.payload,
          hlc_timestamp: event.timestamp,
          user_id: event.user_id,
          synced: true,
          server_id: event.id,
          idempotency_key: event.idempotency_key,
        })
      }
    }
  }
}

export const syncEngine = new SyncEngine()
    `
  }
}
```

#### 4.5 Generate React Hooks

```typescript
// sync-patterns/src/generators/hook-generator.ts

export function generateHooks(entities: EntitySpec[]): GeneratedFile[] {
  const files: GeneratedFile[] = []

  for (const entity of entities) {
    if (entity.sync.mode !== 'events') continue

    files.push({
      path: `hooks/use${entity.name}.ts`,
      content: generateHookCode(entity)
    })
  }

  // Generate sync status hook
  files.push({
    path: 'hooks/useSyncStatus.ts',
    content: generateSyncStatusHook()
  })

  return files
}

function generateSyncStatusHook(): string {
  return `
import { useState, useEffect } from 'react'
import { eventQueries } from '../store/eventStore'
import { syncEngine } from '../store/syncEngine'

export interface SyncStatus {
  isOnline: boolean
  pendingCount: number
  lastSyncedAt: Date | null
  rejections: Array<{ event: any; reason: string }>
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    pendingCount: 0,
    lastSyncedAt: null,
    rejections: [],
  })

  useEffect(() => {
    const updatePending = async () => {
      const unsynced = await eventQueries.getUnsynced(1000)
      setStatus(s => ({ ...s, pendingCount: unsynced.length }))
    }

    // Listen for rejections
    syncEngine.onEventRejected((event, reason) => {
      setStatus(s => ({
        ...s,
        rejections: [...s.rejections, { event, reason }],
      }))
    })

    // Poll pending count
    const interval = setInterval(updatePending, 1000)
    updatePending()

    // Online/offline
    const handleOnline = () => setStatus(s => ({ ...s, isOnline: true }))
    const handleOffline = () => setStatus(s => ({ ...s, isOnline: false }))
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return status
}
  `
}

function generateHookCode(entity: EntitySpec): string {
  const mutations = entity.sync.events?.map(eventName => `
  const ${eventName} = useCallback(async (
    ${generateEventParams(entity, eventName)}
  ) => {
    const event = await recordEvent({
      event_type: '${entity.name}.${eventName}',
      entity_type: '${entity.name}',
      entity_id: id,
      payload: ${generateEventPayload(entity, eventName)},
      user_id: getCurrentUserId(),
    })

    // Trigger re-materialization
    invalidate()

    return event
  }, [id, invalidate])
  `).join('\n')

  return `
import { useState, useEffect, useCallback } from 'react'
import { eventQueries } from '../store/eventStore'
import { hlc } from '../store/hlc'
import { syncEngine } from '../store/syncEngine'
import { materialize${entity.name} } from '../materializers/${entity.name}'
import { ${entity.name}Schema, ${entity.name} } from '../schemas/${entity.name}.schema'

async function recordEvent(params: {
  event_type: string
  entity_type: string
  entity_id: string
  payload: Record<string, unknown>
  user_id: string | null
}) {
  const event = await eventQueries.insert({
    id: crypto.randomUUID(),
    ...params,
    hlc_timestamp: hlc.now(),
    synced: false,
    server_id: null,
    idempotency_key: crypto.randomUUID(),
  })

  syncEngine.scheduleSync()
  return event
}

export function use${entity.name}(id: string) {
  const [data, setData] = useState<${entity.name} | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [version, setVersion] = useState(0)

  const invalidate = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    setIsLoading(true)
    materialize${entity.name}(id)
      .then(setData)
      .finally(() => setIsLoading(false))
  }, [id, version])

  return { data, isLoading, invalidate }
}

export function use${entity.name}Mutations(id: string) {
  const [, setVersion] = useState(0)
  const invalidate = useCallback(() => setVersion(v => v + 1), [])

  ${mutations}

  return {
    ${entity.sync.events?.join(',\n    ')}
  }
}
  `
}
```

### Generated File Structure

```
src/generated/
├── events/
│   └── {entity}.events.ts        # Event type definitions
├── store/
│   ├── db.ts                     # PGlite initialization
│   ├── eventStore.ts             # Typed query functions
│   ├── hlc.ts                    # Hybrid Logical Clock
│   └── syncEngine.ts             # Background sync + leader election
├── materializers/
│   ├── utils.ts                  # Snapshot utilities
│   └── {entity}.ts               # Entity materializer with snapshots
├── hooks/
│   ├── useSyncStatus.ts          # Sync status + rejections
│   └── use{Entity}.ts            # React hooks
└── client/
    └── methods.ts                # API client (includes event endpoints)
```

### Snapshot Configuration

Snapshot behavior is configured per-entity in the backend Pattern class and flows through to frontend:

```python
# Backend: sales-patterns/app/features/orders/models.py
class Order(EventPattern):
    class Pattern:
        entity = "order"
        sync_mode = "events"
        sync_events = ["created", "item_added", "item_removed", "state_changed"]

        # Snapshot configuration (abstracted)
        sync_snapshot = {
            "enabled": True,
            "events_per_snapshot": 50,   # Create snapshot every 50 events
            "max_events": 100,            # Force snapshot at 100 events
        }
```

```yaml
# OpenAPI output
/orders:
  x-sync:
    mode: events
    events: [created, item_added, item_removed, state_changed]
    snapshot:
      enabled: true
      events_per_snapshot: 50
      max_events: 100
```

```typescript
// Generated frontend uses this config
const SNAPSHOT_OPTIONS: MaterializeOptions = {
  snapshotThreshold: 50,
  forceSnapshotAt: 100,
}
```

## Phase 5: Integration & Testing

**Goal**: Validate end-to-end functionality with real-world scenario.

### Dependencies
- All previous phases

### Tasks

#### 5.1 Create Test Application

Set up sales-patterns example with Order entity:

```python
# sales-patterns/app/features/orders/models.py

from pattern_stack.atoms.patterns.event import EventPattern
from pattern_stack.atoms.patterns.fields import Field

class Order(EventPattern):
    __tablename__ = "orders"

    class Pattern:
        entity = "order"
        sync_mode = "events"
        sync_events = [
            "created",
            "item_added",
            "item_removed",
            "state_changed",
        ]
        sync_notification = "redis"

    table_number = Field(int, required=True)
    status = Field(str, default="open")
    items = Field(JSON, default=list)
```

#### 5.2 Generate Frontend Code

Run sync-patterns generator:

```bash
cd sales-patterns
sync-patterns generate \
  http://localhost:8000/openapi.json \
  --output ../frontend/src/generated
```

#### 5.3 Multi-Device Sync Test

Test scenario:
1. Device A (offline): Create order, add 3 items
2. Device B (online): Create different order
3. Device A reconnects
4. Verify both devices see both orders
5. Verify timestamps preserved correctly

#### 5.4 Offline Survival Test

Test scenario:
1. Create order with 5 items
2. Close browser
3. Open browser (new session)
4. Verify order still exists with all items
5. Add more items offline
6. Reconnect and verify sync

#### 5.5 Performance Benchmarks

Measure:
- UI response time (< 5ms target)
- Event write to IndexedDB (< 2ms target)
- Materialization time for 100 events (< 50ms target)
- Sync throughput (events/second)

## File Structure Overview

### Backend Changes

```
backend-patterns/
├── pattern_stack/atoms/
│   ├── patterns/
│   │   ├── base.py                          # Modified: Extension orchestration
│   │   └── extensions/
│   │       └── sync.py                      # Event emission (uses extension system)
│   ├── notifications/                       # New subsystem
│   │   ├── __init__.py
│   │   ├── base.py                          # NotificationBackend interface
│   │   ├── backends/
│   │   │   ├── __init__.py
│   │   │   ├── redis.py                     # Redis pub/sub
│   │   │   ├── memory.py                    # In-memory (testing)
│   │   │   └── noop.py                      # Disabled
│   │   ├── factory.py                       # Backend creation
│   │   └── types.py                         # Shared types
│   ├── api/routers/
│   │   └── events.py                        # New: Event batch router factory
│   ├── app/
│   │   ├── discovery.py                     # Modified: Add discover_syncable_models
│   │   └── factory.py                       # Modified: Auto-register events router
│   └── config/
│       └── settings.py                      # Modified: Add NOTIFICATION_BACKEND
└── tests/
    └── notifications/                       # New test suite
        ├── test_redis_backend.py
        ├── test_memory_backend.py
        └── test_factory.py
```

### Frontend Changes

```
sync-patterns/
├── src/
│   ├── parsers/
│   │   └── openapi-parser.ts                # Modified: Parse x-sync.events + snapshot config
│   └── generators/
│       ├── event-store-generator.ts         # New: PGlite database + typed queries
│       ├── hlc-generator.ts                 # New: Hybrid Logical Clock
│       ├── materializer-generator.ts        # New: Event → State with snapshots
│       ├── sync-engine-generator.ts         # New: Background sync + leader election
│       └── hook-generator.ts                # Modified: Event-based hooks
└── templates/
    ├── db.ts.hbs                            # PGlite initialization
    ├── eventStore.ts.hbs                    # Typed query functions
    ├── hlc.ts.hbs                           # HLC implementation
    ├── materializer.ts.hbs                  # Materializer with snapshots
    └── syncEngine.ts.hbs                    # Sync engine + leader election
```

### Generated Output

```
{project}/frontend/src/generated/
├── events/
│   └── {entity}.events.ts                   # Event type definitions
├── store/
│   ├── db.ts                                # PGlite initialization
│   ├── eventStore.ts                        # Typed query functions (Zod validated)
│   ├── hlc.ts                               # Hybrid Logical Clock
│   └── syncEngine.ts                        # Background sync + leader election
├── materializers/
│   ├── utils.ts                             # Snapshot utilities
│   └── {entity}.ts                          # Entity materializer with snapshots
├── hooks/
│   ├── useSyncStatus.ts                     # Sync status + rejections
│   └── use{Entity}.ts                       # React integration
└── client/
    └── methods.ts                           # API client (includes /events/batch)
```

## Migration Guide

### For Existing Applications

#### Step 1: Update Dependencies

```bash
# Backend
cd backend-patterns
uv sync --upgrade

# Frontend
cd sync-patterns
npm install
```

#### Step 2: Opt-in Per Entity

Choose entities to migrate (start with one):

```python
# Before
class Order(EventPattern):
    class Pattern:
        entity = "order"
        sync_mode = "offline"  # Old system

# After
class Order(EventPattern):
    class Pattern:
        entity = "order"
        sync_mode = "events"   # New system
        sync_events = [
            "created",
            "item_added",
        ]
```

#### Step 3: Regenerate Frontend

```bash
sync-patterns generate openapi.json --output src/generated
```

#### Step 4: Update Components

```typescript
// Before (TanStack Query)
const { data: order } = useQuery(['order', id], () => fetchOrder(id))

// After (Event-sourced)
const { data: order } = useOrder(id)
const { addItem } = useOrderMutations()
```

#### Step 5: Test & Verify

- Check offline functionality
- Verify multi-device sync
- Confirm event history

### Non-Breaking Changes

Phases 1-4 add new features without removing existing functionality:
- Old sync modes continue to work
- New `sync_mode="events"` is opt-in
- Existing tests pass unchanged

### Deprecated Features

Once migration is complete, these will be deprecated:
- `sync_mode="offline"` (replaced by `"events"`)
- `local_first: bool` config (replaced by `sync_mode`)
- TanStack DB for sync (still useful for other purposes)

## Decisions Made

### ✅ 1. Conflict Resolution Strategy

**Decision**: Use Hybrid Logical Clocks (HLC) for causally-correct ordering.

**Why HLC over wall-clock timestamps**:
- HLCs are monotonically increasing (no clock drift issues)
- Preserve causality (if A happened-before B, HLC(A) < HLC(B))
- No need for synchronized clocks across devices
- Lexicographically sortable (simple string comparison)

**Implementation**: Phase 4 includes HLC implementation in `store/hlc.ts`.

### ✅ 2. Event Retention & Compaction

**Decision**: Implement snapshot compaction with configurable thresholds per entity.

**Configuration** (in backend Pattern class):
```python
sync_snapshot = {
    "enabled": True,
    "events_per_snapshot": 50,   # Create snapshot every 50 events
    "max_events": 100,            # Force snapshot at 100 events
}
```

**Behavior**:
1. Materialize from snapshot + recent events (not from genesis)
2. Auto-create snapshots when thresholds exceeded
3. Prune old synced events after snapshot

**Implementation**: Phase 4 includes `materializeWithSnapshots()` utility.

### ✅ 3. Local Database Selection

**Decision**: Use PGlite (Postgres WASM) with type-safe generated query functions.

**Why PGlite**:
- Same SQL as backend (Postgres everywhere)
- Real SQL features (CTEs, window functions, JSONB)
- Smaller than alternatives (~1.4MB)
- Consistent with ADR-005

**Type Safety Approach** (not raw SQL, not full ORM):
- Generate typed query functions from OpenAPI schemas
- Zod validation on all query results
- Parameterized queries (no string concatenation)
- Composable for complex operations

### ✅ 4. Multi-Tab Coordination

**Decision**: Use Web Locks API for leader election.

**Behavior**:
- Only leader tab runs sync engine
- Other tabs still read/write to PGlite
- Automatic leadership transfer on tab close

**Implementation**: Phase 4 includes `LeaderElection` class in sync engine.

---

### ✅ 5. Multi-Tenant Event Isolation

**Decision**: Add `tenant_id` to event schema with query-level filtering. Defer per-tenant database isolation for single-tenancy offerings.

**Implementation**:
- Add `tenant_id` column to events table
- Filter all queries by current tenant
- Namespace notification channels: `sync:{tenant}:{entity}`

**Rationale**: Query-level filtering is simpler and sufficient for multi-tenant SaaS. Per-tenant PGlite databases can be added later for enterprise single-tenancy deployments.

### ✅ 6. Error Recovery UX

**Decision**: Use snackbar/toast notifications for sync errors.

**Implementation**:
- `useSyncStatus()` exposes `rejections` array
- App renders snackbar for each rejection
- Include retry/discard actions in snackbar

**Example integration**:
```typescript
const { rejections } = useSyncStatus()

useEffect(() => {
  for (const { event, reason } of rejections) {
    toast.error(`Sync failed: ${reason}`, {
      action: {
        label: 'Retry',
        onClick: () => syncEngine.retry(event.id)
      }
    })
  }
}, [rejections])
```

**Note**: Exact UX to be refined during Phase 5 integration testing.

### ✅ 7. Schema Evolution

**Decision**: Add `schema_version` field to events. Support backward compatibility.

**Implementation**:
- Add `schema_version: number` to LocalEvent schema (default: 1)
- Materializers handle old versions via migration functions
- Server accepts old schemas, responds with current schema

**Migration pattern**:
```typescript
function migrateEvent(event: LocalEvent): LocalEvent {
  if (event.schema_version === 1) {
    // Transform v1 → v2
    return { ...event, payload: migratePayloadV1toV2(event.payload), schema_version: 2 }
  }
  return event
}
```

### ✅ 8. Notification Backend Selection

**Decision**: Implement Memory + Redis backends in Phase 1. Add ElectricSQL as fast follow.

**Implementation order**:
1. **Phase 1**: Memory backend (testing) + Redis backend (production)
2. **Fast follow**: ElectricSQL streaming backend

**Comparison**:

| Backend | Pros | Cons | Best For |
|---------|------|------|----------|
| Redis pub/sub | Fast, simple, proven | Requires Redis | Traditional deployments |
| ElectricSQL | Postgres native, streaming | Complex setup | Postgres-centric stacks |
| WebSocket | Native support, standard | Custom protocol | Custom requirements |
| Polling | No infra, works anywhere | Latency, inefficient | Simple deployments |

**Defaults**:
- Development: Memory backend
- Production: Redis pub/sub
- Future: ElectricSQL (fast follow after Phase 1)

---

## Open Questions

*All major architectural decisions have been made. Remaining questions are implementation details that will be resolved during development.*

## Timeline Breakdown

### Phase Dependencies

```
Phase 1: Notification Subsystem
├─ No dependencies
└─ Outputs: Memory + Redis notification backends

Phase 2: Sync Extension (Pragmatic)
├─ Depends on: Phase 1 (notification subsystem)
├─ NO extension architecture needed (direct __init_subclass__)
└─ Outputs: Event emission, discovery

Phase 3: Router Generation
├─ Depends on: Phase 2 (discovery function)
└─ Outputs: /events/batch endpoint

Phase 4: Frontend Generation
├─ Depends on: Phase 3 (API endpoints)
└─ Outputs: PGlite store, HLC, snapshots, typed queries, React hooks

Phase 5: Integration Testing
├─ Depends on: All phases
└─ Outputs: Validated system, refined error UX
```

### Parallel Work Opportunities

**Can run in parallel:**
- Phase 1 (notifications) + Phase 4 (frontend generator updates)
- Phase 2 tests + Phase 3 implementation

**Must be sequential:**
- Phase 2 requires Phase 1 complete
- Phase 3 requires Phase 2 complete
- Phase 5 requires Phases 3 & 4 complete

### Risk Mitigation

**High Risk Areas:**
1. ~~Event ordering conflicts (Phase 5)~~ → **Mitigated**: Using HLC for causal ordering
2. Browser storage limits (Phase 4) - IndexedDB quotas
   - Mitigation: Snapshot compaction prunes old events automatically

**Low Risk Areas:**
- Notification subsystem (follows proven pattern)
- Router generation (simple FastAPI routes)
- Event store (PGlite is mature, well-tested)

## Success Metrics

### Functional Requirements

- [ ] Mutations update UI in < 5ms
- [ ] Events persist across browser refresh
- [ ] Offline mode works for 1+ hour
- [ ] Multi-device sync maintains consistency
- [ ] Complete event audit trail available
- [ ] Zero data loss on network failures

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| UI response time | < 5ms | Click to state update |
| Event write (IndexedDB) | < 2ms | recordEvent() duration |
| Materialization (100 events) | < 50ms | materialize*() duration |
| Sync throughput | > 100 events/sec | Background sync rate |
| Event storage overhead | < 10MB per 1000 events | IndexedDB usage |

### Code Quality

- [ ] Test coverage > 80% (backend)
- [ ] Test coverage > 70% (frontend)
- [ ] Zero TypeScript errors
- [ ] All linting rules pass
- [ ] Documentation complete

### Developer Experience

- [ ] Single command to generate client
- [ ] Type-safe event definitions
- [ ] Clear error messages
- [ ] Migration guide available
- [ ] Example app demonstrates all features

## Next Steps

1. **Review this plan** with team
2. **Prioritize open questions** - which need decisions before starting?
3. **Assign phases** to team members
4. **Set up tracking** - Linear issues for each phase
5. **Create branch strategy** - feature branches per phase
6. **Begin Phase 1** - Notification subsystem

## References

- [SYNC-008 Spec](../specs/SYNC-008-event-sourced-sync-architecture.md) - Full specification
- [Pattern Stack Backend](https://github.com/pattern-stack/backend-patterns)
- [Cache Subsystem](../../backend-patterns/pattern_stack/atoms/cache/) - Reference for notification subsystem
- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Dexie.js](https://dexie.org/) - IndexedDB wrapper
