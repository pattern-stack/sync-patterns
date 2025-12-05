# SYNC-006: entities-hook.tsx Generator

## Overview

Generate `entities-hook.tsx` that provides `useEntities()` - a type-safe, entity-agnostic hook for accessing all entities with local-first sync support.

## Problem Statement

React's rules of hooks prevent conditional or dynamic hook calls:
- Cannot call hooks inside event handlers
- Cannot call hooks conditionally
- Must call same hooks in same order every render

This conflicts with entity-agnostic pages (like Admin) that need to work with any entity dynamically.

## Solution Architecture

**Key Insight:** Separate queries from mutations:
- **Mutations** → Call ALL mutation hooks inside `useEntities()`, return results
- **Queries** → Return hook references, consumer calls them (lazy evaluation)

This satisfies React rules while enabling dynamic entity access.

## Generated Output

### File: `src/generated/entities-hook.tsx`

```typescript
/**
 * Entity API Hook
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import type { ColumnMetadata } from '@pattern-stack/frontend-patterns'
import { useEntityData } from '@pattern-stack/frontend-patterns'
import type { UnifiedQueryResult, UnifiedMutationResult } from './entities/types'

// Entity-specific imports (generated per entity)
import {
  useAccounts,
  useAccount,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  type AccountOwner,
  type AccountCreate,
  type AccountUpdate,
} from './entities/accounts'

import {
  useActivitys,
  useActivity,
  useCreateActivity,
  type ActivityOwner,
} from './entities/activities'

import {
  useFiles,
  useFile,
  useDeleteFile,
  type FileResponse,
} from './entities/files'

// ============================================================================
// Types
// ============================================================================

interface MetadataResult {
  columns: ColumnMetadata[]
  isLoading: boolean
}

/**
 * Generic entity API shape.
 * Queries are hook references (consumer calls them).
 * Mutations are results (already called inside useEntities).
 */
export interface EntityApi<
  TList = unknown,
  TOne = unknown,
  TCreate = unknown,
  TUpdate = unknown,
> {
  /** Fetch all entities - hook reference, consumer calls */
  useList: () => UnifiedQueryResult<TList[]>
  /** Fetch single entity by ID - hook reference, consumer calls */
  useOne: (id: string) => UnifiedQueryResult<TOne | undefined>
  /** Fetch column metadata - hook reference, consumer calls */
  useMetadata: (view?: 'list' | 'detail' | 'form') => MetadataResult
  /** Create mutation - result, already initialized */
  create?: UnifiedMutationResult<TOne, TCreate>
  /** Update mutation - result, already initialized */
  update?: UnifiedMutationResult<TOne, { id: string; data: TUpdate }>
  /** Delete mutation - result, already initialized */
  delete?: UnifiedMutationResult<void, string>
}

// Typed API aliases (generated per entity)
export type AccountsApi = EntityApi<AccountOwner, AccountOwner, AccountCreate, AccountUpdate>
export type ActivitiesApi = EntityApi<ActivityOwner, ActivityOwner, Record<string, unknown>, never>
export type FilesApi = EntityApi<FileResponse, FileResponse, never, never>

/**
 * Complete entities interface with typed access and dynamic lookup.
 */
export interface Entities {
  accounts: AccountsApi
  activities: ActivitiesApi
  files: FilesApi
  /** Dynamic entity lookup by name */
  get: (name: string) => EntityApi | undefined
}

// ============================================================================
// Metadata Hook Factory
// ============================================================================

function createMetadataHook(entityName: string) {
  return function useMetadata(view: 'list' | 'detail' | 'form' = 'list'): MetadataResult {
    const { columns, isLoadingMetadata } = useEntityData(entityName, { view })
    return {
      columns,
      isLoading: isLoadingMetadata,
    }
  }
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Access all entity APIs with full TypeScript support.
 *
 * Mutations are called INSIDE this hook and returned as results.
 * Queries stay as hook references - consumer must call them.
 *
 * @example
 * // Known entity - full autocomplete and type safety
 * const { accounts } = useEntities()
 * const { data, isLoading } = accounts.useList()           // Query - call it
 * await accounts.create.mutateAsync(data)                  // Mutation - use directly
 *
 * @example
 * // Dynamic entity - for entity-agnostic pages
 * const { get } = useEntities()
 * const api = get(entityName)
 * if (api?.delete) {
 *   await api.delete.mutateAsync(id)
 * }
 */
export function useEntities(): Entities {
  // Call ALL mutation hooks unconditionally at top level (React rules)
  const accountsCreate = useCreateAccount()
  const accountsUpdate = useUpdateAccount()
  const accountsDelete = useDeleteAccount()
  const activitiesCreate = useCreateActivity()
  const filesDelete = useDeleteFile()

  // Build entity APIs - queries are hook references, mutations are results
  const accountsApi: AccountsApi = {
    useList: useAccounts,
    useOne: useAccount,
    useMetadata: createMetadataHook('accounts'),
    create: accountsCreate,
    update: accountsUpdate,
    delete: accountsDelete,
  }

  const activitiesApi: ActivitiesApi = {
    useList: useActivitys,
    useOne: useActivity,
    useMetadata: createMetadataHook('activities'),
    create: activitiesCreate,
  }

  const filesApi: FilesApi = {
    useList: useFiles,
    useOne: useFile,
    useMetadata: createMetadataHook('files'),
    delete: filesDelete,
  }

  // Registry for dynamic lookup
  const registry: Record<string, EntityApi<any, any, any, any>> = {
    accounts: accountsApi,
    activities: activitiesApi,
    files: filesApi,
  }

  return {
    accounts: accountsApi,
    activities: activitiesApi,
    files: filesApi,
    get: (name: string) => registry[name],
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

const ENTITY_NAMES = ['accounts', 'activities', 'files'] as const

export function hasEntity(name: string): boolean {
  return ENTITY_NAMES.includes(name as any)
}

export function getEntityNames(): string[] {
  return [...ENTITY_NAMES]
}
```

