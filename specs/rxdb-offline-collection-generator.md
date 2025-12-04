# Implementation Spec: RxDB Offline Collection Generator

## Overview

Extend the sync-patterns generator to support **RxDB** as an optional persistence layer for offline-first entities. This is **additive**—the existing ElectricSQL + TanStack DB path remains the primary, fastest option.

## Problem Statement

### Current State

The sync-patterns generator uses `@tanstack/electric-db-collection` which provides **sub-millisecond reactivity** but stores data in-memory only:

```
Postgres → ElectricSQL → TanStack DB (memory) → React UI
                              ↑
                         <1ms reactivity ✅
                         Lost on refresh ❌
```

### Goal State

Add a **third mode** for entities that need true offline persistence:

```
realtime mode (PRIMARY - unchanged):
Postgres → ElectricSQL → TanStack DB (memory) → React UI
                              ↑
                         <1ms reactivity ✅

offline mode (NEW - opt-in):
Postgres → RxDB Replication → IndexedDB → TanStack DB → React UI
                                   ↑
                              ~5-20ms, survives refresh ✅
```

**Key principle**: The fast path stays fast. RxDB is opt-in per entity.

## Architecture Decision

### Three Sync Modes

| Mode | Storage | Sync Engine | Latency | Use Case |
|------|---------|-------------|---------|----------|
| `api` | None | TanStack Query | Network RTT | Server-only (files, sensitive data) |
| `realtime` | Memory | ElectricSQL | <1ms | Dashboards, live feeds, collaborative |
| `offline` | IndexedDB | RxDB Replication | ~5-20ms | Core data that must survive offline |

### When to Use Each Mode

| Entity Type | Recommended Mode | Rationale |
|-------------|------------------|-----------|
| File attachments | `api` | Too large for IndexedDB, server-authoritative |
| Activity feeds | `realtime` | Ephemeral, reconstructed on refresh |
| Live dashboards | `realtime` | Stale in seconds anyway |
| Collaborative cursors | `realtime` | Presence data, no persistence needed |
| Accounts/Contacts | `offline` | Core CRM data, must work on airplane |
| User preferences | `offline` | Should survive refresh |
| Draft documents | `offline` | User expects to not lose work |

### Why RxDB for Offline Mode

| Criteria | RxDB | Dexie | PGlite |
|----------|------|-------|--------|
| TanStack adapter | **Official** | Community | Community |
| Replication | **Built-in** (REST, GraphQL) | Manual | Electric only |
| Cross-tab sync | **Yes** | No | No |
| Bundle size | ~50KB | ~20KB | ~3.7MB |
| Maturity | 40+ releases | Stable | Early |

RxDB chosen for official TanStack support and built-in replication.

## Technical Design

### Package Dependencies

```json
{
  "dependencies": {
    "@tanstack/db": "^0.5.x",
    "@tanstack/react-db": "^0.5.x",
    "@tanstack/electric-db-collection": "^0.1.x",
    "@tanstack/rxdb-db-collection": "^0.1.x",
    "rxdb": "^16.x"
  }
}
```

Note: We use `@tanstack/react-db` hooks consistently (not `rxdb-hooks`) to maintain a unified API.

### Generated Output Structure

```
src/generated/
├── db/
│   ├── electric-init.ts          # ElectricSQL initialization (existing)
│   ├── rxdb-init.ts              # RxDB database initialization (new)
│   └── schemas/
│       ├── accounts.schema.ts    # RxDB JSON schema
│       └── index.ts
├── collections/
│   ├── accounts.realtime.ts      # ElectricSQL collection (mode: realtime)
│   ├── accounts.offline.ts       # RxDB collection (mode: offline)
│   └── index.ts
├── entities/
│   ├── accounts.ts               # Unified wrapper (3-mode)
│   ├── types.ts                  # UnifiedQueryResult, UnifiedMutationResult
│   └── index.ts
├── providers/
│   ├── SyncProvider.tsx          # React context for sync state
│   └── index.ts
├── hooks/                        # TanStack Query hooks (for 'api' mode)
│   └── ...
├── config.ts                     # SyncMode configuration
└── index.ts
```

### Configuration

#### OpenAPI Extension

```yaml
paths:
  /accounts:
    x-sync:
      mode: offline      # 'api' | 'realtime' | 'offline'
  /activities:
    x-sync:
      mode: realtime     # Fast in-memory sync
  /files:
    x-sync:
      mode: api          # Server-only
```

#### Backward Compatibility

```yaml
# Legacy format still works
x-sync:
  local_first: true   # Maps to 'realtime' (preserves existing behavior)
  local_first: false  # Maps to 'api'
```

#### Generated Config Module

