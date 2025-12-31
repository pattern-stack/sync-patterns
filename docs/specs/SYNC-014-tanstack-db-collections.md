# SYNC-014: TanStack DB as Primary Data Layer

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-014 |
| **Title** | TanStack DB as Primary Data Layer |
| **Status** | Draft |
| **Created** | 2025-12-28 |
| **Depends On** | [SYNC-010](./SYNC-010-generator-rebuild.md) (EntityModel), [SYNC-012](./SYNC-012-broadcast-optimistic-sync.md) (Broadcast) |
| **Amends** | [SYNC-012](./SYNC-012-broadcast-optimistic-sync.md) (replaces Query-only approach) |

---

## Executive Summary

This specification elevates **TanStack DB** from "future addition" to **primary data layer**. All entity data flows through TanStack DB collections, providing:

1. **Normalized storage** - Same entity referenced across queries = single object
2. **Live queries** - Insert/update anywhere → all consumers react instantly
3. **Foundation for offline** - PGlite persistence is additive (Phase 2)

TanStack Query becomes the **network transport layer** - it fetches data and populates collections. Components never use Query directly; they use live queries on collections.

### Architecture Shift

```
BEFORE (SYNC-012):
Component → useQuery() → API → Cache (flat, per-query)

AFTER (SYNC-014):
Component → useLiveQuery() → Collection → Normalized Store
                                  ↑
                             useQuery() → API (internal, populates collection)
                                  ↑
                             Broadcast (invalidates query → refetch → collection updates)
```

### What This Enables

| Feature | Benefit |
|---------|---------|
| **Normalized storage** | Update customer once → all orders with that customer reflect change |
| **Live queries** | Optimistic insert → every list/detail view updates instantly |
| **Relationship joins** | `include: ['customer']` returns denormalized data from collection |
| **Future offline** | Add PGlite persistence without changing component code |

---

## Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| Collection Generator | Done | `src/core/collection-generator.ts` |
| Entity Hook Generator | Done | `src/core/entity-hook-generator.ts` |
| Store Initialization | Generated | `collections/store.ts` (generated output) |
| Runtime Types | N/A | Types are generated per-entity |
| Broadcast Integration | Done (SYNC-012) | `src/runtime/broadcast.ts` |

---

## Core Concepts

### Collections vs Queries

| Aspect | TanStack Query | TanStack DB Collection |
|--------|---------------|------------------------|
| **Storage** | Flat cache, keyed by queryKey | Normalized store, keyed by entity ID |
| **Reactivity** | Per-query subscription | Global - any mutation triggers all relevant queries |
| **Deduplication** | None - same entity can exist in multiple cache entries | Automatic - one entity = one object |
| **Relationships** | Manual - fetch related data separately | Built-in - `include` joins from other collections |
| **Optimistic updates** | Per-mutation, manual rollback | Collection-wide, automatic consistency |

### Data Flow

```
1. Component mounts, calls useOrders()
2. useOrders() internally calls useQuery() to fetch from API
3. API response flows into ordersCollection.upsertMany()
4. useLiveQuery() subscribes to collection
5. Component receives reactive data

On mutation:
1. useCreateOrder() optimistically inserts into collection
2. All useLiveQuery() subscribers update instantly (< 2ms)
3. API call fires in background
4. On success: merge server response (real ID, timestamps)
5. On error: rollback from collection
6. Broadcast notifies other clients → they refetch → their collections update
```

---

## Generated Output Structure

```
src/generated/
├── schemas/                  # Zod schemas (unchanged from SYNC-010)
│   ├── order.schema.ts
│   ├── customer.schema.ts
│   └── index.ts

├── client/                   # API client (unchanged from SYNC-010)
│   ├── api.ts
│   └── index.ts

├── collections/              # NEW: TanStack DB collections
│   ├── orders.ts             # ordersCollection + relationships
│   ├── customers.ts
│   ├── store.ts              # createStore() with all collections
│   └── index.ts

├── entities/                 # NEW: Unified hooks per entity
│   ├── orders.ts             # useOrders, useOrder, useCreateOrder, etc.
│   ├── customers.ts
│   └── index.ts

└── index.ts                  # Public exports (entities + store init)
```