### Update: `src/generated/index.ts`

Add export:
```typescript
export { useEntities, hasEntity, getEntityNames, type Entities, type EntityApi } from './entities-hook'
```

## Generator Inputs

For each entity discovered in OpenAPI spec:

| Input | Source | Example |
|-------|--------|---------|
| Entity name | Path prefix `/api/v1/{entity}` | `accounts` |
| List type | GET response schema | `AccountOwner` |
| Detail type | GET `/{id}` response schema | `AccountOwner` |
| Create type | POST request body schema | `AccountCreate` |
| Update type | PATCH/PUT request body schema | `AccountUpdate` |
| Has create | POST endpoint exists | `true` |
| Has update | PATCH/PUT endpoint exists | `true` |
| Has delete | DELETE endpoint exists | `true` |
| Sync mode | `x-sync.local_first` extension | `realtime` \| `api` |

## Generator Algorithm

```
1. Parse OpenAPI spec
2. Group endpoints by entity (path prefix)
3. For each entity:
   a. Detect CRUD operations from HTTP methods
   b. Extract request/response type names
   c. Generate import statement from ./entities/{name}
   d. Generate typed EntityApi alias
   e. Track which mutations exist

4. Generate useEntities() body:
   a. For each entity with mutations:
      - Generate mutation hook calls (unconditional)
   b. For each entity:
      - Generate API object with:
        - useList, useOne, useMetadata (hook references)
        - create, update, delete (mutation results if they exist)
   c. Generate registry object
   d. Generate return statement

5. Generate utility functions with ENTITY_NAMES array

6. Update index.ts exports
```

## Consumer Usage

### Known Entity (Full TypeScript DX)

```typescript
import { useEntities } from '@/generated'

function AccountsPage() {
  const { accounts } = useEntities()

  // Queries - consumer calls the hook
  const { data, isLoading, refetch } = accounts.useList()
  const { columns } = accounts.useMetadata('list')

  // Mutations - use directly (already initialized)
  const handleCreate = async (data: AccountCreate) => {
    await accounts.create.mutateAsync(data)
    refetch()
  }

  const handleDelete = async (id: string) => {
    await accounts.delete.mutateAsync(id)
    refetch()
  }
}
```

### Dynamic Entity (Entity-Agnostic Pages)

```typescript
import { useEntities } from '@/generated'

function AdminPage() {
  const { entity } = useParams()
  const { get, accounts } = useEntities()

  // Fallback ensures hooks always called in same order
  const api = get(entity) ?? accounts

  const { data, isLoading } = api.useList()
  const { columns } = api.useMetadata('list')

  const handleDelete = async (id: string) => {
    if (api.delete) {
      await api.delete.mutateAsync(id)
    }
  }
}
```

## Why This Pattern Works

### React Rules Compliance

1. `useEntities()` is a custom hook ✅
2. Inside it, ALL mutation hooks called unconditionally ✅
3. Same hooks, same order, every render ✅
4. Consumer gets results, not hooks to call ✅

### Performance Considerations

- Mutation hooks are lightweight (no fetch until triggered)
- Queries stay lazy (only fetched when consumer calls)
- Small entity count makes eager mutation init acceptable
- React Query/TanStack DB handle deduplication

### Type Safety

- Each entity has typed API alias
- Full autocomplete on known entities
- Dynamic `get()` returns generic EntityApi
- Mutations typed with correct input/output

## Related Specs

- SYNC-001: Sync architecture overview
- SYNC-003: Entity barrel generator (unified wrappers)
- SYNC-005: Frontend patterns integration

## Implementation Status

- [x] Pattern validated in sales-patterns
- [ ] Generator template created
- [ ] CLI integration
- [ ] Tests added