```typescript
// src/generated/config.ts

export type SyncMode = 'api' | 'realtime' | 'offline'

export interface ReplicationConfig {
  initialRetryDelay: number   // Starting delay in ms (default: 1000)
  maxRetryDelay: number       // Maximum delay cap in ms (default: 300000 = 5min)
  backoffMultiplier: number   // Multiplier for exponential backoff (default: 2)
  resetOnOnline: boolean      // Reset delay when browser comes online (default: true)
}

export interface SyncConfig {
  apiUrl: string
  electricUrl: string
  authTokenKey: string
  syncMode: Record<string, SyncMode>
  replication: ReplicationConfig
  onAuthError?: () => void
  onQuotaExceeded?: (entity: string, error: Error) => void
  onSyncError?: (entity: string, error: Error) => void
}

const defaultReplicationConfig: ReplicationConfig = {
  initialRetryDelay: 1000,
  maxRetryDelay: 300000,
  backoffMultiplier: 2,
  resetOnOnline: true,
}

let config: SyncConfig = {
  apiUrl: import.meta.env?.VITE_API_URL ?? '/api/v1',
  electricUrl: import.meta.env?.VITE_ELECTRIC_URL ?? 'http://localhost:5133',
  authTokenKey: 'auth_token',
  syncMode: {
    accounts: 'offline',
    activities: 'realtime',
    memories: 'offline',
    files: 'api',
  },
  replication: defaultReplicationConfig,
}

export function getSyncMode(entity: string): SyncMode {
  return config.syncMode[entity] ?? 'api'
}

export function configureSync(overrides: Partial<SyncConfig>): void {
  config = {
    ...config,
    ...overrides,
    syncMode: { ...config.syncMode, ...overrides.syncMode },
    replication: { ...config.replication, ...overrides.replication },
  }
}

export function getReplicationConfig(): ReplicationConfig {
  return config.replication
}

export function getOnQuotaExceeded(): ((entity: string, error: Error) => void) | undefined {
  return config.onQuotaExceeded
}

export function getOnSyncError(): ((entity: string, error: Error) => void) | undefined {
  return config.onSyncError
}

export function getApiUrl(): string {
  return config.apiUrl
}

export function getElectricUrl(): string {
  return config.electricUrl
}

// Cached token getter with refresh support
let cachedToken: string | null = null
let tokenExpiry: number = 0

export function getAuthToken(): string {
  if (typeof localStorage === 'undefined') return ''

  const now = Date.now()
  if (cachedToken && tokenExpiry > now) {
    return cachedToken
  }

  cachedToken = localStorage.getItem(config.authTokenKey) ?? ''
  // Assume 5 minute cache, actual expiry should be parsed from JWT
  tokenExpiry = now + 5 * 60 * 1000
  return cachedToken
}

export function clearTokenCache(): void {
  cachedToken = null
  tokenExpiry = 0
}

export function getOnAuthError(): (() => void) | undefined {
  return config.onAuthError
}
```

### Sync Provider (React Context)

```typescript
// src/generated/providers/SyncProvider.tsx

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { RxDatabase } from 'rxdb'
import type { AppDatabase } from '../db/rxdb-init'

interface SyncState {
  // Database instances
  rxdb: AppDatabase | null

  // Connection status
  isOnline: boolean
  isSyncing: boolean
  lastSyncedAt: Date | null

  // Pending mutations count (offline queue)
  pendingMutations: number

  // Error state
  syncError: Error | null
  quotaExceeded: boolean  // True if IndexedDB quota was hit (fell back to realtime)

  // Actions
  forceSync: () => Promise<void>
  clearLocalData: () => Promise<void>
}

const SyncContext = createContext<SyncState | null>(null)

export function useSyncState(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) {
    throw new Error('useSyncState must be used within SyncProvider')
  }
  return ctx
}

export function useIsOnline(): boolean {
  const { isOnline } = useSyncState()
  return isOnline
}

export function usePendingMutations(): number {
  const { pendingMutations } = useSyncState()
  return pendingMutations
}

interface SyncProviderProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function SyncProvider({ children, fallback }: SyncProviderProps): JSX.Element {
  const [rxdb, setRxdb] = useState<AppDatabase | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [pendingMutations, setPendingMutations] = useState(0)
  const [syncError, setSyncError] = useState<Error | null>(null)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Initialize RxDB
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const { getRxDatabase } = await import('../db/rxdb-init')
        const db = await getRxDatabase()

        if (mounted) {
          setRxdb(db)
          setIsInitialized(true)
          console.log('[sync] RxDB initialized')
        }
      } catch (err) {
        if (mounted) {
          setSyncError(err as Error)
          setIsInitialized(true) // Still mark as initialized so app can render
          console.error('[sync] RxDB init failed:', err)
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  const forceSync = useCallback(async () => {
    if (!rxdb || !isOnline) return

    setIsSyncing(true)
    try {
      // Trigger replication sync for all collections
      // Implementation depends on replication state access
      setLastSyncedAt(new Date())
    } catch (err) {
      setSyncError(err as Error)
    } finally {
      setIsSyncing(false)
    }
  }, [rxdb, isOnline])

  const clearLocalData = useCallback(async () => {
    if (!rxdb) return

    // Clear all collections
    const collections = Object.values(rxdb.collections)
    await Promise.all(collections.map(col => col.remove()))

    console.log('[sync] Local data cleared')
  }, [rxdb])

  const value: SyncState = {
    rxdb,
    isOnline,
    isSyncing,
    lastSyncedAt,
    pendingMutations,
    syncError,
    quotaExceeded,
    forceSync,
    clearLocalData,
  }

  if (!isInitialized && fallback) {
    return <>{fallback}</>
  }

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  )
}
```

