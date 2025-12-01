# SPEC: Client-Side Architecture for sync-patterns

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-002 |
| **Title** | Client-Side Sync Architecture |
| **Status** | Draft (Revised) |
| **Created** | 2025-12-01 |
| **Revised** | 2025-12-01 |
| **Phase** | 1 |
| **Depends On** | [SYNC-001](SYNC-001-backend-patterns-integration.md) |
| **See Also** | [SYNC-004](SYNC-004-unified-entity-generation.md), [ADR-007](../adr/007-unified-entity-wrappers.md) |

---

## Revision Note

> **This spec has been revised.** The original spec described a DIY "Pattern 4: Through-the-Database" approach with manual shadow tables, views, and triggers. After evaluating TanStack DB's Electric collection integration, we determined that TanStack DB handles optimistic state management internally, eliminating the need for manual schema generation.
>
> See [TanStack DB Electric Collection docs](https://tanstack.com/db/latest/docs/collections/electric-collection) for the approach we're now using.

---

## Executive Summary

This specification defines the client-side architecture for sync-patterns: how generated code integrates with TanStack DB and ElectricSQL to provide local-first data synchronization with optimistic mutations.

### Goals

1. Define how TanStack DB collections integrate with ElectricSQL
2. Specify the optimistic vs confirmed write flows
3. Document the transaction ID (`txid`) coordination pattern
4. Establish the dual-path architecture (TanStack DB vs TanStack Query)

### Non-Goals

- Manual PGlite schema generation (TanStack DB handles this internally)
- DIY shadow tables and triggers (superseded by TanStack DB)
- iOS/Android native implementation (Phase 3)
- Custom conflict resolution beyond "backend wins" (Phase 3)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         React App                                 │   │
│  │                                                                   │   │
│  │   import { useContacts } from '@/generated/entities/contacts'    │   │
│  │                              │                                    │   │
│  │                              ▼                                    │   │
│  │   ┌─────────────────────────────────────────────────────────┐    │   │
│  │   │              Unified Entity Wrapper                      │    │   │
│  │   │         (generated, abstracts mode selection)            │    │   │
│  │   └─────────────────────┬───────────────────┬───────────────┘    │   │
│  │                         │                   │                     │   │
│  │         local_first: true          local_first: false            │   │
│  │                         │                   │                     │   │
│  │                         ▼                   ▼                     │   │
│  │   ┌─────────────────────────┐   ┌─────────────────────────┐     │   │
│  │   │      TanStack DB        │   │    TanStack Query       │     │   │
│  │   │   + Electric Collection │   │    (standard hooks)     │     │   │
│  │   └───────────┬─────────────┘   └───────────┬─────────────┘     │   │
│  │               │                             │                    │   │
│  └───────────────│─────────────────────────────│────────────────────┘   │
│                  │                             │                        │
│                  ▼                             ▼                        │
│   ┌──────────────────────────┐   ┌──────────────────────────┐          │
│   │   Electric ShapeStream   │   │      API Client          │          │
│   │   (real-time sync)       │   │      (axios)             │          │
│   └───────────┬──────────────┘   └───────────┬──────────────┘          │
│               │                              │                          │
└───────────────│──────────────────────────────│──────────────────────────┘
                │                              │
                ▼                              ▼
       ┌───────────────┐              ┌───────────────┐
       │  ElectricSQL  │◄────────────►│   REST API    │
       │   (service)   │              │               │
       └───────┬───────┘              └───────┬───────┘
               │                              │
               └──────────────┬───────────────┘
                              ▼
                    ┌─────────────────┐
                    │    Postgres     │
                    │ (source of truth)│
                    └─────────────────┘
```

---

## TanStack DB Integration

### How TanStack DB Manages State

TanStack DB internally maintains two layers:

1. **Synced data** - Immutable state from ElectricSQL
2. **Optimistic state** - Local mutations not yet confirmed

Live queries see optimistic state overlaid on synced data. When mutations are confirmed (via `txid` matching), optimistic state is dropped.

**We do NOT generate:**
- Shadow tables (`{entity}_local`)
- Unified views
- INSTEAD OF triggers
- Change log tables
- Sync workers

TanStack DB handles all of this internally.

### Electric Collection Definition

For each entity with `local_first: true`, we generate:

```typescript
// src/generated/collections/contacts.ts

import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { getElectricUrl } from '../config'
import { ContactSchema } from '../schemas/contact.schema'
import { contactsApi } from '../client/contacts'

export const contactsCollection = createCollection(
  electricCollectionOptions({
    id: 'contacts',

    // Electric shape configuration
    shapeOptions: {
      url: `${getElectricUrl()}/v1/shape`,
      params: {
        table: 'contacts',
        // Additional params (tenant filtering, etc.) can be added
      },
    },

    getKey: (item) => item.id,
    schema: ContactSchema,

    // Mutation handlers - call YOUR API, return txid
    onInsert: async ({ transaction }) => {
      const item = transaction.mutations[0].modified
      const response = await contactsApi.create(item)
      return { txid: response.txid }
    },

    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0]
      const response = await contactsApi.update(original.id, changes)
      return { txid: response.txid }
    },

    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0]
      const response = await contactsApi.delete(original.id)
      return { txid: response.txid }
    },
  })
)
```

---

## Write Flows

### Optimistic Mode (`local_first: true`)

```
User clicks "Save"
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 1. TanStack DB applies optimistic state         │
│    - Collection internally tracks mutation      │
│    - Live queries immediately reflect change    │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 2. UI updates instantly                          │
│    - Component re-renders with new data         │
│    - User sees their change immediately         │
└─────────────────────────────────────────────────┘
       │
       ▼ (async, in background)