**Import hierarchy:**
- `entities/` imports from `collections/` and `client/`
- `collections/` imports from `schemas/`
- Components import from `entities/` only

---

## Phase 1: Collection Generator

### Input: EntityModel (from SYNC-010)

```typescript
interface EntityDefinition {
  name: string              // 'orders'
  singular: string          // 'order'
  pascalName: string        // 'Order'
  syncMode: SyncMode        // 'confirmed' | 'optimistic'
  operations: { ... }       // CRUD operations
  schemas: EntitySchemas    // Zod schema references
  relationships: Relationship[]  // Detected from FK fields
}

interface Relationship {
  name: string              // 'customer'
  type: 'belongsTo' | 'hasMany'
  targetEntity: string      // 'customers'
  foreignKey: string        // 'customer_id'
}
```

### Output: Collection Definition

**File: `src/generated/collections/orders.ts`**

```typescript
/**
 * TanStack DB collection for Order entity.
 *
 * DO NOT EDIT - Generated by sync-patterns CLI.
 */

import { createCollection, belongsTo, hasMany } from '@tanstack/db'
import { OrderSchema, type Order } from '../schemas/order.schema'
import { customersCollection } from './customers'
import { orderItemsCollection } from './order-items'

export const ordersCollection = createCollection<Order>({
  name: 'orders',
  schema: OrderSchema,
  primaryKey: 'id',

  relationships: {
    customer: belongsTo(customersCollection, {
      foreignKey: 'customer_id',
    }),
    items: hasMany(orderItemsCollection, {
      foreignKey: 'order_id',
    }),
  },
})

// Type exports for external use
export type { Order }
```

### Relationship Detection

Relationships are detected from EntityModel during resolution:

1. **belongsTo**: Field ends with `_id` and references another entity's schema
   - `customer_id: UUID` → `belongsTo(customersCollection, 'customer_id')`

2. **hasMany**: Another entity has a `_id` field pointing to this entity
   - `OrderItem.order_id` → `Order.hasMany(orderItemsCollection, 'order_id')`

```typescript
// In EntityResolver (SYNC-010 extension)
private detectRelationships(entity: EntityDefinition, allEntities: Map<string, EntityDefinition>): Relationship[] {
  const relationships: Relationship[] = []

  // Detect belongsTo from _id fields
  for (const [fieldName, field] of Object.entries(entity.schema.properties)) {
    if (fieldName.endsWith('_id') && field.format === 'uuid') {
      const targetName = fieldName.replace(/_id$/, '')
      const targetPlural = pluralize(targetName)

      if (allEntities.has(targetPlural)) {
        relationships.push({
          name: targetName,
          type: 'belongsTo',
          targetEntity: targetPlural,
          foreignKey: fieldName,
        })
      }
    }
  }

  // Detect hasMany from other entities' _id fields pointing here
  for (const [otherName, otherEntity] of allEntities) {
    const fkField = `${entity.singular}_id`
    if (otherEntity.schema.properties[fkField]) {
      relationships.push({
        name: otherName,
        type: 'hasMany',
        targetEntity: otherName,
        foreignKey: fkField,
      })
    }
  }

  return relationships
}
```

---

## Phase 2: Store Initialization

**File: `src/generated/collections/store.ts`**

```typescript
/**
 * TanStack DB store initialization.
 *
 * DO NOT EDIT - Generated by sync-patterns CLI.
 */

import { createStore, type Store } from '@tanstack/db'
import { ordersCollection } from './orders'
import { customersCollection } from './customers'
import { orderItemsCollection } from './order-items'

export interface SyncStore extends Store {
  orders: typeof ordersCollection
  customers: typeof customersCollection
  orderItems: typeof orderItemsCollection
}

let store: SyncStore | null = null

export function initializeStore(): SyncStore {
  if (store) return store

  store = createStore({
    collections: {
      orders: ordersCollection,
      customers: customersCollection,
      orderItems: orderItemsCollection,
    },
  })

  return store
}

export function getStore(): SyncStore {
  if (!store) {
    throw new Error('Store not initialized. Call initializeStore() first.')
  }
  return store
}

// Re-export collections for direct access
export { ordersCollection, customersCollection, orderItemsCollection }
```

