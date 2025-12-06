# Event-Sourced Sync Architecture - Implementation Plan

> **Status**: Planning
> **Author**: Claude + Dug
> **Date**: 2025-12-06
> **Spec**: [SYNC-008 Event-Sourced Sync Architecture](../specs/SYNC-008-event-sourced-sync-architecture.md)

## Executive Summary

This implementation plan consolidates the event-sourced sync architecture into a concrete, actionable roadmap. We are replacing the current 3-mode sync system (api/realtime/offline) with a unified event-sourced architecture where all mutations become timestamped events persisting locally and syncing in the background.

### What We're Building

A single, unified sync paradigm that:
- Records all mutations as immutable events in IndexedDB
- Derives current state by materializing event logs
- Syncs events to server in background (doesn't block UI)
- Broadcasts changes to other clients via pluggable notification backends
- Works completely offline with proper event ordering on reconnect

### Key Architectural Decisions

1. **Pattern-driven**: Configuration in Pattern class drives all code generation
2. **Extension-based**: BasePattern delegates to internal extensions (no mixins)
3. **Subsystem pattern**: Notification subsystem follows cache/storage pattern
4. **Auto-discovery**: Framework discovers models with `sync_mode="events"` and generates endpoints
5. **Local-first**: Events persist in IndexedDB before network operation

### Benefits Over Current System

| Current (3 modes) | Event-Sourced (1 paradigm) |
|-------------------|----------------------------|
| TanStack Query (api) | Dexie event store |
| TanStack DB (realtime) | Same Dexie store |
| RxDB (offline) | Same Dexie store |
| Different code paths | Single code path |
| No offline state persistence | Full state persists |
| No audit trail | Complete event history |
| Complex generator | Simpler generator |

## Prerequisites

This implementation assumes the BasePattern extension architecture is available. The extension system allows BasePattern to delegate specific functionality (field processing, change tracking, sync events) to modular extensions that can be enabled/configured per pattern.

**What we need from the extension system**:
- `PatternExtension` base class with `setup_class()` lifecycle hook
- Extension registration via `BasePattern.__init_subclass__`
- Ability to add class methods and event listeners from extensions

The `SyncExtension` will plug into this architecture to provide event emission and notification capabilities without modifying BasePattern core logic.

See `/Users/dug/pattern-stack-workspace/backend-patterns/docs/plans/BASEPATTERN-EXTENSION-REFACTOR-OUTLINE.md` for the planned extension architecture.

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

**Goal**: Generate TypeScript event store, materializers, sync engine, and React hooks.

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
      },
      endpoints: parseEndpoints(pathItem),
    })
  }

  return entities
}
```

#### 4.2 Generate Event Store

```typescript
// sync-patterns/src/generators/event-store-generator.ts

export function generateEventStore(entities: EntitySpec[]): GeneratedFile[] {
  return [
    {
      path: 'store/eventStore.ts',
      content: `
import Dexie from 'dexie'

export interface LocalEvent {
  id: string
  event_type: string
  entity_type: string
  entity_id: string
  payload: Record<string, any>
  timestamp: number
  user_id: string | null
  synced: boolean
  server_id: string | null
  idempotency_key: string
}

class EventStoreDB extends Dexie {
  events!: Dexie.Table<LocalEvent, string>

  constructor() {
    super('pattern-stack-events')

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

// Core operations...
export async function recordEvent(/* ... */): Promise<LocalEvent> {
  // Implementation
}

export async function getEventsForEntity(/* ... */): Promise<LocalEvent[]> {
  // Implementation
}
      `
    }
  ]
}
```

#### 4.3 Generate Materializers

For each entity with `sync_mode='events'`:

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

  return files
}

function generateMaterializerCode(entity: EntitySpec): string {
  const eventHandlers = entity.sync.events?.map(eventName => `
    case '${entity.name}.${eventName}':
      return handle${capitalize(eventName)}(${entity.name.toLowerCase()}, event)
  `).join('\n')

  return `
import { LocalEvent, getEventsForEntity } from '../store/eventStore'
import { ${entity.name} } from '../schemas/${entity.name}.schema'