### RxDB Database Initialization

```typescript
// src/generated/db/rxdb-init.ts

import { createRxDatabase, addRxPlugin, RxCollection } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election'
import { replicateRxCollection } from 'rxdb/plugins/replication'
import { accountsSchema, AccountDocument } from './schemas/accounts.schema'
import { memoriesSchema, MemoryDocument } from './schemas/memories.schema'
import { getApiUrl, getAuthToken, getOnAuthError, clearTokenCache } from '../config'

// Enable cross-tab leader election
addRxPlugin(RxDBLeaderElectionPlugin)

// Typed collection interfaces
export type AccountsCollection = RxCollection<AccountDocument>
export type MemoriesCollection = RxCollection<MemoryDocument>

export interface AppDatabase {
  accounts: AccountsCollection
  memories: MemoriesCollection
}

let dbPromise: Promise<AppDatabase> | null = null
let replicationStates: Map<string, any> = new Map()

export async function getRxDatabase(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = initDatabase()
  }
  return dbPromise
}

async function initDatabase(): Promise<AppDatabase> {
  const db = await createRxDatabase({
    name: 'dealbrain',
    storage: getRxStorageDexie(),
    multiInstance: true,
    eventReduce: true,
  })

  await db.addCollections({
    accounts: { schema: accountsSchema },
    memories: { schema: memoriesSchema },
  })

  // Start replication for each collection
  await startReplication(db as unknown as AppDatabase)

  return db as unknown as AppDatabase
}

async function startReplication(db: AppDatabase): Promise<void> {
  // Replication for accounts
  const accountsReplication = replicateRxCollection({
    collection: db.accounts,
    replicationIdentifier: 'accounts-backend-sync',

    push: {
      batchSize: 10,
      async handler(changeRows) {
        const apiUrl = getApiUrl()
        const conflicts: any[] = []

        for (const row of changeRows) {
          const doc = row.newDocumentState
          const wasDeleted = row.assumedMasterState && !doc

          try {
            if (wasDeleted) {
              await apiRequest('DELETE', `${apiUrl}/accounts/${row.assumedMasterState.id}`)
            } else if (!row.assumedMasterState) {
              // New document
              await apiRequest('POST', `${apiUrl}/accounts`, doc)
            } else {
              // Update
              await apiRequest('PATCH', `${apiUrl}/accounts/${doc.id}`, doc)
            }
          } catch (err: any) {
            if (err.status === 409) {
              // Conflict - server has different version
              conflicts.push(row)
            } else {
              throw err
            }
          }
        }

        return conflicts
      },
    },

    pull: {
      batchSize: 100,
      async handler(lastCheckpoint, batchSize) {
        const apiUrl = getApiUrl()
        const since = lastCheckpoint?.updatedAt ?? '1970-01-01T00:00:00Z'

        const response = await apiRequest(
          'GET',
          `${apiUrl}/accounts?updated_since=${encodeURIComponent(since)}&limit=${batchSize}`
        )

        const docs = response.data
        const newCheckpoint = docs.length > 0
          ? { updatedAt: docs[docs.length - 1].updated_at }
          : lastCheckpoint

        return {
          documents: docs,
          checkpoint: newCheckpoint,
        }
      },
    },

    live: true,
    retryTime: 5000,
    autoStart: true,
  })

  replicationStates.set('accounts', accountsReplication)

  // Similar for memories...
  const memoriesReplication = replicateRxCollection({
    collection: db.memories,
    replicationIdentifier: 'memories-backend-sync',
    push: {
      batchSize: 10,
      async handler(changeRows) {
        const apiUrl = getApiUrl()
        const conflicts: any[] = []

        for (const row of changeRows) {
          const doc = row.newDocumentState
          const wasDeleted = row.assumedMasterState && !doc

          try {
            if (wasDeleted) {
              await apiRequest('DELETE', `${apiUrl}/memories/${row.assumedMasterState.id}`)
            } else if (!row.assumedMasterState) {
              await apiRequest('POST', `${apiUrl}/memories`, doc)
            } else {
              await apiRequest('PATCH', `${apiUrl}/memories/${doc.id}`, doc)
            }
          } catch (err: any) {
            if (err.status === 409) {
              conflicts.push(row)
            } else {
              throw err
            }
          }
        }

        return conflicts
      },
    },
    pull: {
      batchSize: 100,
      async handler(lastCheckpoint, batchSize) {
        const apiUrl = getApiUrl()
        const since = lastCheckpoint?.updatedAt ?? '1970-01-01T00:00:00Z'

        const response = await apiRequest(
          'GET',
          `${apiUrl}/memories?updated_since=${encodeURIComponent(since)}&limit=${batchSize}`
        )

        const docs = response.data
        return {
          documents: docs,
          checkpoint: docs.length > 0
            ? { updatedAt: docs[docs.length - 1].updated_at }
            : lastCheckpoint,
        }
      },
    },
    live: true,
    retryTime: 5000,
    autoStart: true,
  })

  replicationStates.set('memories', memoriesReplication)
}

// Helper for authenticated API requests with error handling
async function apiRequest(
  method: string,
  url: string,
  body?: unknown
): Promise<{ data: any; status: number }> {
  const token = getAuthToken()

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401) {
    clearTokenCache()
    getOnAuthError()?.()
    throw { status: 401, message: 'Unauthorized' }
  }

  if (!response.ok) {
    throw { status: response.status, message: await response.text() }
  }

  const data = response.status === 204 ? null : await response.json()
  return { data, status: response.status }
}

export function getReplicationState(collection: string) {
  return replicationStates.get(collection)
}

export async function pauseReplication(): Promise<void> {
  for (const state of replicationStates.values()) {
    await state.cancel()
  }
}

export async function resumeReplication(): Promise<void> {
  for (const state of replicationStates.values()) {
    state.reSync()
  }
}

export async function destroyDatabase(): Promise<void> {
  await pauseReplication()
  replicationStates.clear()

  if (dbPromise) {
    const db = await dbPromise
    await db.destroy()
    dbPromise = null
  }
}
```