┌─────────────────────────────────────────────────┐
│ 3. Mutation handler executes                     │
│    - onInsert/onUpdate/onDelete calls API       │
│    - API writes to Postgres                     │
│    - API returns { txid } from pg_current_xact_id() │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 4. Electric syncs from Postgres                 │
│    - Change appears in synced data              │
│    - TanStack DB matches txid                   │
│    - Optimistic state dropped                   │
└─────────────────────────────────────────────────┘
```

### Confirmed Mode (`local_first: false`)

```
User clicks "Save"
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 1. TanStack Query mutation starts               │
│    - isPending = true                           │
│    - UI can show loading state                  │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 2. API call executes                             │
│    - POST/PATCH/DELETE to backend               │
│    - Waits for response                         │
└─────────────────────────────────────────────────┘
       │
       ├─── Success ───┐
       │               ▼
       │    ┌─────────────────────────────────────┐
       │    │ 3a. Query invalidation              │
       │    │     - Refetch or update cache       │
       │    │     - UI shows confirmed data       │
       │    └─────────────────────────────────────┘
       │
       └─── Failure ───┐
                       ▼
            ┌─────────────────────────────────────┐
            │ 3b. Error handling                  │
            │     - UI shows error message        │
            │     - No local state to roll back   │
            └─────────────────────────────────────┘
```

---

## Transaction ID Coordination

For optimistic mode to work correctly, the backend must return a `txid` that TanStack DB uses to coordinate the optimistic state lifecycle.

### Backend Requirement

```python
# backend-patterns API endpoint

from sqlalchemy import text

@router.post("/contacts", response_model=ContactResponse)
async def create_contact(data: ContactCreate, db: Session = Depends(get_db)):
    contact = Contact(**data.dict())
    db.add(contact)
    db.flush()

    # Get transaction ID for sync coordination
    # MUST be in same transaction as the write
    txid = db.execute(text("SELECT pg_current_xact_id()::text")).scalar()

    db.commit()

    return ContactResponse(
        **contact.to_dict(),
        txid=txid,  # Required for TanStack DB
    )
```

### How txid Matching Works

1. Client mutation calls API → API returns `{ data, txid }`
2. Mutation handler returns `{ txid }` to TanStack DB
3. Electric syncs the change from Postgres
4. TanStack DB matches the synced data's transaction to the pending `txid`
5. When matched, optimistic state is dropped

---

## Generated Output Structure

```
src/generated/
├── schemas/                    # Zod schemas (all entities)
│   ├── contact.schema.ts
│   └── index.ts
│
├── client/                     # API client (all entities)
│   ├── client.ts               # Axios instance configuration
│   ├── contact.ts              # Contact API methods
│   └── index.ts
│
├── hooks/                      # TanStack Query hooks (all entities)
│   ├── contact.ts              # useContactQuery, useCreateContactMutation, etc.
│   ├── keys.ts                 # Query key factory
│   └── index.ts
│
├── collections/                # TanStack DB collections (local_first: true only)
│   ├── contact.ts              # contactCollection with Electric integration
│   └── index.ts
│
├── entities/                   # Unified wrappers (all entities)
│   ├── contact.ts              # useContacts, useCreateContact, etc.
│   └── index.ts
│
├── config.ts                   # Runtime configuration
└── index.ts                    # Main exports
```

---

## Configuration

### Runtime Config

```typescript
// src/generated/config.ts

