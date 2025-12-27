# SPEC: Broadcast + Optimistic Sync Architecture

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-012 |
| **Title** | Broadcast + Optimistic Sync Architecture |
| **Status** | In Progress |
| **Created** | 2025-12-26 |
| **Supersedes** | SYNC-009 (Electric + Broadcast), SYNC-008 (Event-Sourced) |
| **Depends On** | [ADR-001](../adr/001-sync-stack-selection.md) (amended) |

---

## Executive Summary

This specification defines a **simplified sync architecture** using TanStack Query for data fetching with optimistic mutations, and backend-patterns Broadcast for real-time cross-client cache invalidation.

**We are NOT building Electric/PGlite integration at this time.** Offline support is deferred until a concrete requirement emerges.

### Key Insight

Optimistic updates provide instant UI feedback. Broadcast provides cross-client coordination. Together they deliver Linear/Notion-level snappiness without the complexity of a full sync engine.

### What We're Building

1. **Optimistic mutations** - UI updates instantly, API confirms in background
2. **Broadcast invalidation** - "Something changed" signals via WebSocket
3. **TanStack Query caching** - In-memory cache with automatic refetch
4. **Generated mutation hooks** - Optimistic update logic generated from OpenAPI

### What We're NOT Building (Deferred)

- Electric sync engine
- PGlite local database
- Offline persistence
- **Client-side event store** (backend SystemEvent is authoritative)
- Custom conflict resolution

### Relationship to Backend Event System

Pattern Stack's backend already has event infrastructure:

| Component | Location | Purpose |
|-----------|----------|---------|
| **EventPattern** | backend-patterns | State machine for entities (Order, Ticket, etc.) |
| **SystemEvent** | backend-patterns | Audit log of all changes in Postgres |
| **Broadcast** | backend-patterns | Notifies clients when something changes |

**We use all of these.** The backend event system is the source of truth. SYNC-012 simply connects it to the frontend via Broadcast - we don't replicate the event log to the client.

```
Backend                                    Frontend
────────────────────────────────────────────────────────────────
EventPattern.transition_to()
       ↓
SystemEvent logged to Postgres
       ↓
Broadcast.broadcast()  ──── WebSocket ────→  BroadcastProvider
                                                    ↓
                                             invalidateQueries()
                                                    ↓
                                             Refetch current state
```

---

## Implementation Status

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| **Backend WebSocket Broadcast** | Done | `backend-patterns/pattern_stack/atoms/broadcast/backends/websocket.py` | Full implementation with router, connection management, dead connection cleanup |
| **Backend WebSocket Tests** | Done | `backend-patterns/pattern_stack/__tests__/test_broadcast_websocket.py` | 17 tests covering connections, subscriptions, broadcasts, concurrency |
| **Frontend Broadcast Client** | Done | `sync-patterns/src/runtime/broadcast.ts` | WebSocket client with auto-reconnect, exponential backoff |
| **Frontend BroadcastProvider** | Done | `sync-patterns/src/runtime/BroadcastProvider.tsx` | React context provider with connection state management |
| **Frontend Invalidation Hook** | Done | `sync-patterns/src/runtime/useBroadcastInvalidation.ts` | TanStack Query cache invalidation on broadcast events |
| **Frontend Runtime Exports** | Done | `sync-patterns/src/runtime/index.ts` | Clean public API for all runtime components |
| **Frontend Tests** | Not Started | - | Unit tests for broadcast client and hooks |
| **Generated Mutation Hooks** | Not Started | - | CLI generator for optimistic mutation patterns |
| **Integration Example** | Not Started | - | sales-patterns or aloevera integration demo |
| **OpenAPI x-sync Extension** | Not Started | - | Backend OpenAPI hook for broadcast config |

### What's Implemented

**Backend (backend-patterns)**:
- `WebSocketBroadcastBackend` class with full `BroadcastBackend` interface
- FastAPI router with `/ws/broadcast` endpoint
- Thread-safe connection management with asyncio locks
- Automatic dead connection cleanup on broadcast
- Testing helpers (`get_subscriber_count`, `get_all_channels`, `get_total_connections`)