### RxDB Schema Generation (with Versioning)

```typescript
// src/generated/db/schemas/accounts.schema.ts

import { RxJsonSchema } from 'rxdb'

export interface AccountDocument {
  id: string
  name: string
  state: string
  is_active: boolean
  owner_user_id: string | null
  email: string | null
  phone: string | null
  industry: string | null
  annual_revenue: number | null
  created_at: string
  updated_at: string
  _deleted?: boolean
}

export const ACCOUNTS_SCHEMA_VERSION = 0

export const accountsSchema: RxJsonSchema<AccountDocument> = {
  version: ACCOUNTS_SCHEMA_VERSION,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    name: { type: 'string', maxLength: 255 },
    state: { type: 'string', maxLength: 50 },
    is_active: { type: 'boolean' },
    owner_user_id: { type: ['string', 'null'], maxLength: 36 },
    email: { type: ['string', 'null'], maxLength: 255, format: 'email' },
    phone: { type: ['string', 'null'], maxLength: 50 },
    industry: { type: ['string', 'null'], maxLength: 100 },
    annual_revenue: { type: ['number', 'null'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'name', 'state', 'is_active', 'created_at', 'updated_at'],
  indexes: ['state', 'updated_at', 'owner_user_id'],
}

// Migration strategies for future schema changes
export const accountsMigrations = {
  // Example: version 0 → 1 migration
  // 1: (oldDoc: any) => {
  //   return {
  //     ...oldDoc,
  //     new_field: 'default_value',
  //   }
  // },
}
```

### RxDB Collection (TanStack DB Integration)

```typescript
// src/generated/collections/accounts.offline.ts

import { createCollection } from '@tanstack/db'
import { rxdbCollectionOptions } from '@tanstack/rxdb-db-collection'
import { getRxDatabase } from '../db/rxdb-init'
import type { AccountDocument } from '../db/schemas/accounts.schema'

export const accountsOfflineCollection = createCollection<AccountDocument>(
  rxdbCollectionOptions({
    getRxCollection: async () => {
      const db = await getRxDatabase()
      return db.accounts
    },
    getKey: (item) => item.id,
  })
)
```

### Entity Wrapper (3-Mode)

