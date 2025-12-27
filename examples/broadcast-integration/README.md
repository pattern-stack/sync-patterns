# Broadcast Integration Guide

This guide shows how to integrate the sync-patterns broadcast system with your Pattern Stack application for real-time, cross-client synchronization.

## Overview

The broadcast system provides:

1. **Optimistic mutations** - UI updates instantly, API confirms in background
2. **Cross-client sync** - Changes from one client appear on all connected clients
3. **Connection resilience** - Auto-reconnect with exponential backoff
4. **Edit protection** - Disable auto-refresh while editing forms

```
Backend                                    Frontend
--------------------------------------------------------------------
Service Layer
       |
       v
Broadcast.broadcast()  ---- WebSocket ---->  BroadcastProvider
                                                    |
                                             invalidateQueries()
                                                    |
                                             Refetch current state
```

## Installation

### Prerequisites

- backend-patterns v0.3.0+ (includes WebSocket broadcast backend)
- @tanstack/react-query v5+
- sync-patterns runtime

```bash
# Frontend
npm install @tanstack/react-query @pattern-stack/sync-patterns

# Backend (in your Python project)
uv add pattern-stack
```

## Backend Setup

### 1. Add WebSocket Router to FastAPI

The `WebSocketBroadcastBackend` provides a ready-to-use FastAPI router. Include it in your application:

```python
# app/main.py
from fastapi import FastAPI
from pattern_stack.atoms.broadcast import WebSocketBroadcastBackend

# Create broadcast backend (singleton)
broadcast_backend = WebSocketBroadcastBackend()

app = FastAPI()

# Include the WebSocket router
app.include_router(broadcast_backend.get_router())
```

This adds a WebSocket endpoint at `/ws/broadcast` that clients can connect to.

### 2. Broadcast from Services

After successful mutations, broadcast events to notify other clients:

```python
# app/features/orders/service.py
from uuid import UUID
from pattern_stack.atoms.broadcast import WebSocketBroadcastBackend

class OrderService:
    def __init__(self, db: AsyncSession, broadcast: WebSocketBroadcastBackend):
        self.db = db
        self.broadcast = broadcast

    async def add_item(self, order_id: UUID, item: OrderItemCreate) -> OrderItem:
        # 1. Perform the mutation
        order = await self.db.get(Order, order_id)
        order_item = OrderItem(**item.model_dump(), order_id=order_id)
        self.db.add(order_item)
        await self.db.commit()

        # 2. Broadcast to other clients
        await self.broadcast.broadcast(
            channel="order",
            event_type="item_added",
            payload={"entity_id": str(order_id), "item_id": str(order_item.id)},
        )

        return order_item

    async def update(self, order_id: UUID, data: OrderUpdate) -> Order:
        order = await self.db.get(Order, order_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(order, field, value)
        await self.db.commit()

        await self.broadcast.broadcast(
            channel="order",
            event_type="updated",
            payload={"entity_id": str(order_id)},
        )

        return order
```

### 3. Dependency Injection

Set up the broadcast backend as a FastAPI dependency:

```python
# app/dependencies.py
from functools import lru_cache
from pattern_stack.atoms.broadcast import WebSocketBroadcastBackend

@lru_cache
def get_broadcast_backend() -> WebSocketBroadcastBackend:
    """Get the singleton broadcast backend."""
    return WebSocketBroadcastBackend()

# In your router
from fastapi import Depends

@router.post("/orders/{order_id}/items")
async def add_order_item(
    order_id: UUID,
    item: OrderItemCreate,
    db: AsyncSession = Depends(get_db),
    broadcast: WebSocketBroadcastBackend = Depends(get_broadcast_backend),
):
    service = OrderService(db, broadcast)
    return await service.add_item(order_id, item)
```

### 4. OpenAPI Extension (Optional)

Add sync configuration to your OpenAPI spec for code generation:

```yaml
paths:
  /orders:
    x-sync:
      local_first: true
      broadcast:
        channel: order
        events: [created, updated, deleted, item_added, item_removed]
```

## Frontend Setup

### 1. Configure Providers

Wrap your application with QueryClientProvider and BroadcastProvider:

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BroadcastProvider } from '@pattern-stack/sync-patterns/runtime'

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

### 2. Environment Configuration

Add the WebSocket URL to your environment:

```bash
# .env.local
VITE_BROADCAST_URL=ws://localhost:8000/ws/broadcast
```

For production with HTTPS:

```bash
# .env.production
VITE_BROADCAST_URL=wss://api.yourapp.com/ws/broadcast
```