**Frontend (sync-patterns)**:
- `BroadcastClient` class with auto-reconnect and exponential backoff
- `BroadcastProvider` React context for connection lifecycle
- `useBroadcastInvalidation` hook for automatic TanStack Query cache invalidation
- `useBroadcastState` convenience hook for connection status UI

### What's Next

1. **Frontend tests** - Unit tests for broadcast client and React hooks
2. **Generated mutation hooks** - CLI generates optimistic mutation logic from OpenAPI
3. **Integration example** - Wire up sales-patterns Order entity with broadcast
4. **OpenAPI extension** - Backend emits `x-sync.broadcast` in OpenAPI spec

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Browser)                           │
│                                                                      │
│   ┌──────────────┐     ┌──────────────────────────────────────┐     │
│   │  React UI    │────▶│  TanStack Query                      │     │
│   │  useOrders() │◀────│  - In-memory cache                   │     │
│   └──────────────┘     │  - Optimistic mutations              │     │
│          │             │  - Automatic refetch on invalidate   │     │
│          │             └──────────────────────────────────────┘     │
│          │                              ▲                            │
│          │                              │ invalidateQueries()        │
│          │                              │                            │
│          │             ┌────────────────┴───────────────────┐       │
│          │             │  BroadcastProvider                 │       │
│          │             │  - WebSocket connection            │       │
│          │             │  - Receives "entity.event" signals │       │
│          │             │  - Triggers cache invalidation     │       │
│          │             └────────────────────────────────────┘       │
│          │                              ▲                            │
│          ▼                              │ WebSocket                  │
│   ┌──────────────────────┐             │                            │
│   │  Mutation Handler    │             │                            │
│   │  - Optimistic update │             │                            │
│   │  - POST to API       │             │                            │
│   │  - Rollback on error │             │                            │
│   └──────────┬───────────┘             │                            │
└──────────────│─────────────────────────│────────────────────────────┘
               │ HTTP                    │
               ▼                         │
┌──────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                            │
│                                                                      │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │  API Router  │────▶│   Service    │────▶│  Postgres    │        │
│   │  /orders     │     │  (business   │     │  (source of  │        │
│   └──────────────┘     │   logic)     │     │   truth)     │        │
│                        └──────┬───────┘     └──────────────┘        │
│                               │                                      │
│                               ▼                                      │
│                        ┌──────────────┐                             │
│                        │  Broadcast   │──────────────────────────────┼──▶ WebSocket
│                        │  (Redis)     │                             │
│                        └──────────────┘                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Optimistic Mutations (Instant UI)

When a user performs an action:

```
1. User clicks "Add Item" to order
2. React hook immediately updates TanStack Query cache (< 2ms)
3. UI re-renders with new item (INSTANT)
4. API call fires in background
5. On success: cache confirmed, maybe merge server response
6. On failure: rollback cache, show error toast
```

**The user never waits for the network.** The UI is always responsive.

### 2. Broadcast Invalidation (Cross-Client Sync)

When another client makes a change:

```
1. Tablet A adds item to order 123
2. API saves to Postgres
3. API broadcasts: { channel: "order", event: "item_added", entity_id: "123" }
4. Tablet B receives broadcast via WebSocket
5. Tablet B calls queryClient.invalidateQueries(['orders', '123'])
6. TanStack Query refetches order 123 from API
7. Tablet B UI updates with new item (~100-200ms total)
```

### 3. Conflict Resolution

**Server is authoritative. Last write wins.**

```
Tablet A: Adds "Burger" at 2:00:00.100
Tablet B: Adds "Fries" at 2:00:00.150

Both API calls arrive at server:
- Server processes in arrival order
- Both items added to order
- Broadcast sent for each
- Both tablets refetch, see both items
```

For most CRUD operations, this is sufficient. The order of operations is determined by when the server receives them, not client timestamps.