export async function materialize${entity.name}(
  id: string
): Promise<${entity.name} | null> {
  const events = await getEventsForEntity('${entity.name}', id)

  if (events.length === 0) return null

  return events.reduce<${entity.name} | null>((state, event) => {
    switch (event.event_type) {
      ${eventHandlers}
      default:
        return state
    }
  }, null)
}

// Event handlers...
${generateEventHandlers(entity)}
  `
}
```

#### 4.4 Generate Sync Engine

```typescript
// sync-patterns/src/generators/sync-engine-generator.ts

export function generateSyncEngine(): GeneratedFile {
  return {
    path: 'store/syncEngine.ts',
    content: `
import { getUnsyncedEvents, markEventsSynced } from './eventStore'
import { apiClient } from '../client'

class SyncEngine {
  private syncing = false
  private syncTimeout: number | null = null

  async sync(): Promise<void> {
    if (this.syncing || !navigator.onLine) return

    this.syncing = true

    try {
      const unsynced = await getUnsyncedEvents()
      if (unsynced.length === 0) return

      const response = await apiClient.postEventsBatch({
        events: unsynced
      })

      if (response.accepted.length > 0) {
        await markEventsSynced(response.accepted)
      }

      // Handle rejected events...
    } finally {
      this.syncing = false
    }
  }