### 3. Use Generated Hooks

If using sync-patterns code generation, the generated hooks automatically integrate with broadcast:

```tsx
import { useOrders, useOrder } from '@/generated/entities/order'
import { useAddOrderItem, useUpdateOrder } from '@/generated/hooks/useOrderMutations'

function OrderList() {
  // Auto-refreshes when any order event arrives via broadcast
  const { data: orders, isLoading } = useOrders()

  if (isLoading) return <Loading />
  return <OrderTable orders={orders} />
}
```

### 4. Manual Broadcast Integration

If not using code generation, integrate broadcast manually:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useBroadcastInvalidation } from '@pattern-stack/sync-patterns/runtime'
import { orderApi } from '@/api/order'

function useOrders() {
  // Subscribe to broadcast for cache invalidation
  useBroadcastInvalidation({
    channel: 'order',
    queryKeyPrefix: ['orders'],
  })

  return useQuery({
    queryKey: ['orders'],
    queryFn: () => orderApi.list(),
  })
}
```

## Common Patterns

### Kitchen Display (Auto-refresh)

For displays that should always show the latest data:

```tsx
function KitchenDisplay() {
  const { data: orders } = useOrders() // Auto-refreshes via broadcast
  return <OrderQueue orders={orders ?? []} />
}
```

### Edit Form (Stable Data)

For forms where you don't want data changing while the user is editing:

```tsx
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

Show users when they're disconnected:

```tsx
import { useBroadcastState } from '@pattern-stack/sync-patterns/runtime'

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

### Optimistic Mutations

For instant UI feedback:

```tsx
function OrderEntry({ orderId }: { orderId: string }) {
  const { data: order } = useOrder(orderId)
  const addItem = useAddOrderItem(orderId)

  const handleAddItem = (item: OrderItemCreate) => {
    // UI updates INSTANTLY, API call happens in background
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

## WebSocket Protocol

The broadcast WebSocket uses a simple JSON protocol:

### Client to Server

```json
// Subscribe to channels
{"subscribe": ["order", "contact"]}

// Unsubscribe from channels
{"unsubscribe": ["order"]}
```

### Server to Client

```json
{
  "channel": "order",
  "event": "item_added",
  "payload": {
    "entity_id": "123e4567-e89b-12d3-a456-426614174000",
    "item_id": "987fcdeb-51a2-3c4d-b5e6-789012345678"
  }
}
```

## Conflict Resolution

### Default: Server Authoritative (Last Write Wins)

For most operations, the server processes requests in arrival order:

```
Tablet A: Adds "Burger" at 2:00:00.100
Tablet B: Adds "Fries" at 2:00:00.150

Both API calls arrive at server:
- Server processes in arrival order
- Both items added to order
- Broadcast sent for each
- Both tablets refetch, see both items
```

### Optimistic Locking (When Needed)

For sensitive fields where conflicts matter:

```python
# Backend
class Order(BasePattern):
    version = Field(int, default=1)

async def update_order(order_id: UUID, data: OrderUpdate, expected_version: int):
    order = await db.get(Order, order_id)
    if order.version != expected_version:
        raise HTTPException(status_code=409, detail="Order was modified")

    order.version += 1
    # ... apply updates
```

```tsx
// Frontend
const updateOrder = useUpdateOrder()

updateOrder.mutate(
  { id, data: draft, version: order.version },
  {
    onError: (err) => {
      if (err.response?.status === 409) {
        toast.error('Order was modified by another user. Please refresh.')
      }
    },
  }
)
```

## Troubleshooting

### WebSocket Connection Fails

1. Check that the backend is running and the WebSocket router is included
2. Verify the URL is correct (ws:// for development, wss:// for production)
3. Check for CORS issues if frontend and backend are on different domains

### Cache Not Invalidating

1. Verify the channel name matches between backend broadcast and frontend subscription
2. Check that `useBroadcastInvalidation` is being called with correct `queryKeyPrefix`
3. Use browser DevTools Network tab to verify WebSocket messages are being received

### Optimistic Updates Not Rolling Back

1. Ensure the `onMutate` handler returns the previous data for rollback
2. Check that `onError` handler uses the context to restore previous state
3. Verify the mutation is throwing errors properly on failure

## Related Documentation

- [SYNC-012 Specification](../../docs/specs/SYNC-012-broadcast-optimistic-sync.md) - Full architecture details
- [backend-patterns Broadcast](../../../backend-patterns/pattern_stack/atoms/broadcast/) - Backend implementation
- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