**When you need stricter ordering:**
- Use optimistic locking (version field)
- API rejects stale updates
- Client shows conflict UI

---

## Implementation Plan

### Phase 1: Backend - WebSocket Broadcast Endpoint (DONE)

> **Status**: Implemented in backend-patterns

#### 1.1 WebSocket Broadcast Backend

**File**: `backend-patterns/pattern_stack/atoms/broadcast/backends/websocket.py`

The implementation includes thread-safe connection management and automatic dead connection cleanup:

```python
from pattern_stack.atoms.broadcast.backends.websocket import WebSocketBroadcastBackend

# Create backend and add router to FastAPI app
backend = WebSocketBroadcastBackend()
app.include_router(backend.get_router())

# In service layer - broadcast after mutations
await backend.broadcast(
    channel="order",
    event_type="item_added",
    payload={"entity_id": str(order_id), "item_id": str(item.id)},
)
```

**WebSocket Protocol**:
```
Client → Server: {"subscribe": ["order", "contact"]}
Client → Server: {"unsubscribe": ["order"]}
Server → Client: {"channel": "order", "event": "item_added", "payload": {...}}
```

**Key Features**:
- Thread-safe with asyncio locks
- Automatic dead connection cleanup on broadcast
- Testing helpers for verification

#### 1.2 Service Layer Integration

Services broadcast after successful mutations:

```python
# Example: OrderService
class OrderService:
    def __init__(self, db: AsyncSession, broadcast: BroadcastBackend):
        self.db = db
        self.broadcast = broadcast

    async def add_item(self, order_id: UUID, item: OrderItemCreate) -> OrderItem:
        order = await self.db.get(Order, order_id)
        if not order:
            raise NotFoundError("Order not found")

        # Business logic
        order_item = OrderItem(**item.model_dump(), order_id=order_id)
        self.db.add(order_item)
        await self.db.commit()

        # Broadcast to other clients
        await self.broadcast.broadcast(
            channel="order",
            event_type="item_added",
            payload={"entity_id": str(order_id), "item_id": str(order_item.id)},
        )

        return order_item
```

#### 1.3 OpenAPI Extension

Add broadcast configuration to OpenAPI spec:

```yaml
paths:
  /orders:
    x-sync:
      local_first: true  # Enables optimistic mutations
      broadcast:
        channel: order
        events: [created, updated, deleted, item_added, item_removed]
```

---

### Phase 2: Frontend - Broadcast Client and Query Integration (DONE)

> **Status**: Implemented in sync-patterns/src/runtime/

#### 2.1 Broadcast Client

**File**: `sync-patterns/src/runtime/broadcast.ts`

The broadcast client provides WebSocket connectivity with automatic reconnection:

```typescript
import { BroadcastClient, initBroadcast, getBroadcastClient } from '@pattern-stack/sync-patterns/runtime'

// Initialize (typically in BroadcastProvider)
const client = initBroadcast('ws://localhost:8000/ws/broadcast', {
  maxReconnectAttempts: 10,  // default
  reconnectDelay: 1000,       // default, uses exponential backoff
})

// Subscribe to channel
const unsubscribe = client.subscribe('order', (event) => {
  console.log('Order event:', event.channel, event.event, event.payload)
})

// Monitor connection state
const removeListener = client.onStateChange((state) => {
  console.log('Connection state:', state)  // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
})

// Cleanup
unsubscribe()
client.disconnect()
```

**Key Features**:
- Auto-reconnect with exponential backoff
- Automatic resubscription on reconnect
- Connection state tracking via listeners
- Singleton pattern via `initBroadcast()`/`getBroadcastClient()`

#### 2.2 React Provider