### Future: Persistence Adapter (Phase 2)

When PGlite is added, store initialization changes minimally:

```typescript
import { createStore } from '@tanstack/db'
import { PGliteAdapter } from '@tanstack/db-pglite'  // Future

export function initializeStore(options?: { persist?: boolean }): SyncStore {
  if (store) return store

  const adapter = options?.persist
    ? new PGliteAdapter({ database: 'sync-patterns' })
    : undefined  // In-memory

  store = createStore({
    adapter,  // Only change needed for persistence
    collections: { ... },
  })

  return store
}
```

---

## Phase 3: Entity Hook Generator

Each entity gets a unified hooks file that:
1. Syncs data from API to collection
2. Exposes live queries for components
3. Provides optimistic mutation hooks
4. Integrates broadcast for cross-client sync

**File: `src/generated/entities/orders.ts`**

```typescript
/**
 * Unified hooks for Order entity.
 *
 * Uses TanStack DB for normalized storage and live queries.
 * TanStack Query handles network fetching internally.
 *
 * DO NOT EDIT - Generated by sync-patterns CLI.
 */

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useLiveQuery } from '@tanstack/db-react'
import { ordersCollection } from '../collections/orders'
import { ordersApi } from '../client/api'
import { useBroadcastInvalidation } from '../runtime/useBroadcastInvalidation'
import type { Order, OrderCreate, OrderUpdate } from '../schemas/order.schema'

// ============================================================================
// Query Keys
// ============================================================================

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters?: OrderFilters) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
}

// ============================================================================
// Types
// ============================================================================

export interface OrderFilters {
  status?: string
  customer_id?: string
}

export interface UseOrdersOptions {
  /** Filter criteria */
  where?: OrderFilters
  /** Related entities to include */
  include?: ('customer' | 'items')[]
  /** Sort configuration */
  orderBy?: Partial<Record<keyof Order, 'asc' | 'desc'>>
  /** Enable broadcast auto-refresh (default: true) */
  autoRefresh?: boolean
}

export interface UseOrderOptions {
  /** Related entities to include */
  include?: ('customer' | 'items')[]
  /** Enable broadcast auto-refresh (default: true) */
  autoRefresh?: boolean
}

// ============================================================================
// Internal: Sync Hook (populates collection from API)
// ============================================================================

function useOrdersSync(filters?: OrderFilters) {
  const query = useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => ordersApi.list(filters),
    staleTime: 1000 * 60, // 1 minute
  })

  // Sync API response into collection
  useEffect(() => {
    if (query.data) {
      ordersCollection.upsertMany(query.data)
    }
  }, [query.data])

  return query
}

function useOrderSync(id: string) {
  const query = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => ordersApi.get(id),
    enabled: !!id,
  })

  useEffect(() => {
    if (query.data) {
      ordersCollection.upsert(query.data)
    }
  }, [query.data])

  return query
}

// ============================================================================
// Public: List Hook
// ============================================================================

/**
 * Fetch and subscribe to orders.
 *
 * Returns live query that updates when:
 * - Initial fetch completes
 * - Any order is created/updated/deleted locally
 * - Broadcast triggers refetch from other clients
 *
 * @example
 * ```tsx
 * const { data: orders, isLoading } = useOrders({
 *   where: { status: 'active' },
 *   include: ['customer'],
 * })
 * ```
 */
export function useOrders(options: UseOrdersOptions = {}) {
  const { where, include, orderBy, autoRefresh = true } = options

  // Sync from API to collection
  const sync = useOrdersSync(where)

  // Subscribe to broadcast for cross-client updates
  useBroadcastInvalidation({
    channel: 'order',
    queryKey: orderKeys.lists(),
    enabled: autoRefresh,
  })

  // Build live query
  const liveQuery = useMemo(() => {
    let query = ordersCollection.query()

    if (where) {
      Object.entries(where).forEach(([key, value]) => {
        if (value !== undefined) {
          query = query.where(key as keyof Order, '=', value)
        }
      })
    }

    if (orderBy) {
      Object.entries(orderBy).forEach(([key, direction]) => {
        query = query.orderBy(key, direction)
      })
    }

    if (include?.length) {
      include.forEach(relation => {
        query = query.include(relation)
      })
    }

    return query
  }, [where, orderBy, include])

  // Subscribe to collection
  const data = useLiveQuery(liveQuery)

  return {
    data,
    isLoading: sync.isLoading,
    error: sync.error,
    refetch: sync.refetch,
  }
}

// ============================================================================
// Public: Single Item Hook
// ============================================================================

/**
 * Fetch and subscribe to a single order.
 *
 * @example
 * ```tsx
 * const { data: order, isLoading } = useOrder(orderId, {
 *   include: ['customer', 'items'],
 * })
 * ```
 */
export function useOrder(id: string, options: UseOrderOptions = {}) {
  const { include, autoRefresh = true } = options

  // Sync from API to collection
  const sync = useOrderSync(id)

  // Subscribe to broadcast
  useBroadcastInvalidation({
    channel: 'order',
    queryKey: orderKeys.detail(id),
    enabled: autoRefresh,
  })

  // Build live query for single item
  const liveQuery = useMemo(() => {
    let query = ordersCollection.query().where('id', '=', id)

    if (include?.length) {
      include.forEach(relation => {
        query = query.include(relation)
      })
    }

    return query.first()
  }, [id, include])

  const data = useLiveQuery(liveQuery)

  return {
    data,
    isLoading: sync.isLoading,
    error: sync.error,
    refetch: sync.refetch,
  }
}

// ============================================================================
// Public: Mutation Hooks
// ============================================================================

/**
 * Create a new order with optimistic update.
 *
 * UI updates instantly. API confirms in background.
 * Rollback on error.
 *
 * @example
 * ```tsx
 * const createOrder = useCreateOrder()
 *
 * createOrder.mutate({ customer_id: '...', items: [...] }, {
 *   onSuccess: (order) => navigate(`/orders/${order.id}`),
 *   onError: () => toast.error('Failed to create order'),
 * })
 * ```
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: OrderCreate) => ordersApi.create(data),

    onMutate: async (newOrder) => {
      // Cancel in-flight fetches
      await queryClient.cancelQueries({ queryKey: orderKeys.lists() })

      // Generate temp ID for optimistic insert
      const tempId = `temp-${crypto.randomUUID()}`
      const optimisticOrder: Order = {
        ...newOrder,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Order

      // Insert into collection (all live queries update instantly)
      ordersCollection.insert(optimisticOrder)

      return { tempId }
    },

    onSuccess: (serverOrder, _variables, context) => {
      // Replace temp with real order from server
      if (context?.tempId) {
        ordersCollection.delete(context.tempId)
      }
      ordersCollection.upsert(serverOrder)
    },

    onError: (_error, _variables, context) => {
      // Rollback optimistic insert
      if (context?.tempId) {
        ordersCollection.delete(context.tempId)
      }
    },

    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
    },
  })
}

/**
 * Update an existing order with optimistic update.
 */
export function useUpdateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: OrderUpdate }) =>
      ordersApi.update(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: orderKeys.detail(id) })

      // Snapshot for rollback
      const previous = ordersCollection.findById(id)

      // Optimistic update
      if (previous) {
        ordersCollection.update(id, {
          ...data,
          updated_at: new Date().toISOString(),
        })
      }

      return { previous }
    },

    onSuccess: (serverOrder) => {
      // Merge server response
      ordersCollection.upsert(serverOrder)
    },

    onError: (_error, { id }, context) => {
      // Rollback
      if (context?.previous) {
        ordersCollection.upsert(context.previous)
      }
    },

    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) })
    },
  })
}

/**
 * Delete an order with optimistic update.
 */
export function useDeleteOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => ordersApi.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: orderKeys.all })

      // Snapshot for rollback
      const previous = ordersCollection.findById(id)

      // Optimistic delete
      ordersCollection.delete(id)

      return { previous }
    },

    onError: (_error, _id, context) => {
      // Rollback
      if (context?.previous) {
        ordersCollection.insert(context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
    },
  })
}
```