interface SyncConfig {
  electricUrl: string
  defaultLocalFirst: boolean
  entities: Record<string, boolean>
}

// Defaults baked in from OpenAPI x-sync at generation time
let config: SyncConfig = {
  electricUrl: '',
  defaultLocalFirst: false,
  entities: {
    contacts: true,   // from x-sync.local_first: true
    accounts: true,
    analytics: false,
  }
}

export function configureSync(overrides: Partial<SyncConfig>): void
export function isLocalFirst(entity: string): boolean
export function getElectricUrl(): string
```

### App Initialization

```typescript
// main.tsx

import { configureSync } from '@/generated/config'

configureSync({
  electricUrl: import.meta.env.VITE_ELECTRIC_URL ?? '',
})
```

---

## Error Handling

### Optimistic Mode Errors

When a mutation handler throws, TanStack DB automatically rolls back optimistic state:

```typescript
onUpdate: async ({ transaction }) => {
  try {
    const response = await contactsApi.update(...)
    return { txid: response.txid }
  } catch (error) {
    // TanStack DB will roll back optimistic state
    throw error
  }
}
```

The consuming app can handle errors via transaction state:

```typescript
const tx = contactsCollection.update(id, changes)
tx.isPersisted.promise.catch((error) => {
  // Show error to user
  toast.error('Failed to save changes')
})
```

### Confirmed Mode Errors

Standard TanStack Query error handling:

```typescript
const mutation = useCreateContact()

mutation.mutate(data, {
  onError: (error) => {
    toast.error('Failed to create contact')
  }
})
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('Collection Generation', () => {
  it('generates Electric collection with correct shape options', () => {
    const output = generateCollection(contactEntity)
    expect(output).toContain('electricCollectionOptions')
    expect(output).toContain("table: 'contacts'")
  })

  it('includes all mutation handlers', () => {
    const output = generateCollection(contactEntity)
    expect(output).toContain('onInsert')
    expect(output).toContain('onUpdate')
    expect(output).toContain('onDelete')
  })
})
```

### Integration Tests

```typescript
describe('Optimistic Write Flow', () => {
  it('applies optimistic state immediately', async () => {
    configureSync({ electricUrl: 'http://localhost:3000' })

    const { result } = renderHook(() => useContacts())
    const createContact = renderHook(() => useCreateContact())

    act(() => {
      createContact.result.current.mutate({ first_name: 'Test' })
    })

    // Should appear immediately (optimistic)
    expect(result.current.data).toContainEqual(
      expect.objectContaining({ first_name: 'Test' })
    )
  })
})
```

---

## Migration from Original SYNC-002

If you implemented the original Pattern 4 approach with manual shadow tables:

1. **Remove** generated SQL schemas (`_synced`, `_local` tables, views, triggers)
2. **Remove** custom sync worker code
3. **Regenerate** with new sync-patterns CLI
4. **Update imports** to use unified entity wrappers
5. **Add** `configureSync()` call at app startup

---

## Related Documents

- [SYNC-001: Backend-Patterns Integration](SYNC-001-backend-patterns-integration.md)
- [SYNC-004: Unified Entity Generation](SYNC-004-unified-entity-generation.md)
- [ADR-007: Unified Entity Wrappers](../adr/007-unified-entity-wrappers.md)
- [ADR-005: Local Database Selection](../adr/005-local-database-selection.md)
- [TanStack DB Electric Collection](https://tanstack.com/db/latest/docs/collections/electric-collection)
- [ElectricSQL Documentation](https://electric-sql.com/docs)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-01 | Initial draft with DIY Pattern 4 approach |
| 2025-12-01 | **Revised**: Replaced DIY approach with TanStack DB integration |