**File**: `sync-patterns/src/runtime/BroadcastProvider.tsx`

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { BroadcastProvider } from '@pattern-stack/sync-patterns/runtime'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BroadcastProvider url={import.meta.env.VITE_BROADCAST_URL}>
        <RouterProvider router={router} />
      </BroadcastProvider>
    </QueryClientProvider>
  )
}
```

**Hooks provided**:
- `useBroadcast()` - Full context with `state` and `subscribe`
- `useBroadcastState()` - Just the connection state for UI indicators

#### 2.3 Query Invalidation Hook

**File**: `sync-patterns/src/runtime/useBroadcastInvalidation.ts`

Automatically invalidates TanStack Query cache when broadcast events arrive:

```tsx
import { useBroadcastInvalidation } from '@pattern-stack/sync-patterns/runtime'

function OrderList() {
  // Invalidate all order queries when any order event occurs
  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders'],
  })

  const { data: orders } = useOrders()
  return <OrderTable orders={orders} />
}

function OrderEditForm({ id }: { id: string }) {
  const [isEditing, setIsEditing] = useState(false)

  // Disable auto-refresh while editing to prevent data loss
  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders', id],
    enabled: !isEditing,
  })

  // ...
}
```

**Invalidation logic**:
- If event has `entity_id`: invalidates both `[...prefix, entity_id]` and `prefix` (exact)
- Otherwise: invalidates all queries matching prefix

---

### Phase 3: Generated Optimistic Mutation Hooks (NOT STARTED)

> **Status**: Planned - CLI will generate mutation hooks with optimistic update logic.

#### 3.1 Generated Mutation Hook Pattern

**File**: `src/generated/hooks/useOrderMutations.ts` (generated)

```typescript
/**
 * Generated optimistic mutation hooks for Order entity.
 *
 * DO NOT EDIT - changes will be overwritten.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orderApi } from '../client/order'
import type { Order, OrderItemCreate } from '../schemas/order.schema'

export function useAddOrderItem(orderId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (item: OrderItemCreate) =>
      orderApi.addItem(orderId, item),

    // Optimistic update - runs BEFORE API call
    onMutate: async (newItem) => {
      // Cancel in-flight fetches
      await queryClient.cancelQueries({ queryKey: ['orders', orderId] })

      // Snapshot for rollback
      const previousOrder = queryClient.getQueryData<Order>(['orders', orderId])

      // Optimistically add item
      queryClient.setQueryData<Order>(['orders', orderId], (old) => {
        if (!old) return old
        return {
          ...old,
          items: [
            ...old.items,
            {
              ...newItem,
              id: crypto.randomUUID(), // Temp ID
              created_at: new Date().toISOString(),
            },
          ],
        }
      })

      return { previousOrder }
    },

    // Rollback on error
    onError: (err, newItem, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(['orders', orderId], context.previousOrder)
      }
    },

    // Sync with server response
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ['orders', orderId] })
    },
  })
}

export function useUpdateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Order> }) =>
      orderApi.update(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['orders', id] })

      const previousOrder = queryClient.getQueryData<Order>(['orders', id])

      queryClient.setQueryData<Order>(['orders', id], (old) => {
        if (!old) return old
        return { ...old, ...data, updated_at: new Date().toISOString() }
      })

      return { previousOrder }
    },

    onError: (err, { id }, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(['orders', id], context.previousOrder)
      }
    },

    onSettled: (data, error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['orders', id] })
    },
  })
}

export function useDeleteOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => orderApi.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })

      const previousOrders = queryClient.getQueryData<Order[]>(['orders'])

      // Remove from list
      queryClient.setQueryData<Order[]>(['orders'], (old) =>
        old?.filter((o) => o.id !== id)
      )

      // Remove individual query
      queryClient.removeQueries({ queryKey: ['orders', id] })

      return { previousOrders }
    },

    onError: (err, id, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['orders'], context.previousOrders)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
```

#### 3.2 Entity Hook with Broadcast Integration

**File**: `src/generated/entities/order.ts` (generated)

```typescript
/**
 * Unified hooks for Order entity.
 *
 * Combines data fetching with broadcast invalidation.
 */