---

## Phase 4: Broadcast Integration

The existing broadcast infrastructure (SYNC-012) integrates seamlessly:

```
User A creates order
    ↓
useCreateOrder() inserts into collection (instant)
    ↓
API call in background
    ↓
Backend saves to Postgres
    ↓
Backend broadcasts: { channel: 'order', event: 'created', entity_id: '...' }
    ↓
User B's useBroadcastInvalidation catches it
    ↓
invalidateQueries(['orders', 'list'])
    ↓
useOrdersSync refetches from API
    ↓
ordersCollection.upsertMany() updates collection
    ↓
User B's useLiveQuery updates (< 200ms total)
```

No changes needed to broadcast infrastructure. Collections slot in as the storage layer.

---

## API Design Decisions

### 1. Naming Convention: Verb-first

```typescript
// Matches React/TanStack conventions
useOrders()         // List
useOrder(id)        // Single item
useCreateOrder()    // Mutation
useUpdateOrder()    // Mutation
useDeleteOrder()    // Mutation
```

### 2. Filter API: Object-based

```typescript
// Declarative, type-safe, matches TanStack Query patterns
const { data } = useOrders({
  where: { status: 'active', customer_id: customerId },
  include: ['customer', 'items'],
  orderBy: { created_at: 'desc' },
})
```

