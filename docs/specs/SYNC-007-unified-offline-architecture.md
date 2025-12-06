# SYNC-007: Unified Offline Architecture

> **Status**: Draft
> **Author**: Claude
> **Date**: 2025-12-05

## Executive Summary

This spec proposes removing RxDB from the sync-patterns stack and unifying all three sync modes under TanStack DB's official packages. The current implementation uses RxDB for "offline" mode, which introduces a separate paradigm, additional dependencies, and generated code that doesn't compile cleanly.

## Problem Statement

### Current Architecture (Broken)

| Mode | Implementation | Package | Persistence |
|------|----------------|---------|-------------|
| `api` | TanStack Query | `@tanstack/react-query` | None |
| `realtime` | TanStack DB + ElectricSQL | `@tanstack/react-db` + `@electric-sql/client` | In-memory |
| `offline` | **RxDB** | `rxdb` + `@tanstack/rxdb-db-collection` | IndexedDB |

### Problems with RxDB Approach

1. **Different paradigm**: RxDB has its own schema format, replication plugins, and APIs
2. **Generator complexity**: Produces ~500 lines of TypeScript with type errors
3. **Duplicate concepts**: RxDB replication vs TanStack DB mutation handlers
4. **Extra dependencies**: `rxdb` is 150KB+ minified
5. **Maintenance burden**: Two sync systems to understand and debug

### Why We Originally Chose RxDB

Looking at the TanStack DB docs, we likely chose RxDB because:

1. **Official integration exists**: `@tanstack/rxdb-db-collection` is an official package
2. **IndexedDB persistence**: RxDB provides robust IndexedDB storage with migrations
3. **Replication built-in**: RxDB has battle-tested sync plugins

However, we missed that **TanStack DB has its own official offline solution**.

## Discovery: Official Offline Support

TanStack DB provides `@tanstack/offline-transactions` with:

```typescript
import {
  startOfflineExecutor,
  IndexedDBAdapter,
  LocalStorageAdapter
} from "@tanstack/offline-transactions"

const executor = startOfflineExecutor({
  collections: { todos: todoCollection },
  storage: new IndexedDBAdapter("my-app", "transactions"),
  mutationFns: {
    syncTodos: async ({ transaction, idempotencyKey }) => {
      await api.saveBatch(transaction.mutations, { idempotencyKey })
    },
  },
})
```

### Key Features

| Feature | `@tanstack/offline-transactions` | RxDB |
|---------|----------------------------------|------|
| IndexedDB storage | `IndexedDBAdapter` | Built-in |
| Leader election | Built-in | Built-in |
| Retry with backoff | Built-in | Plugin |
| Idempotency keys | Built-in | Manual |
| Works with TanStack DB | Native | Via wrapper |
| Bundle size | ~15KB | ~150KB |

## Proposed Architecture

### New Unified Approach

| Mode | Implementation | Package | Persistence |
|------|----------------|---------|-------------|
| `api` | TanStack Query | `@tanstack/react-query` | None |
| `realtime` | TanStack DB + ElectricSQL | `@tanstack/react-db` + `@electric-sql/client` | In-memory |
| `offline` | TanStack DB + **OfflineExecutor** | `@tanstack/react-db` + `@tanstack/offline-transactions` | IndexedDB |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Code                             │
│  useAccounts(), useCreateAccount(), etc.                        │
├─────────────────────────────────────────────────────────────────┤
│              Generated Unified Wrappers (entities/)              │
│  Chooses implementation based on getSyncMode(entity)            │
├────────────────┬────────────────┬───────────────────────────────┤
│   api mode     │  realtime mode │        offline mode           │
│                │                │                               │
│  TanStack      │  TanStack DB   │  TanStack DB                  │
│  Query hooks   │  + Electric    │  + OfflineExecutor            │
│                │  Collection    │  + IndexedDBAdapter           │
│                │                │                               │
│  No local      │  In-memory     │  IndexedDB                    │
│  persistence   │  (via Electric)│  (survives refresh)           │
├────────────────┴────────────────┴───────────────────────────────┤
│                    Generated Schemas (Zod)                       │
├─────────────────────────────────────────────────────────────────┤
│                    Generated API Client                          │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Query Collection (api mode)

No changes needed. Current implementation works.

```typescript
const accountsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
    queryClient,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      await api.accounts.create(transaction.mutations[0].modified)
    },
    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0]
      await api.accounts.update(original.id, changes)
    },
    onDelete: async ({ transaction }) => {
      await api.accounts.delete(transaction.mutations[0].key)
    },
  })
)
```

### 2. Electric Collection (realtime mode)

No changes needed. Current implementation works.

```typescript
const accountsCollection = createCollection(
  electricCollectionOptions({
    id: 'accounts',
    schema: AccountSchema,
    getKey: (item) => item.id,
    shapeOptions: {
      url: `${ELECTRIC_URL}/v1/shape`,
      params: { table: 'accounts' },
    },
    onInsert: async ({ transaction }) => {
      const response = await api.accounts.create(transaction.mutations[0].modified)
      return { txid: response.txid }
    },
    // ... similar for update/delete
  })
)
```

### 3. Offline Collection (NEW - replaces RxDB)

