# SYNC-009: Unified Query with Metadata (DRAFT)

> **Status**: DRAFT
> **Created**: 2025-12-09
> **Updated**: 2025-12-09
> **Author**: Claude + Dug

## Problem Statement

Currently, consuming entity data in components requires two separate calls:

```tsx
// Current usage (sales-patterns AdminPage.tsx)
const { data, isLoading } = entityApi.useList()
const { columns } = entityApi.useMetadata('list')

<DataTable
  data={data ?? []}
  columns={columns}
  isLoading={isLoading}
/>
```

This creates boilerplate and inconsistency. Components should receive a single query result that includes both data and column metadata.

## Goal

Generate `use{Entity}WithMeta()` hooks that return `UnifiedQueryResult<T[]>` extended with `columns: ColumnMetadata[]`, enabling:

```tsx
// Desired usage
const query = useAccountsWithMeta()

<DataTable query={query} />
// Component extracts: query.data, query.isLoading, query.error, query.columns
```

## Design

### Extended Query Result Type

```typescript
// In src/generated/entities/types.ts
export interface UnifiedQueryResultWithMeta<T> extends UnifiedQueryResult<T> {
  /** Column metadata for rendering tables/forms */
  columns: ColumnMetadata[]
  /** Whether metadata is still loading */
  isLoadingMetadata: boolean
  /** Metadata-specific error (if data succeeded but metadata failed) */
  metadataError: Error | null
  /** True when both data AND metadata are loaded */
  isReady: boolean
}
```

### Generated Hook Pattern

For each entity, generate a dedicated metadata hook and combine it with the data hook:

```typescript
// In src/generated/entities/accounts.ts

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiClient } from '../client'
import type { ColumnMetadata, ColumnMetadataResponse } from '@pattern-stack/frontend-patterns'
import type { UnifiedQueryResultWithMeta } from './types'

/**
 * Fetch column metadata for accounts.
 * Uses 30-minute staleTime since metadata rarely changes.
 */
function useAccountsMetadata(view: 'list' | 'detail' | 'form' = 'list') {
  const metadataQuery = useQuery({
    queryKey: ['accounts', 'metadata', view],
    queryFn: () => apiClient.get<ColumnMetadataResponse>(
      `/api/v1/accounts/fields/metadata?view=${view}`
    ),
    staleTime: 30 * 60 * 1000,  // 30 min - metadata is schema-driven, rarely changes
  })

  return {
    columns: metadataQuery.data?.columns ?? [],
    isLoading: metadataQuery.isLoading,
    error: metadataQuery.error ?? null,
  }
}

/**
 * Fetch all accounts with column metadata.
 * Combines sync-aware data query with metadata query.
 *
 * @example
 * const { data, columns, isReady, error } = useAccountsWithMeta()
 * if (!isReady) return <Loading />
 * return <DataTable query={query} />
 */
export function useAccountsWithMeta(
  options?: { view?: 'list' | 'detail' | 'form' }
): UnifiedQueryResultWithMeta<AccountOwner[]> {
  const { view = 'list' } = options ?? {}

  // Data query (sync-aware - uses TanStack DB, offline, or API)
  const query = useAccounts()

  // Metadata query (always API - metadata doesn't need sync)
  const meta = useAccountsMetadata(view)

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...query,
    columns: meta.columns,
    isLoadingMetadata: meta.isLoading,
    metadataError: meta.error,
    isReady: !query.isLoading && !meta.isLoading,
  }), [query, meta.columns, meta.isLoading, meta.error])
}
```

**Key Design Decisions:**

1. **Separate metadata hook** - `useEntityData` with `enabled: false` disables BOTH queries (confirmed via codebase exploration). We must use a dedicated metadata hook.

2. **30-minute staleTime** - Metadata is schema-driven and rarely changes during a session. The existing `useFieldMetadata` hook in frontend-patterns uses 30 minutes. We align with this.

3. **useMemo for return value** - Composite hooks that combine multiple query results create new objects every render. Memoization prevents cascading re-renders in consumers.

4. **Separate error handling** - `metadataError` allows components to handle metadata failures independently (e.g., show table with fallback columns if metadata fails but data succeeds).

5. **`isReady` convenience** - Combines both loading states for common "show loading until everything is ready" pattern.

### Update to entities-hook.tsx

The `EntityApi` interface gains a new method:

```typescript
export interface EntityApi<TList, TOne, TCreate, TUpdate> {
  // Existing
  useList: () => UnifiedQueryResult<TList[]>
  useOne: (id: string) => UnifiedQueryResult<TOne | undefined>
  useMetadata: (view?: 'list' | 'detail' | 'form') => MetadataResult
  create?: UnifiedMutationResult<TOne, TCreate>
  update?: UnifiedMutationResult<TOne, { id: string; data: TUpdate }>
  delete?: UnifiedMutationResult<void, string>

  // New
  useListWithMeta: (options?: { view?: 'list' | 'detail' | 'form' }) => UnifiedQueryResultWithMeta<TList[]>
}
```

## Frontend-Patterns Changes

### DataTable Props Extension

```typescript
// In frontend-patterns DataTable.types.ts
export interface DataTableProps<T> {
  // Existing - raw data mode
  data?: T[]
  columns?: DataTableColumn<T>[]
  isLoading?: boolean
  error?: Error | string | null

  // New - query mode
  query?: UnifiedQueryResultWithMeta<T[]>

  // ... rest unchanged
}
```

**Type Inference**: The generic `T` can be inferred from `query` if declared as:
```typescript
query?: { data: T[]; columns: ColumnMetadata[]; /* ... */ }
```

### DataTable Implementation