### 3. Relationship Detection: From Schema

Relationships detected from `_id` suffix + schema `$ref`:

```yaml
# OpenAPI
Order:
  properties:
    customer_id:
      type: string
      format: uuid
      # Optional explicit annotation:
      x-relationship:
        entity: customers
        type: belongsTo
```

### 4. Return Type: Unified Object

All hooks return consistent shape:

```typescript
interface UseEntityResult<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}
```

### 5. Include Typing: Conditional Types

The `include` option uses conditional types to narrow the return type based on which relations are requested:

```typescript
// Base type (no relations)
const { data: order } = useOrder(id)
order.customer  // ❌ TypeScript error - property doesn't exist

// With include - type narrows automatically
const { data: order } = useOrder(id, { include: ['customer'] })
order.customer.name  // ✅ Works - customer is included in type

// Multiple includes
const { data: order } = useOrder(id, { include: ['customer', 'items'] })
order.customer.name   // ✅
order.items[0].quantity  // ✅
```

Generated type implementation:

```typescript
type OrderRelations = {
  customer: Customer
  items: OrderItem[]
}

type WithRelations<I extends readonly (keyof OrderRelations)[]> =
  Order & Pick<OrderRelations, I[number]>

function useOrder<I extends readonly (keyof OrderRelations)[] = []>(
  id: string,
  options?: { include?: I }
): UseEntityResult<WithRelations<I>>
```

### 6. Loading State Semantics

**Important**: `data` can be an empty array `[]` while still loading.

Timeline example:
```
T=0ms    useOrders() called
T=1ms    useLiveQuery subscribes → data = []
T=2ms    Network request fires
T=500ms  Response received → data = [order1, order2, order3]
```

At T=1ms, `data = []` but we're still loading. Components **must** check `isLoading` first:

```tsx
function OrdersPage() {
  const { data, isLoading } = useOrders()

  if (isLoading) return <Spinner />        // Check loading FIRST
  if (data.length === 0) return <Empty />  // Only after load completes
  return <OrderTable orders={data} />
}
```