```typescript
import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { startOfflineExecutor, IndexedDBAdapter } from '@tanstack/offline-transactions'

// Base collection using Query
const accountsCollection = createCollection(
  queryCollectionOptions({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
    queryClient,
    getKey: (item) => item.id,
  })
)

// Wrap with offline executor
const offlineExecutor = startOfflineExecutor({
  collections: { accounts: accountsCollection },
  storage: new IndexedDBAdapter('app-db', 'transactions'),
  mutationFns: {
    syncAccounts: async ({ transaction, idempotencyKey }) => {
      for (const mutation of transaction.mutations) {
        switch (mutation.type) {
          case 'insert':
            await api.accounts.create(mutation.modified, { idempotencyKey })
            break
          case 'update':
            await api.accounts.update(mutation.key, mutation.changes, { idempotencyKey })
            break
          case 'delete':
            await api.accounts.delete(mutation.key, { idempotencyKey })
            break
        }
      }
      // Refetch to get server state
      await accountsCollection.utils.refetch()
    },
  },
  onLeadershipChange: (isLeader) => {
    if (!isLeader) {
      console.warn('Running in online-only mode (another tab is leader)')
    }
  },
})

// Create offline-aware actions
export const createAccount = offlineExecutor.createOfflineAction({
  mutationFnName: 'syncAccounts',
  onMutate: (data: AccountCreate) => {
    const newAccount = { ...data, id: crypto.randomUUID() }
    accountsCollection.insert(newAccount)
    return newAccount
  },
})

export const updateAccount = offlineExecutor.createOfflineAction({
  mutationFnName: 'syncAccounts',
  onMutate: ({ id, changes }: { id: string; changes: Partial<Account> }) => {
    accountsCollection.update(id, (draft) => {
      Object.assign(draft, changes)
    })
  },
})

export const deleteAccount = offlineExecutor.createOfflineAction({
  mutationFnName: 'syncAccounts',
  onMutate: (id: string) => {
    accountsCollection.delete(id)
  },
})
```

## Generator Changes

### Files to Remove

```
src/generators/rxdb-init-generator.ts      # ~600 lines
src/generators/rxdb-schema-generator.ts    # ~400 lines
```

### Files to Modify

```
src/generators/entity-generator.ts         # Replace RxDB with OfflineExecutor
src/generators/collection-generator.ts     # Simplify - no RxDB collections
src/generators/config-generator.ts         # Remove RxDB-specific config
```

### New Generated Structure

```
src/generated/
├── schemas/           # Zod schemas (unchanged)
├── client/            # API client (unchanged)
├── hooks/             # TanStack Query hooks (unchanged)
├── collections/
│   ├── accounts.query.ts      # queryCollectionOptions (api mode)
│   └── accounts.electric.ts   # electricCollectionOptions (realtime mode)
├── offline/
│   ├── executor.ts            # startOfflineExecutor setup
│   └── accounts.actions.ts    # createOfflineAction wrappers
├── entities/
│   └── accounts.ts            # Unified wrapper (chooses by mode)
├── config.ts
└── index.ts
```

## Migration Path

### Phase 1: Fix Current Build (Quick)

1. Remove broken RxDB-generated code from sales-patterns
2. Set all entities to `api` mode temporarily
3. Get builds passing

### Phase 2: Implement New Offline (This Spec)

1. Add `@tanstack/offline-transactions` dependency
2. Update entity-generator to produce OfflineExecutor code
3. Remove RxDB generators entirely
4. Test with accounts entity in offline mode

### Phase 3: Validate All Modes

1. Test `api` mode (should work as-is)
2. Test `realtime` mode with ElectricSQL
3. Test `offline` mode with new OfflineExecutor
4. Verify cross-tab sync and persistence

## Dependencies

### Remove

```json
{
  "rxdb": "^16.x",
  "@tanstack/rxdb-db-collection": "^0.x"
}
```

### Add

```json
{
  "@tanstack/offline-transactions": "^0.x"
}
```

### Bundle Size Impact

| Package | Size (min+gzip) |
|---------|-----------------|
| rxdb | ~45KB |
| @tanstack/rxdb-db-collection | ~5KB |
| **Total removed** | **~50KB** |
| @tanstack/offline-transactions | ~5KB |
| **Net savings** | **~45KB** |

## Open Questions

1. **LocalStorage fallback**: Should we support `LocalStorageAdapter` as fallback when IndexedDB fails?

2. **Per-entity executors**: Should each entity have its own executor, or one global executor?
   - Recommendation: One global executor with per-entity mutation functions

3. **Offline status UI**: How do we expose `offlineExecutor.isOfflineEnabled` and pending count to UI?
   - Recommendation: Generate a `useOfflineStatus()` hook

4. **Conflict resolution**: What happens when offline mutations conflict with server state?
   - Current: Last-write-wins via refetch
   - Future: Could add custom conflict handlers

## Success Criteria

1. All three modes (`api`, `realtime`, `offline`) work with unified API
2. `useLiveQuery` works identically for `realtime` and `offline` modes
3. No RxDB dependencies in generated code
4. Bundle size reduced by ~45KB
5. Generated TypeScript compiles without errors
6. Offline mutations persist across page refresh
7. Cross-tab leader election works

## References

- [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)
- [Offline Transactions README](https://github.com/tanstack/db/blob/main/packages/offline-transactions/README.md)
- [Query Collection Docs](https://tanstack.com/db/latest/docs/collections/query-collection)
- [Electric Collection Docs](https://tanstack.com/db/latest/docs/collections/electric-collection)
- [RxDB Collection Docs](https://tanstack.com/db/latest/docs/collections/rxdb-collection) (for reference)