```typescript
// src/generated/entities/accounts.ts

import { useQuery, useMutation } from '@tanstack/react-db'
import { getSyncMode } from '../config'
import { accountsRealtimeCollection } from '../collections/accounts.realtime'
import { accountsOfflineCollection } from '../collections/accounts.offline'
import * as apiHooks from '../hooks/index'
import type { AccountCreate, AccountOwner, AccountUpdate } from '../schemas/index'
import type { UnifiedQueryResult, UnifiedMutationResult } from './types'

// Re-export schemas
export type { AccountCreate, AccountOwner, AccountUpdate } from '../schemas/index'
export { AccountCreateSchema, AccountOwnerSchema } from '../schemas/index'

// Get the right collection based on mode
function getCollection() {
  const mode = getSyncMode('accounts')
  if (mode === 'offline') return accountsOfflineCollection
  if (mode === 'realtime') return accountsRealtimeCollection
  return null // api mode doesn't use collections
}

/**
 * Fetch all accounts.
 * - api: TanStack Query (network)
 * - realtime: ElectricSQL collection (memory, <1ms)
 * - offline: RxDB collection (IndexedDB, ~5-20ms)
 */
export function useAccounts(): UnifiedQueryResult<AccountOwner[]> {
  const mode = getSyncMode('accounts')
  const collection = getCollection()

  // For realtime and offline modes, use TanStack DB's useQuery
  const collectionQuery = useQuery({
    collection: collection!,
    query: { where: {} },
    enabled: mode !== 'api' && collection !== null,
  })

  // For api mode, use TanStack Query
  const apiQuery = apiHooks.useListAccounts({ enabled: mode === 'api' })

  if (mode === 'api') {
    return {
      data: apiQuery.data as AccountOwner[] | undefined,
      isLoading: apiQuery.isLoading,
      error: (apiQuery.error as Error) ?? null,
    }
  }

  return {
    data: collectionQuery.data as AccountOwner[] | undefined,
    isLoading: collectionQuery.isLoading,
    error: (collectionQuery.error as Error) ?? null,
  }
}

/**
 * Fetch a single account by ID.
 */
export function useAccount(id: string): UnifiedQueryResult<AccountOwner | undefined> {
  const mode = getSyncMode('accounts')
  const collection = getCollection()

  const collectionQuery = useQuery({
    collection: collection!,
    query: { where: { id } },
    enabled: mode !== 'api' && collection !== null && !!id,
  })

  const apiQuery = apiHooks.useGetAccountFullContext(
    { account_id: id },
    { enabled: mode === 'api' && !!id }
  )

  if (mode === 'api') {
    return {
      data: apiQuery.data as AccountOwner | undefined,
      isLoading: apiQuery.isLoading,
      error: (apiQuery.error as Error) ?? null,
    }
  }

  return {
    data: collectionQuery.data?.[0] as AccountOwner | undefined,
    isLoading: collectionQuery.isLoading,
    error: (collectionQuery.error as Error) ?? null,
  }
}

/**
 * Create a new account.
 */
export function useCreateAccount(): UnifiedMutationResult<AccountOwner, AccountCreate> {
  const mode = getSyncMode('accounts')
  const collection = getCollection()

  // Collection mutation (realtime or offline)
  const collectionMutation = useMutation({
    collection: collection!,
    mutationFn: async (data: AccountCreate) => {
      const now = new Date().toISOString()
      const doc = {
        ...data,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        is_active: true,
        state: 'active',
      }
      await collection!.insert(doc)
      return doc as unknown as AccountOwner
    },
    enabled: mode !== 'api' && collection !== null,
  })

  // API mutation
  const apiMutation = apiHooks.useCreateAccount()

  if (mode === 'api') {
    return {
      mutate: apiMutation.mutate,
      mutateAsync: apiMutation.mutateAsync as (data: AccountCreate) => Promise<AccountOwner>,
      isPending: apiMutation.isPending,
      error: (apiMutation.error as Error) ?? null,
    }
  }

  return {
    mutate: collectionMutation.mutate,
    mutateAsync: collectionMutation.mutateAsync,
    isPending: collectionMutation.isPending,
    error: (collectionMutation.error as Error) ?? null,
  }
}

/**
 * Update an existing account.
 */
export function useUpdateAccount(): UnifiedMutationResult<
  AccountOwner,
  { id: string; data: AccountUpdate }
> {
  const mode = getSyncMode('accounts')
  const collection = getCollection()

  const collectionMutation = useMutation({
    collection: collection!,
    mutationFn: async ({ id, data }: { id: string; data: AccountUpdate }) => {
      const doc = await collection!.update(id, (current) => ({
        ...current,
        ...data,
        updated_at: new Date().toISOString(),
      }))
      return doc as unknown as AccountOwner
    },
    enabled: mode !== 'api' && collection !== null,
  })

  const apiMutation = apiHooks.useUpdateAccountWithTracking()

  if (mode === 'api') {
    return {
      mutate: ({ id, data }) => apiMutation.mutate({ pathParams: { account_id: id }, ...data }),
      mutateAsync: async ({ id, data }) =>
        apiMutation.mutateAsync({ pathParams: { account_id: id }, ...data }) as Promise<AccountOwner>,
      isPending: apiMutation.isPending,
      error: (apiMutation.error as Error) ?? null,
    }
  }

  return {
    mutate: collectionMutation.mutate,
    mutateAsync: collectionMutation.mutateAsync,
    isPending: collectionMutation.isPending,
    error: (collectionMutation.error as Error) ?? null,
  }
}

/**
 * Delete an account.
 */
export function useDeleteAccount(): UnifiedMutationResult<void, string> {
  const mode = getSyncMode('accounts')
  const collection = getCollection()

  const collectionMutation = useMutation({
    collection: collection!,
    mutationFn: async (id: string) => {
      await collection!.delete(id)
    },
    enabled: mode !== 'api' && collection !== null,
  })

  const apiMutation = apiHooks.useArchiveAccount()

  if (mode === 'api') {
    return {
      mutate: (id) => apiMutation.mutate({ pathParams: { account_id: id } }),
      mutateAsync: async (id) => {
        await apiMutation.mutateAsync({ pathParams: { account_id: id } })
      },
      isPending: apiMutation.isPending,
      error: (apiMutation.error as Error) ?? null,
    }
  }

  return {
    mutate: collectionMutation.mutate,
    mutateAsync: collectionMutation.mutateAsync,
    isPending: collectionMutation.isPending,
    error: (collectionMutation.error as Error) ?? null,
  }
}
```