This enables distinct rendering for:
- **Loading**: Spinner/skeleton
- **Empty result**: "No orders found" message
- **Has data**: Render the table

---

## Usage Examples

### Basic List with Filters

```tsx
function ActiveOrdersPage() {
  const { data: orders, isLoading } = useOrders({
    where: { status: 'active' },
    orderBy: { created_at: 'desc' },
  })

  if (isLoading) return <Loading />
  return <OrderTable orders={orders} />
}
```

### Detail with Relationships

```tsx
function OrderDetailPage({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId, {
    include: ['customer', 'items'],
  })

  if (isLoading) return <Loading />
  if (!order) return <NotFound />

  return (
    <div>
      <h1>Order for {order.customer.name}</h1>
      <OrderItemsList items={order.items} />
    </div>
  )
}
```

### Optimistic Create

```tsx
function NewOrderForm() {
  const createOrder = useCreateOrder()
  const navigate = useNavigate()

  const handleSubmit = (data: OrderCreate) => {
    // UI updates INSTANTLY
    createOrder.mutate(data, {
      onSuccess: (order) => navigate(`/orders/${order.id}`),
      onError: () => toast.error('Failed to create order'),
    })
  }

  return (
    <OrderForm
      onSubmit={handleSubmit}
      isSubmitting={createOrder.isPending}
    />
  )
}
```

### Edit Form (Disable Auto-refresh)

```tsx
function OrderEditPage({ orderId }: { orderId: string }) {
  const [draft, setDraft] = useState<Order | null>(null)

  // Disable auto-refresh while editing to prevent data loss
  const { data: order } = useOrder(orderId, { autoRefresh: false })
  const updateOrder = useUpdateOrder()

  useEffect(() => {
    if (order && !draft) setDraft(order)
  }, [order])

  const handleSave = () => {
    if (!draft) return
    updateOrder.mutate(
      { id: orderId, data: draft },
      { onSuccess: () => navigate('/orders') }
    )
  }

  return (
    <OrderForm
      value={draft}
      onChange={setDraft}
      onSave={handleSave}
      isSaving={updateOrder.isPending}
    />
  )
}
```

### Multiple Entities with Shared Customer

```tsx
function CustomerDashboard({ customerId }: { customerId: string }) {
  // These queries share the customer from the same collection
  const { data: customer } = useCustomer(customerId)
  const { data: orders } = useOrders({
    where: { customer_id: customerId },
    include: ['customer'],  // Same customer object, not a copy
  })

  // Update customer name ONCE
  const updateCustomer = useUpdateCustomer()

  const handleRename = (name: string) => {
    updateCustomer.mutate({ id: customerId, data: { name } })
    // Both customer and orders.*.customer update instantly
    // because they reference the same object in the collection
  }

  return (
    <div>
      <CustomerHeader customer={customer} onRename={handleRename} />
      <OrderTable orders={orders} />
    </div>
  )
}
```

---

## App Setup