```typescript
// In frontend-patterns DataTable.tsx
export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  query,
  isLoading = false,
  error = null,
  ...props
}: DataTableProps<T>) {
  // Normalize: explicit props take precedence over query props
  // This allows overriding query.columns with custom columns
  const items = data ?? query?.data ?? []
  const cols = columns ?? query?.columns ?? []
  const loading = isLoading || query?.isLoading || query?.isLoadingMetadata
  const err = error ?? query?.error ?? query?.metadataError ?? null

  // Rest of component unchanged, uses items, cols, loading, err
}
```

**Override Precedence**: Explicit `columns` prop wins over `query.columns`, enabling:
```tsx
<DataTable query={query} columns={customColumns} />
```

**Note**: DataTable already normalizes `ColumnMetadata` → `Column<T>` internally (lines 47-66 in DataTable.tsx), so no additional normalization is needed.

## Usage Examples

### Simple List Page

```tsx
import { useAccountsWithMeta } from '@/generated/entities/accounts'
import { DataTable } from '@pattern-stack/frontend-patterns'

function AccountsPage() {
  const query = useAccountsWithMeta()

  return (
    <DataTable
      query={query}
      onRowClick={(row) => navigate(`/accounts/${row.id}`)}
      showSearch
    />
  )
}
```

### Entity-Agnostic Admin Page

```tsx
import { useEntities } from '@/generated'
import { DataTable } from '@pattern-stack/frontend-patterns'

function AdminPage() {
  const { entity } = useParams()
  const { get, accounts } = useEntities()
  const api = get(entity) ?? accounts

  const query = api.useListWithMeta()

  return (
    <DataTable
      query={query}
      onRowClick={handleEdit}
    />
  )
}
```

### Mixed Mode (Override Columns)

```tsx
// Use query for data/loading/error, but custom columns
const query = useAccountsWithMeta()

<DataTable
  query={query}
  columns={customColumns}  // Overrides query.columns
/>
```

### Handling Partial Failures

```tsx
const query = useAccountsWithMeta()

// Metadata failed but data succeeded - show with fallback columns
if (query.metadataError && query.data.length > 0) {
  return (
    <>
      <Alert>Column metadata unavailable</Alert>
      <DataTable data={query.data} columns={fallbackColumns} />
    </>
  )
}

// Normal path
return <DataTable query={query} />
```

## Implementation Tasks

### sync-patterns

1. [ ] Add `UnifiedQueryResultWithMeta<T>` type to `entities/types.ts` template
   - Include `columns`, `isLoadingMetadata`, `metadataError`, `isReady`
2. [ ] Generate `use{Entity}Metadata()` internal hook for each entity
   - 30-minute staleTime
   - Query key: `[entity, 'metadata', view]`
3. [ ] Generate `use{Entity}WithMeta()` hook for each entity
   - Combine data + metadata hooks
   - **Must use `useMemo`** for return value
4. [ ] Update `EntityApi` interface to include `useListWithMeta`
5. [ ] Update `entities-hook.tsx` generator to wire up new hooks
6. [ ] Add tests for generated hooks

### frontend-patterns

1. [ ] Add `query` prop to `DataTableProps`
   - Ensure generic `T` inference works
2. [ ] Update `DataTable` to normalize query vs raw data modes
   - Explicit props take precedence over query props
3. [ ] Combine loading states: `isLoading || query?.isLoading || query?.isLoadingMetadata`
4. [ ] Handle both `query.error` and `query.metadataError`
5. [ ] Update showcase/docs

### sales-patterns (validation)

1. [ ] Regenerate from updated sync-patterns
2. [ ] Refactor AdminPage to use `useListWithMeta()`
3. [ ] Verify DataTable works with query prop

## Decisions Made

### Q1: Should `useListWithMeta` be the default?
**Decision: No** - Keep explicit. Many use cases (dashboards, widgets) don't need columns. The separate hooks give consumers control.

### Q2: View parameter handling
**Decision**: Default to `'list'` for `useListWithMeta()`. Defer `useAccountWithMeta(id)` for detail views to a future spec - detail views have different requirements (singular data, `form`/`detail` view).

### Q3: Metadata caching strategy
**Decision**: Use 30-minute staleTime globally (aligned with existing `useFieldMetadata`). Metadata is schema-driven and rarely changes. Per-entity configuration is overkill - if needed later, add to `configureSync()`.

### Q4: Memoization
**Decision: Required** - Generated `use{Entity}WithMeta()` hooks MUST wrap return values in `useMemo`. Codebase exploration confirmed no existing hooks do this, causing unnecessary re-renders. This spec sets the precedent.

### Q5: Error handling
**Decision**: Expose both `error` (from data query) and `metadataError` (from metadata query). Use first-error-wins for combined error display, but allow independent handling when needed.

## Related Specs

- SYNC-005: Frontend patterns integration
- SYNC-006: entities-hook generator
- SYNC-004: Unified entity generation

## Appendix: Codebase Findings

Key findings from codebase exploration that informed this spec:

1. **`useEntityData` `enabled` option** - Disables BOTH data AND metadata queries. Cannot be used for metadata-only fetching.

2. **`useFieldMetadata` exists** - Frontend-patterns has a dedicated metadata hook with 30-min staleTime at `src/atoms/hooks/useFieldMetadata.ts`. We align with its caching strategy.

3. **DataTable column normalization** - Already handles `ColumnMetadata` → `Column<T>` conversion internally (lines 47-66). No additional work needed.

4. **No memoization in composite hooks** - Neither `useEntityData` nor `useEntities` memoize return values. This is a systemic issue; this spec establishes the pattern for generated hooks.

5. **Error handling pattern** - Existing hooks use first-error-wins: `dataQuery.error ?? metadataQuery.error ?? null`. We extend this with separate `metadataError` for granular control.