### Unified Types

```typescript
// src/generated/entities/types.ts

export interface UnifiedQueryResult<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
}

export interface UnifiedMutationResult<TData, TInput> {
  mutate: (input: TInput) => void
  mutateAsync: (input: TInput) => Promise<TData>
  isPending: boolean
  error: Error | null
}
```

### App Initialization

```typescript
// src/main.tsx

import { SyncProvider } from './generated/providers/SyncProvider'
import { configureSync } from './generated/config'

// Configure sync (can override generated defaults)
configureSync({
  apiUrl: import.meta.env.VITE_API_URL || '/api/v1',
  electricUrl: import.meta.env.VITE_ELECTRIC_URL || 'http://localhost:5133',

  // Sync mode per entity
  syncMode: {
    accounts: 'offline',     // Persist for offline
    activities: 'realtime',  // Fast in-memory
    memories: 'offline',     // Persist for offline
    files: 'api',           // Server-only
  },

  // Replication settings (smart defaults, override if needed)
  replication: {
    initialRetryDelay: 1000,     // 1 second
    maxRetryDelay: 300000,       // 5 minutes max
    backoffMultiplier: 2,
    resetOnOnline: true,
  },

  // Event callbacks
  onAuthError: () => {
    window.location.href = '/login'
  },
  onQuotaExceeded: (entity, error) => {
    // Monitor this - should be rare!
    console.warn(`[sync] Quota exceeded for ${entity}:`, error)
    analytics?.track('sync_quota_exceeded', { entity })
  },
  onSyncError: (entity, error) => {
    console.error(`[sync] Sync error for ${entity}:`, error)
  },
})

// Wrap app in SyncProvider
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SyncProvider fallback={<div>Initializing sync...</div>}>
      <App />
    </SyncProvider>
  </StrictMode>
)
```

## Generator Changes

### 1. Parser (`parser.ts`)

Update to extract `mode` and `schema_version` from OpenAPI:

```typescript
interface ParsedEndpoint {
  // Existing
  localFirst?: boolean

  // New
  syncMode?: 'api' | 'realtime' | 'offline'
}

function extractSyncConfig(operation: OpenAPIOperation): SyncConfig {
  const xSync = operation['x-sync']

  // New format
  if (xSync?.mode) {
    return { mode: xSync.mode }
  }

  // Legacy format (backward compat) - maps to realtime to preserve behavior
  if (xSync?.local_first === true) {
    return { mode: 'realtime' }
  }

  return { mode: 'api' }
}
```

### 2. New: RxDB Schema Generator (`rxdb-schema-generator.ts`)

Generate RxDB JSON schemas from OpenAPI schemas with versioning support.

### 3. New: RxDB Init Generator (`rxdb-init-generator.ts`)

Generate database initialization with proper replication using `replicateRxCollection`.

### 4. New: Sync Provider Generator (`sync-provider-generator.ts`)

Generate React context with online/offline detection.

### 5. Update: Collection Generator (`collection-generator.ts`)

- Generate `*.realtime.ts` for `mode: realtime` (ElectricSQL)
- Generate `*.offline.ts` for `mode: offline` (RxDB)

### 6. Update: Entity Generator (`entity-generator.ts`)

Generate 3-mode wrappers with proper `isPending` tracking.

### 7. Update: Config Generator (`config-generator.ts`)

Generate `SyncMode` type with 3 options, `ReplicationConfig` interface, and callback getters.

### 8. New: Schema Check Command (`commands/schema-check.ts`)

CLI command to detect schema drift:

```typescript
// sync-patterns schema:check --input openapi.yaml

interface SchemaCheckResult {
  entity: string
  currentVersion: number
  suggestedVersion: number
  changes: {
    added: string[]
    removed: string[]
    modified: string[]
  }
}

function checkSchemaVersions(spec: OpenAPISpec): SchemaCheckResult[] {
  // Compare OpenAPI schemas against stored hashes
  // Return list of entities with schema drift
}
```

**Flags**:
- `--input <file>` - OpenAPI spec file (required)
- `--fix` - Auto-update schema_version in OpenAPI spec
- `--strict` - Exit with error code if drift detected (for future CI)