```tsx
// main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BroadcastProvider } from '@pattern-stack/sync-patterns/runtime'
import { initializeStore, configureApi } from './generated'

// Initialize store (in-memory for now, PGlite later)
initializeStore()

// Configure API client
configureApi({
  baseUrl: import.meta.env.VITE_API_URL,
  authToken: getAuthToken(),
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,  // 1 minute
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

---

## Implementation Plan

### Phase 1: Collection Generator

| Task | Est. Tests | Status |
|------|------------|--------|
| Define collection output types | 5 | Not Started |
| Generate collection files from EntityModel | 15 | Not Started |
| Generate relationship definitions | 10 | Not Started |
| Generate store.ts with all collections | 5 | Not Started |
| **Phase 1 Total** | **35** | |

### Phase 2: Entity Hook Generator

| Task | Est. Tests | Status |
|------|------------|--------|
| Generate query keys | 5 | Not Started |
| Generate internal sync hooks | 10 | Not Started |
| Generate useXxx list hook with live query | 15 | Not Started |
| Generate useXxx single item hook | 10 | Not Started |
| Generate useCreateXxx with optimistic update | 15 | Not Started |
| Generate useUpdateXxx with optimistic update | 15 | Not Started |
| Generate useDeleteXxx with optimistic update | 10 | Not Started |
| Broadcast integration in generated hooks | 5 | Not Started |
| **Phase 2 Total** | **85** | |

### Phase 3: CLI Integration

| Task | Status |
|------|--------|
| Add collection-generator to CLI pipeline | Not Started |
| Add entity-hook-generator to CLI pipeline | Not Started |
| Update --use-new-generators to include collections | Not Started |
| Integration test with sales-patterns spec | Not Started |

### Phase 4: Integration Example

| Task | Status |
|------|--------|
| Wire up sales-patterns Order entity | Not Started |
| Verify optimistic updates work | Not Started |
| Verify broadcast cross-client sync | Not Started |
| Document gotchas and patterns | Not Started |

---

## Migration Path

### From SYNC-012 (Query-only) to SYNC-014 (DB-first)

1. **No breaking changes to broadcast infrastructure**
   - BroadcastProvider, useBroadcastInvalidation unchanged

2. **Generated code is additive**
   - New `collections/` and `entities/` directories
   - Existing `hooks/` can remain for gradual migration

3. **Per-entity migration**
   ```tsx
   // Before (SYNC-012)
   import { useOrders } from './generated/hooks'

   // After (SYNC-014)
   import { useOrders } from './generated/entities'
   ```

4. **Same component API**
   - `useOrders()` returns `{ data, isLoading, error }`
   - No component changes needed

---

## Known Limitations (Phase 2)

These are explicitly out of scope for initial implementation:

### Conflict Resolution

Current behavior: **Server wins**. When broadcast triggers a refetch, server data overwrites local optimistic state.

```
User A: update order.status = 'shipped'
User B: update order.status = 'cancelled'  (at same time)
Broadcast: both clients refetch
Result: Both see server's final state (last write wins)
```

User A's optimistic update is silently replaced. For Phase 2, consider:
- Tracking pending optimistic mutations
- Detecting when server response differs from optimistic state
- Surfacing conflicts to the UI (toast, conflict resolution modal)

### Cache Eviction

Collections grow unbounded as entities are fetched. For long-running sessions:
- Consider TTL-based eviction for stale entities
- Or explicit `collection.clear()` on route changes
- Domain models stay in collection; metric/dashboard data uses Query cache only

---

## Future: Adding Persistence (Phase 2)

When offline becomes a requirement:

```typescript
// store.ts (generated, with persistence flag)
import { PGliteAdapter } from '@tanstack/db-pglite'

export function initializeStore(options?: { persist?: boolean }) {
  const adapter = options?.persist
    ? new PGliteAdapter({ database: 'app-data' })
    : undefined

  return createStore({
    adapter,
    collections: { ... },
  })
}
```

```tsx
// main.tsx
initializeStore({ persist: true })  // Data survives refresh
```

**No other changes needed.** Components use the same hooks.

---

## Validation Commands

```bash
cd sync-patterns

# Run all tests
npm run test

# Type-check generated code
npm run typecheck

# Generate from sales-patterns spec
npm run build && sync-patterns generate ../sales-patterns/openapi.json --output ./test-output

# Verify output
ls -la ./test-output/collections/
ls -la ./test-output/entities/
```

---

## References

- [TanStack DB Documentation](https://tanstack.com/db/latest)
- [TanStack DB React Integration](https://tanstack.com/db/latest/docs/react)
- [SYNC-010: Generator Architecture](./SYNC-010-generator-rebuild.md)
- [SYNC-012: Broadcast + Optimistic Sync](./SYNC-012-broadcast-optimistic-sync.md)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-28 | Initial draft |
| 2025-12-29 | Added: Include typing with conditional types (§5), Loading state semantics (§6), Known Limitations section |