import { useQuery } from '@tanstack/react-query'
import { orderApi } from '../client/order'
import { useBroadcastInvalidation } from '../runtime/useBroadcastInvalidation'
import type { Order } from '../schemas/order.schema'

interface UseOrdersOptions {
  /** Enable auto-refresh on broadcast (default: true) */
  autoRefresh?: boolean
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { autoRefresh = true } = options

  // Subscribe to broadcast for cache invalidation
  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders'],
    enabled: autoRefresh,
  })

  return useQuery({
    queryKey: ['orders'],
    queryFn: () => orderApi.list(),
  })
}

export function useOrder(id: string, options: UseOrdersOptions = {}) {
  const { autoRefresh = true } = options

  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders', id],
    enabled: autoRefresh,
  })

  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => orderApi.get(id),
  })
}
```

---

## Usage Examples

### App Setup

```typescript
// main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BroadcastProvider } from '@/generated/runtime/BroadcastProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BroadcastProvider url={import.meta.env.VITE_BROADCAST_URL}>
        <RouterProvider router={router} />
      </BroadcastProvider>
    </QueryClientProvider>
  )
}
```

### Kitchen Display (Auto-refresh)

```typescript
function KitchenDisplay() {
  // Auto-refreshes when any order changes via broadcast
  const { data: orders, isLoading } = useOrders()

  if (isLoading) return <Loading />
  return <OrderQueue orders={orders} />
}
```

### Order Entry (Optimistic)

```typescript
function OrderEntry({ orderId }: { orderId: string }) {
  const { data: order } = useOrder(orderId)
  const addItem = useAddOrderItem(orderId)

  const handleAddItem = (item: OrderItemCreate) => {
    // UI updates INSTANTLY, API call in background
    addItem.mutate(item, {
      onError: () => toast.error('Failed to add item'),
    })
  }

  return (
    <div>
      <OrderItems items={order?.items ?? []} />
      <MenuGrid onSelectItem={handleAddItem} />
      {addItem.isPending && <SavingIndicator />}
    </div>
  )
}
```

### Edit Form (Stable - No Auto-refresh)

```typescript
function OrderEditPage({ id }: { id: string }) {
  // Disable auto-refresh while editing
  const { data: order } = useOrder(id, { autoRefresh: false })
  const [draft, setDraft] = useState<Order | null>(null)
  const updateOrder = useUpdateOrder()

  useEffect(() => {
    if (order && !draft) setDraft(order)
  }, [order, draft])

  const handleSave = () => {
    if (!draft) return
    updateOrder.mutate(
      { id, data: draft },
      { onSuccess: () => navigate('/orders') }
    )
  }

  return (
    <form>
      <OrderForm value={draft} onChange={setDraft} />
      <Button onClick={handleSave} loading={updateOrder.isPending}>
        Save
      </Button>
    </form>
  )
}
```

### Connection Status Indicator

```typescript
function ConnectionStatus() {
  const state = useBroadcastState()

  if (state === 'connected') return null

  return (
    <Banner variant={state === 'reconnecting' ? 'warning' : 'error'}>
      {state === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
    </Banner>
  )
}
```

---

## Conflict Handling

### Default: Last Write Wins

For most operations, the server processes requests in arrival order:

```
Client A: PATCH /orders/123 { status: "preparing" } at 10:00:00.100
Client B: PATCH /orders/123 { status: "ready" } at 10:00:00.150

Server receives A first → status = "preparing"
Server receives B second → status = "ready"
Both clients get broadcast → refetch → see "ready"
```

### Optimistic Locking (When Needed)

For sensitive fields, use version-based locking:

```python
# Backend
class Order(BasePattern):
    version = Field(int, default=1)

async def update_order(order_id: UUID, data: OrderUpdate, expected_version: int):
    order = await db.get(Order, order_id)
    if order.version != expected_version:
        raise ConflictError("Order was modified by another user")

    order.version += 1
    # ... apply updates
```

```typescript
// Frontend - generated hook handles this
const updateOrder = useUpdateOrder()

updateOrder.mutate(
  { id, data: draft, version: order.version },
  {
    onError: (err) => {
      if (err.status === 409) {
        toast.error('Order was modified. Please refresh.')
      }
    },
  }
)
```

---

## Comparison to Previous Specs

| Aspect | SYNC-008 (Event-Sourced) | SYNC-009 (Electric+Broadcast) | SYNC-012 (This Spec) |
|--------|--------------------------|-------------------------------|----------------------|
| Local Storage | Dexie (IndexedDB) | PGlite | None (memory only) |
| Sync Engine | Custom event store | ElectricSQL | None |
| Conflict Resolution | HLC + custom merge | Electric handles | Server authoritative |
| Offline Support | Full | Full | None (deferred) |
| Complexity | Very High | High | Low |
| Time to Implement | Weeks | 1-2 weeks | Days |

---

## Iterative Adoption Path

This architecture is designed for incremental adoption. Start simple, add complexity only when needed:

```
Level 1: TanStack Query Only (SYNC-012 as written)
    ├── Optimistic mutations ✓
    ├── Broadcast invalidation ✓
    ├── In-memory cache ✓
    └── Survives navigation within app ✓

         ↓ Need: Survive page refresh?

Level 2: Add Query Persistence
    ├── Everything from Level 1
    └── localStorage/IndexedDB persister for TanStack Query
        (Data survives refresh, ~10 lines of config)

         ↓ Need: Full offline with local DB?

Level 3: TanStack DB (no Electric)
    ├── Replace TanStack Query with TanStack DB collections
    ├── PGlite for local persistence
    ├── Offline reads work
    └── Offline writes queue and sync

         ↓ Need: Automatic Postgres→client sync?

Level 4: TanStack DB + Electric
    ├── Everything from Level 3
    └── Electric handles Postgres replication automatically
```

### When to Level Up

| Trigger | Action |
|---------|--------|
| Users complain about refresh losing state | Add Level 2 (Query Persistence) |
| Need offline for field/POS use | Add Level 3 (TanStack DB) |
| Manual sync is too slow/complex | Add Level 4 (Electric) |

**Current target: Level 1** - Sufficient for sales-patterns and aloevera today.

---

## Future: Adding Offline Support

If offline becomes a hard requirement, the architecture supports adding Electric:

```typescript
// Future: Add Electric collection alongside TanStack Query
const electricCollection = createElectricCollection({
  table: 'orders',
  // ...
})

// Hooks would check: isOnline ? useQuery(...) : useElectricQuery(...)
```

The broadcast infrastructure and optimistic mutation patterns remain unchanged.

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

## Summary

| Feature | Implementation |
|---------|----------------|
| **Instant UI** | Optimistic mutations (TanStack Query) |
| **Cross-client sync** | Broadcast WebSocket → cache invalidation |
| **Conflict resolution** | Server authoritative (last write wins) |
| **Connection resilience** | Auto-reconnect with exponential backoff |
| **Edit form protection** | `autoRefresh: false` option |
| **Offline support** | Deferred (can add Electric later) |

**What we're NOT building:**
- Electric sync engine
- PGlite local database
- Client-side event store
- Custom sync protocol

---

## References

- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [backend-patterns broadcast subsystem](../../backend-patterns/pattern_stack/atoms/broadcast/)
- [SYNC-009: Electric + Broadcast](./SYNC-009-electric-broadcast-sync.md) (superseded)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-26 | Initial draft - Simplified architecture without Electric |
| 2025-12-26 | Added: Relationship to backend EventPattern/SystemEvent |
| 2025-12-26 | Added: Iterative adoption path (Levels 1-4) |
| 2025-12-26 | **Implementation Progress**: Backend WebSocket broadcast complete |
| 2025-12-26 | **Implementation Progress**: Frontend runtime (BroadcastClient, BroadcastProvider, useBroadcastInvalidation) complete |
| 2025-12-26 | Updated spec: Added Implementation Status section, updated code examples to match actual implementation |