## Implementation Phases

### Phase 1: Core Infrastructure (6 hours)
1. Add RxDB dependencies to sync-patterns
2. Create `rxdb-schema-generator.ts` with versioning
3. Create `rxdb-init-generator.ts` with proper `replicateRxCollection`
4. Update parser for 3-mode + schema_version extraction
5. Create `schema:check` CLI command

### Phase 2: Provider & State (4 hours)
1. Create `sync-provider-generator.ts`
2. Generate SyncProvider with online/offline detection
3. Add token caching and auth error handling

### Phase 3: Collection Generation (4 hours)
1. Update `collection-generator.ts` for dual output
2. Generate `.realtime.ts` (ElectricSQL - unchanged)
3. Generate `.offline.ts` (RxDB - new)

### Phase 4: Entity Wrappers (4 hours)
1. Update `entity-generator.ts` for 3-mode
2. Use consistent TanStack React-DB hooks
3. Proper `isPending` and `error` tracking

### Phase 5: Config & Init (2 hours)
1. Update `config-generator.ts` for 3 modes
2. Generate app initialization template
3. Document configuration options

### Phase 6: Testing (6 hours)
1. Unit tests for each generator
2. Integration test: generate → compile → type-check
3. E2E test: offline mutation → come online → sync
4. Cross-tab sync test

### Phase 7: Documentation (3 hours)
1. Create ADR: `007-three-mode-sync.md`
2. Update CLAUDE.md
3. Update README with mode selection guide
4. Add troubleshooting guide

## Migration Path for sales-patterns

After generator is updated:

1. **Keep ElectricSQL code** (it's the fast path):
   ```bash
   # Don't remove these!
   # src/generated/collections/accounts.realtime.ts stays
   ```

2. **Update OpenAPI spec with explicit modes:**
   ```yaml
   paths:
     /accounts:
       x-sync:
         mode: offline     # Add persistence
     /activities:
       x-sync:
         mode: realtime    # Keep fast in-memory
     /files:
       x-sync:
         mode: api         # Server-only
   ```

3. **Regenerate:**
   ```bash
   npx sync-patterns generate --input ../backend/openapi.yaml --output src/generated
   ```

4. **Install RxDB (only if using offline mode):**
   ```bash
   npm install rxdb @tanstack/rxdb-db-collection
   ```

5. **Wrap app in SyncProvider:**
   ```typescript
   import { SyncProvider } from './generated/providers/SyncProvider'

   <SyncProvider>
     <App />
   </SyncProvider>
   ```

6. **Remove manual Dexie code:**
   ```bash
   rm -rf src/lib/electric-dexie-bridge.ts
   npm uninstall dexie tanstack-dexie-db-collection
   ```

## Schema Migration Strategy

When OpenAPI schemas change:

1. **Generator increments schema version** when properties change
2. **Migration functions** are generated for each version bump
3. **RxDB applies migrations** automatically on database open

Example workflow:
```typescript
// Version 0 → 1: Added 'priority' field
export const accountsMigrations = {
  1: (oldDoc: any) => ({
    ...oldDoc,
    priority: 'normal', // default value
  }),
}
```

## Testing Checklist

**Parser & Config**
- [ ] Parser extracts `mode` from OpenAPI x-sync extension
- [ ] Parser extracts `schema_version` from OpenAPI x-sync extension
- [ ] Parser maps `local_first: true` → `realtime` (backward compat)
- [ ] Parser maps `local_first: false` → `api` (backward compat)
- [ ] `configureSync()` merges replication config correctly

**Schema & Generation**
- [ ] RxDB schema generator produces valid JSON schema
- [ ] Schema versioning exported as constant
- [ ] `schema:check` CLI detects added/removed/modified fields
- [ ] `schema:check --fix` updates schema_version in OpenAPI
- [ ] Generated code compiles without errors

**Replication**
- [ ] RxDB init uses `replicateRxCollection` (correct API)
- [ ] Exponential backoff on sync failure
- [ ] Backoff resets on browser `online` event
- [ ] Replication config overrides work
- [ ] 401 errors trigger `onAuthError` callback
- [ ] Auth token refresh during long-running sync

**SyncProvider**
- [ ] SyncProvider detects online/offline correctly
- [ ] `quotaExceeded` state set when IndexedDB full
- [ ] `onQuotaExceeded` callback fires (monitor this!)
- [ ] `onSyncError` callback fires on sync failures
- [ ] `forceSync()` triggers immediate sync
- [ ] `clearLocalData()` removes all IndexedDB data

**Entity Wrappers**
- [ ] Entity wrapper uses consistent TanStack React-DB hooks
- [ ] `isPending` tracks mutation state in all 3 modes
- [ ] `error` populated on failures

**Integration**
- [ ] ElectricSQL collections still work (<1ms) - NO REGRESSION
- [ ] RxDB collections persist to IndexedDB
- [ ] Data survives page refresh (offline mode)
- [ ] Replication syncs to backend API
- [ ] Cross-tab sync works (RxDB leader election)
- [ ] Offline mutation → come online → syncs correctly

## Success Criteria

1. Three modes work independently: `api`, `realtime`, `offline`
2. ElectricSQL path unchanged—sub-millisecond reactivity preserved
3. RxDB path adds persistence without affecting realtime path
4. Generated code uses correct, real APIs (no fictional methods)
5. SyncProvider gives components access to sync state
6. Schema migrations handle OpenAPI changes gracefully
7. sales-patterns can pick mode per-entity based on needs

## Design Decisions

### 1. Schema Versioning: Hybrid with CLI Detection

**Decision**: Auto-detect schema changes via CLI command, but require manual version bump.

**Rationale**: No deploy pipeline yet, so full automation isn't practical. CLI detection catches mistakes without requiring CI integration.

**Implementation**:
```bash
# CLI command to check for schema drift
sync-patterns schema:check --input openapi.yaml

# Output:
# ⚠️  Schema drift detected for 'accounts':
#    - Added field: priority (string)
#    - Removed field: legacy_id
#    Current version: 0
#    Suggested version: 1
#
# Run with --fix to update schema versions in place.
```

**OpenAPI extension**:
```yaml
x-sync:
  mode: offline
  schema_version: 1  # Manually bump when schema changes
```

**Future**: CI integration to auto-fail builds on schema drift without version bump.

---

### 2. Conflict Resolution: Last-Write-Wins

**Decision**: Last-write-wins based on `updated_at` timestamp.

**Rationale**: Simple, predictable, industry standard (Linear, Notion, etc.). Edge cases are rare enough to defer.

**Known limitation**: Long-term offline writes could overwrite newer server data. A device offline for days could "win" against recent changes.

**Future enhancement** (v2): Add `maxOfflineAge` config to reject stale writes:
```typescript
configureSync({
  // If device was offline > 24 hours, server wins on conflict
  maxOfflineAge: 24 * 60 * 60 * 1000, // 24 hours in ms
})
```

For v1, we accept the edge case risk. Most offline usage is minutes/hours, not days.

---

### 3. IndexedDB Quotas: Fallback + Warn + Monitor

**Decision**: Fall back to realtime mode, log warning, surface via SyncProvider, and provide monitoring callback.

**Rationale**: App must keep working, but we need visibility into occurrences. This should be rare—if it happens often, we need to address root cause.

**Implementation**:
```typescript
// In SyncProvider state
interface SyncState {
  // ... existing fields
  quotaExceeded: boolean  // True if storage quota was hit
}

// In config
configureSync({
  onQuotaExceeded: (entity: string, error: Error) => {
    // Send to telemetry/monitoring
    analytics.track('sync_quota_exceeded', { entity, message: error.message })
  },
})
```

**Monitoring expectation**: This should fire ~0 times in normal usage. If it fires regularly, investigate:
- Are we storing too much data?
- Is user's browser restricted?
- Do we need LRU eviction?

---

### 4. Replication Backoff: Exponential with Online Reset

**Decision**: Exponential backoff with configurable limits, reset on `online` event.

**Configuration** (with smart defaults):
```typescript
configureSync({
  replication: {
    initialRetryDelay: 1000,     // Start at 1 second
    maxRetryDelay: 300000,       // Cap at 5 minutes
    backoffMultiplier: 2,        // Double each time
    resetOnOnline: true,         // Reset delay when browser comes online
  },
})
```

**Behavior**:
```
Failure 1: wait 1s
Failure 2: wait 2s
Failure 3: wait 4s
Failure 4: wait 8s
...
Failure N: wait 5min (capped)

Browser online event → reset to 1s, immediate retry
```

---

### 5. Partial Sync: Full Sync for v1

**Decision**: Sync all data on initial load.

**Rationale**: For typical CRM usage (~1000 accounts, ~10MB total), full sync is fast enough. Premature optimization adds complexity.

**Future** (v2): Add time-based windowing:
```yaml
x-sync:
  mode: offline
  sync_window: 90d  # Only sync last 90 days
```

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Core Infrastructure | 6 hours |
| Phase 2: Provider & State | 4 hours |
| Phase 3: Collection Generation | 4 hours |
| Phase 4: Entity Wrappers | 4 hours |
| Phase 5: Config & Init | 2 hours |
| Phase 6: Testing | 6 hours |
| Phase 7: Documentation | 3 hours |
| **Total** | **~29 hours (~3.5-4 days)** |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| `@tanstack/rxdb-db-collection` is v0.1.x | Pin version, test thoroughly, have fallback plan |
| RxDB bundle size (~50KB) | Only imported for entities using `offline` mode (code split) |
| Schema migrations break data | Test migrations with real data before release |
| ElectricSQL performance regression | Benchmark before/after, keep paths completely separate |