  scheduleSync(delay = 100): void {
    // Implementation...
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

  return files
}

function generateHookCode(entity: EntitySpec): string {
  const mutations = entity.sync.events?.map(eventName => `
  const ${eventName} = useCallback(async (
    ${generateEventParams(entity, eventName)}
  ) => {
    await recordEvent({
      event_type: '${entity.name}.${eventName}',
      entity_type: '${entity.name}',
      entity_id: id,
      payload: ${generateEventPayload(entity, eventName)},
      user_id: getCurrentUserId(),
    })
  }, [])
  `).join('\n')

  return `
import { useState, useEffect, useCallback } from 'react'
import { recordEvent, eventStore } from '../store/eventStore'
import { materialize${entity.name} } from '../materializers/${entity.name}'

export function use${entity.name}(id: string) {
  const [data, setData] = useState<${entity.name} | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    materialize${entity.name}(id)
      .then(setData)
      .finally(() => setIsLoading(false))

    // Subscribe to changes...
  }, [id])

  return { data, isLoading }
}

export function use${entity.name}Mutations() {
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
│   ├── eventStore.ts             # Dexie database
│   └── syncEngine.ts             # Background sync
├── materializers/
│   └── {entity}.ts               # Event → State
├── hooks/
│   └── use{Entity}.ts            # React hooks
└── client/
    └── methods.ts                # API client (includes event endpoints)
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
│   │   └── openapi-parser.ts                # Modified: Parse x-sync.events
│   └── generators/
│       ├── event-store-generator.ts         # New: Dexie database
│       ├── materializer-generator.ts        # New: Event → State
│       ├── sync-engine-generator.ts         # New: Background sync
│       └── hook-generator.ts                # Modified: Event-based hooks
└── templates/
    ├── eventStore.ts.hbs                    # Dexie template
    ├── materializer.ts.hbs                  # Materializer template
    └── syncEngine.ts.hbs                    # Sync engine template
```

### Generated Output

```
{project}/frontend/src/generated/
├── events/
│   └── {entity}.events.ts                   # Event type definitions
├── store/
│   ├── eventStore.ts                        # Dexie database
│   └── syncEngine.ts                        # Background sync
├── materializers/
│   └── {entity}.ts                          # Event → State conversion
├── hooks/
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

## Open Questions

### 1. Conflict Resolution Strategy

**Question**: How do we handle conflicting events from different devices?

**Options**:
- Last-write-wins (timestamp-based)
- Vector clocks for causal ordering
- Custom merge functions per event type
- Operational transforms (complex)

**Recommendation**: Start with last-write-wins. Add custom merge handlers for specific entities if needed (e.g., collaborative editing).

**Decision needed**: Phase 2

### 2. Event Retention & Compaction

**Question**: How long should events be kept in IndexedDB?

**Considerations**:
- Device storage limits (especially mobile)
- Audit trail requirements
- Query performance over large event logs

**Options**:
- Keep 7 days, older events fetch from server on demand
- Snapshot compaction (periodically replace N events with single state snapshot)
- Configurable retention per entity type

**Recommendation**: 7-day default with configurable retention. Implement snapshot compaction in future iteration.

**Decision needed**: Phase 4

### 3. Multi-Tenant Event Isolation

**Question**: How do we prevent tenant A from seeing tenant B's events?

**Considerations**:
- Notification channels need tenant filtering
- Electric shapes need tenant predicates
- Event store queries need tenant scoping

**Options**:
- Add `tenant_id` to event schema
- Namespace channels by tenant: `sync:order:tenant_123`
- Filter in Electric shape definitions

**Recommendation**: Add `tenant_id` to LocalEvent and ClientEvent. Filter all queries by tenant. Namespace notification channels.

**Decision needed**: Phase 2 (backend) and Phase 4 (frontend)

### 4. Error Recovery & Retry

**Question**: What happens when event application fails on server?

**Scenarios**:
- Validation error (bad payload)
- Business rule violation
- Database constraint failure
- Network timeout

**Options**:
- Retry indefinitely with backoff
- Move to dead-letter queue after N retries
- Surface errors in UI for manual resolution
- Rollback local event (breaking optimistic UI)

**Recommendation**:
- Validation/business errors: reject immediately, show in UI
- Transient errors: retry with exponential backoff
- After 3 retries: surface in UI with retry/discard options

**Decision needed**: Phase 3

### 5. Schema Evolution

**Question**: How do we handle event schema changes between versions?

**Scenarios**:
- Client with old code receives new event format
- Server receives old event format from outdated client
- Event stored before schema change needs materialization

**Options**:
- Version events (e.g., `order.item_added.v2`)
- Transform events on read (migrate old format to new)
- Strict versioning (reject mismatched versions)
- Schema registry with compatibility rules

**Recommendation**: Add `schema_version` to events. Support backward compatibility (new code reads old events). Provide migration tools.

**Decision needed**: Phase 4

### 6. WebSocket vs ElectricSQL vs Polling

**Question**: Which notification backend should be the default?

**Comparison**:

| Backend | Pros | Cons | Best For |
|---------|------|------|----------|
| Redis pub/sub | Fast, simple, proven | Requires Redis | Traditional deployments |
| ElectricSQL | Postgres native, streaming | Complex setup | Postgres-centric stacks |
| WebSocket | Native support, standard | Custom protocol | Custom requirements |
| Polling | No infra, works anywhere | Latency, inefficient | Simple deployments |

**Recommendation**:
- Development: Memory backend
- Production default: Redis pub/sub
- Postgres shops: ElectricSQL
- Fallback: Polling (no-push scenarios)

**Decision needed**: Phase 1

## Timeline Breakdown

### Phase Dependencies

```
Phase 1: Notification Subsystem
├─ No dependencies
└─ Outputs: Notification backends

Phase 2: Sync Extension
├─ Depends on: Extension architecture (prerequisite)
├─ Depends on: Phase 1 (notification subsystem)
└─ Outputs: Event emission, discovery

Phase 3: Router Generation
├─ Depends on: Phase 2 (discovery function)
└─ Outputs: /events/batch endpoint

Phase 4: Frontend Generation
├─ Depends on: Phase 3 (API endpoints)
└─ Outputs: TypeScript event store, hooks

Phase 5: Integration Testing
├─ Depends on: All phases
└─ Outputs: Validated system
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
1. Event ordering conflicts (Phase 5) - distributed systems problem
   - Mitigation: Start with simple timestamp ordering, add complexity if needed
2. Browser storage limits (Phase 4) - IndexedDB quotas
   - Mitigation: Implement retention policy, monitoring

**Low Risk Areas:**
- Notification subsystem (follows proven pattern)
- Router generation (simple FastAPI routes)
- Event store (Dexie is mature, well-tested)

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
