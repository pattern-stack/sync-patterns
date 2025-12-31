# Entity Reference Resolution Specification

## Overview

Enable foreign key fields to automatically resolve and render referenced entities using centralized cache lookup with smart prefetching.

**Goal:** `category_id` (UUID) → renders as "Groceries" badge with icon, via cache lookup.

---

## Architecture Decision

### Normalized (Central Resolution) vs Denormalized (Inline)

**We choose: Normalized with central resolution.**

| Concern | Normalized | Denormalized |
|---------|------------|--------------|
| Cache invalidation | 1 place | N places |
| Event-driven updates | Natural | Complex |
| Data transfer | Minimal | Redundant |
| Local DB ready | Yes | No |
| Complexity | Resolution logic | Cache sync logic |

The resolution logic is generated, so complexity cost is low.

---

## Data Flow

```
Backend Model          OpenAPI Spec              sync-patterns           Frontend
─────────────────────────────────────────────────────────────────────────────────
Field(UUID,            x-ui-type: entity    →   ColumnMetadata.reference   →   EntityCell
  foreign_key=         x-ui-reference:          { entity, displayField }       resolves from
  "categories.id",       entity: categories                                    query cache
  ui_type="entity")
```

---

## 1. Backend Contract (OpenAPI Extensions)

### Source: Field Definition
```python
class Transaction(EventPattern):
    category_id = Field(
        UUID,
        foreign_key="categories.id",  # Source of truth for relationship
        ui_type="entity",             # Triggers entity resolution
        ui_importance="high"
    )
```

### Output: OpenAPI Schema
```yaml
Transaction:
  properties:
    category_id:
      type: string
      format: uuid
      x-ui-type: entity
      x-ui-importance: high
      x-ui-reference:
        entity: categories        # Derived from foreign_key
        # displayField NOT here - sync-patterns derives from target entity
```

### Open Question: Should backend include displayField?

**Option A: Backend derives and includes it**
- Backend knows Category.UIConfig.title_field = "name"
- Includes in x-ui-reference: { entity: categories, displayField: name }
- Simpler for sync-patterns

**Option B: sync-patterns derives it**
- Parses all entities first
- Looks up target entity's config.titleField
- More complex but single source of truth

**Recommendation: Option A** - Backend has the info, include it.

---

## 2. ColumnMetadata Extension

### Current
```typescript
interface ColumnMetadata {
  field: string
  label: string
  type: UIType  // includes 'entity'
  importance: UIImportance
  // ... other fields
}
```

### Proposed Addition
```typescript
interface ColumnMetadata {
  // ... existing fields

  /**
   * Present when type === 'entity'
   * Contains resolution info for FK references
   */
  reference?: EntityReference
}

interface EntityReference {
  /** Target entity name (plural): "categories", "accounts" */
  entity: string

  /** Field to display from resolved entity: "name", "title" */
  displayField: string

  /**
   * Optional: endpoint to fetch single entity
   * Default: /{entity}/{id}
   */
  endpoint?: string
}
```

### Pseudocode: Column Generation
```typescript
// In ColumnMetadataGenerator
function generateColumn(prop: PropertyDefinition): ColumnMetadata {
  const column: ColumnMetadata = {
    field: prop.name,
    type: prop.uiType ?? inferType(prop),
    // ... other fields
  }

  // Add reference info for entity type
  if (prop.uiType === 'entity' && prop.uiReference) {
    column.reference = {
      entity: prop.uiReference.entity,
      displayField: prop.uiReference.displayField ?? 'name',
    }
  }

  return column
}
```

---

## 3. EntityResolver Updates

### Parsing x-ui-reference

```typescript
// In extractPropertyDefinition()
private extractPropertyDefinition(fieldName: string, schema: SchemaObject): PropertyDefinition {
  const ext = schema as Record<string, unknown>

  return {
    // ... existing fields

    // NEW: Parse x-ui-reference
    uiReference: ext['x-ui-reference'] as {
      entity: string
      displayField?: string
    } | undefined,
  }
}
```

### PropertyDefinition Extension
```typescript
interface PropertyDefinition {
  // ... existing
  uiReference?: {
    entity: string
    displayField?: string
  }
}
```

---

## 4. EntityStore Design

### Why EntityStore?

Rather than using TanStack Query cache directly with stringly-typed keys, we generate a typed facade that provides:

1. **Per-entity typed access** - `store.categories.get(id)` returns `Category | undefined`
2. **Cleaner generated hooks** - `useCategoryResolver(id)` with full typing
3. **Offline-first ready** - Store abstraction can wrap IndexedDB later
4. **Event subscription ready** - `store.categories.subscribe(id, callback)`
5. **Mutation helpers** - `store.categories.set(entity)` for optimistic updates

### EntityStore Class (Generated)

```typescript
// store/EntityStore.ts

import { QueryClient } from '@tanstack/react-query'
import type { Category, Account, Transaction, User } from '../types'

export class EntityStore {
  constructor(private queryClient: QueryClient) {}

  categories = {
    get: (id: string): Category | undefined =>
      this.queryClient.getQueryData(['categories', 'detail', id]),

    getMany: (ids: string[]): Category[] =>
      ids.map(id => this.categories.get(id)).filter(Boolean) as Category[],

    set: (entity: Category): void =>
      this.queryClient.setQueryData(['categories', 'detail', entity.id], entity),

    setMany: (entities: Category[]): void =>
      entities.forEach(e => this.categories.set(e)),

    invalidate: (id: string): Promise<void> =>
      this.queryClient.invalidateQueries({ queryKey: ['categories', 'detail', id] }),

    prefetch: (id: string): void => {
      if (this.categories.get(id)) return  // Already cached
      this.queryClient.prefetchQuery({
        queryKey: ['categories', 'detail', id],
        queryFn: () => api.categories.get(id),
        staleTime: Infinity,
      })
    },

    prefetchMany: (ids: string[]): void => {
      const uncached = [...new Set(ids)].filter(id => !this.categories.get(id))
      if (uncached.length === 0) return

      this.queryClient.prefetchQuery({
        queryKey: ['categories', 'list', { ids: uncached }],
        queryFn: () => api.categories.list({ ids: uncached }),
        staleTime: Infinity,
      }).then(categories => {
        categories?.forEach(c => this.categories.set(c))
      }).catch(error => {
        // Log but don't throw - prefetch failures are non-critical
        console.warn(`[EntityStore] Failed to prefetch categories:`, error)
      })
    },
  }

  accounts = { /* same pattern */ }
  transactions = { /* same pattern */ }
  users = { /* same pattern */ }
}
```

### EntityStore Provider (Generated)

```typescript
// store/EntityStoreProvider.tsx

import { createContext, useContext, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EntityStore } from './EntityStore'

const EntityStoreContext = createContext<EntityStore | null>(null)

export function EntityStoreProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const store = useMemo(() => new EntityStore(queryClient), [queryClient])

  return (
    <EntityStoreContext.Provider value={store}>
      {children}
    </EntityStoreContext.Provider>
  )
}

export function useEntityStore(): EntityStore {
  const store = useContext(EntityStoreContext)
  if (!store) {
    throw new Error('useEntityStore must be used within EntityStoreProvider')
  }
  return store
}
```

### Per-Entity Resolvers (Generated)

```typescript
// resolvers/useCategoryResolver.ts

import { useQuery } from '@tanstack/react-query'
import { useEntityStore } from '../store'
import type { Category } from '../types'

/**
 * Resolve a category ID to its entity data.
 * Subscribes to query state so component re-renders when data arrives.
 *
 * IMPORTANT: Uses useQuery internally to ensure re-renders on cache updates.
 * A naive implementation that just calls store.get() + prefetch() would NOT
 * trigger re-renders when the prefetch completes.
 */
export function useCategoryResolver(id: string | null): Category | undefined {
  const store = useEntityStore()

  const { data } = useQuery({
    queryKey: ['categories', 'detail', id],
    queryFn: () => api.categories.get(id!),
    enabled: !!id,
    staleTime: Infinity,
    // Return cached data immediately if available (no loading state)
    initialData: () => (id ? store.categories.get(id) : undefined),
    // Don't refetch if we have initial data
    initialDataUpdatedAt: () => (id && store.categories.get(id) ? Date.now() : 0),
  })

  return data
}

/**
 * Resolve with loading/error state for cases that need it.
 */
export function useCategoryResolverWithStatus(id: string | null) {
  const store = useEntityStore()
  const query = useQuery({
    queryKey: ['categories', 'detail', id],
    queryFn: () => api.categories.get(id!),
    enabled: !!id,
    staleTime: Infinity,
    initialData: () => (id ? store.categories.get(id) : undefined),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isNotFound: query.error?.status === 404,
    error: query.error,
  }
}
```

### Offline-First Path

The EntityStore abstraction sets us up for IndexedDB backing later:

```typescript
// Future enhancement - same API, different backing store

class EntityStore {
  constructor(
    private queryClient: QueryClient,
    private db?: IDBDatabase  // Optional IndexedDB
  ) {}

  categories = {
    get: (id: string): Category | undefined => {
      // Memory cache first
      const cached = this.queryClient.getQueryData(['categories', 'detail', id])
      if (cached) return cached

      // IndexedDB fallback (sync read via Dexie or similar)
      if (this.db) {
        return this.db.categories.get(id)  // Synchronous with Dexie
      }

      return undefined
    },

    set: async (entity: Category): Promise<void> => {
      // Write to both memory and disk
      this.queryClient.setQueryData(['categories', 'detail', entity.id], entity)
      if (this.db) {
        await this.db.categories.put(entity)
      }
    },
  }
}
```

Components don't change - same `store.categories.get(id)` API.

---

## 5. Prefetching Strategy

### When to Prefetch

When a list query returns, extract unique referenced IDs and prefetch them.

### Implementation: usePrefetchReferences

```typescript
// resolvers/usePrefetchReferences.ts

interface PrefetchConfig {
  entity: string
  idExtractor: (item: unknown) => string | null
}

/**
 * Prefetch referenced entities when list data loads.
 * Batches requests for efficiency.
 */
function usePrefetchReferences<T>(
  data: T[] | undefined,
  references: PrefetchConfig[]
): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!data?.length) return

    for (const ref of references) {
      // Extract unique IDs
      const ids = [...new Set(
        data.map(ref.idExtractor).filter(Boolean)
      )] as string[]

      // Skip if all already cached
      const uncached = ids.filter(id =>
        !queryClient.getQueryData([ref.entity, 'detail', id])
      )

      if (uncached.length === 0) continue

      // Batch fetch via list endpoint with IDs filter
      queryClient.prefetchQuery({
        queryKey: [ref.entity, 'list', { ids: uncached }],
        queryFn: () => fetchEntities(ref.entity, uncached),
        staleTime: Infinity,
      })
    }
  }, [data, references, queryClient])
}
```

### Challenge: Batch Endpoint

This assumes backend supports `GET /categories?ids=a,b,c` for batch fetch.

**If not available:** Fall back to individual fetches (less efficient but works):
```typescript
for (const id of uncached) {
  queryClient.prefetchQuery({
    queryKey: [ref.entity, 'detail', id],
    queryFn: () => fetchEntity(ref.entity, id),
  })
}
```

### Integration with Generated Hooks

```typescript
// Generated: hooks/useTransactions.ts

export function useTransactions(options?: UseTransactionsOptions) {
  const query = useQuery({
    queryKey: ['transactions', 'list', options],
    queryFn: () => api.transactions.list(options),
    ...queryDefaults.entities,
  })

  // AUTO-GENERATED: Prefetch referenced entities
  usePrefetchReferences(query.data, [
    { entity: 'categories', idExtractor: (t) => t.category_id },
    { entity: 'accounts', idExtractor: (t) => t.account_id },
    { entity: 'users', idExtractor: (t) => t.created_by },
  ])

  return query
}
```

---

## 6. Frontend-patterns Integration

### EntityCell Component

```typescript
// frontend-patterns/entity/EntityCell.tsx

interface EntityCellProps {
  /** The foreign key value (UUID) */
  id: string | null
  /** Reference info from column metadata */
  reference: EntityReference
  /** Render mode */
  mode?: 'badge' | 'text' | 'link' | 'chip'
}

function EntityCell({ id, reference, mode = 'badge' }: EntityCellProps) {
  const resolved = useEntityResolver(reference.entity, id)
  const config = useEntityConfig(reference.entity)

  if (!id) return <span className="text-muted">—</span>

  if (!resolved) {
    // Loading state - brief skeleton
    return <Skeleton className="h-6 w-20" />
  }

  const displayValue = resolved[reference.displayField]

  switch (mode) {
    case 'badge':
      return (
        <EntityBadge
          value={displayValue}
          icon={config?.icon}
          // Could add color from resolved entity
        />
      )
    case 'text':
      return <span>{displayValue}</span>
    case 'link':
      return <Link to={`/${reference.entity}/${id}`}>{displayValue}</Link>
    case 'chip':
      return <Chip icon={config?.icon}>{displayValue}</Chip>
  }
}
```

### EntityTable Integration

```typescript
// frontend-patterns/entity/EntityTable.tsx

function EntityTable<T>({ data, columns, config }: EntityTableProps<T>) {
  return (
    <table>
      <tbody>
        {data.map(row => (
          <tr key={row.id}>
            {columns.map(col => (
              <td key={col.field}>
                {col.type === 'entity' && col.reference
                  ? <EntityCell
                      id={row[col.field]}
                      reference={col.reference}
                    />
                  : renderField(row[col.field], col)
                }
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

---

## 7. Generated Output

### New Directory Structure

```
generated/
├── store/
│   ├── index.ts                      # Barrel export
│   ├── EntityStore.ts                # Typed store class
│   └── EntityStoreProvider.tsx       # React context provider
│
├── resolvers/
│   ├── index.ts                      # Barrel export
│   ├── useCategoryResolver.ts        # Per-entity typed resolver
│   ├── useAccountResolver.ts
│   ├── useUserResolver.ts
│   └── ...                           # One per entity
│
├── columns/
│   ├── {entity}.columns.ts           # Now includes reference field
│   └── ...
│
├── hooks/
│   ├── use{Entity}.ts                # CRUD + auto-prefetch refs
│   └── ...
│
└── index.ts                          # Re-exports everything
```

### Generator: EntityStoreGenerator (NEW)

```typescript
// Generates store/EntityStore.ts

class EntityStoreGenerator {
  generate(model: EntityModel): string {
    const entities = Array.from(model.entities.values())

    return `
import { QueryClient } from '@tanstack/react-query'
${entities.map(e => `import type { ${e.pascalName} } from '../types'`).join('\n')}
import { api } from '../api'

export class EntityStore {
  constructor(private queryClient: QueryClient) {}

  ${entities.map(e => this.generateEntityAccessor(e)).join('\n\n  ')}
}
`
  }

  private generateEntityAccessor(entity: EntityDefinition): string {
    return `
  ${entity.name} = {
    get: (id: string): ${entity.pascalName} | undefined =>
      this.queryClient.getQueryData(['${entity.name}', 'detail', id]),

    getMany: (ids: string[]): ${entity.pascalName}[] =>
      ids.map(id => this.${entity.name}.get(id)).filter(Boolean),

    set: (entity: ${entity.pascalName}): void =>
      this.queryClient.setQueryData(['${entity.name}', 'detail', entity.id], entity),

    invalidate: (id: string): Promise<void> =>
      this.queryClient.invalidateQueries({ queryKey: ['${entity.name}', 'detail', id] }),

    prefetch: (id: string): void => {
      if (this.${entity.name}.get(id)) return
      this.queryClient.prefetchQuery({
        queryKey: ['${entity.name}', 'detail', id],
        queryFn: () => api.${entity.name}.get(id),
        staleTime: Infinity,
      })
    },

    prefetchMany: (ids: string[]): void => {
      const uncached = [...new Set(ids)].filter(id => !this.${entity.name}.get(id))
      if (!uncached.length) return
      api.${entity.name}.list({ ids: uncached }).then(items => {
        items.forEach(item => this.${entity.name}.set(item))
      }).catch(error => {
        console.warn(\`[EntityStore] Failed to prefetch ${entity.name}:\`, error)
      })
    },
  }`
  }
}
```

### Generator: EntityResolverGenerator (NEW)

```typescript
// Generates resolvers/use{Entity}Resolver.ts for each entity

class EntityResolverGenerator {
  generate(entity: EntityDefinition): string {
    return `
import { useEntityStore } from '../store'
import type { ${entity.pascalName} } from '../types'

export function use${entity.pascalName}Resolver(id: string | null): ${entity.pascalName} | undefined {
  const store = useEntityStore()

  if (!id) return undefined

  const cached = store.${entity.name}.get(id)
  if (cached) return cached

  store.${entity.name}.prefetch(id)
  return undefined
}
`
  }
}
```

### Modified: HookGenerator

Add reference prefetching to list hooks:

```typescript
// In useTransactions.ts (generated)

export function useTransactions(options?: UseTransactionsOptions) {
  const store = useEntityStore()
  const query = useQuery({
    queryKey: ['transactions', 'list', options],
    queryFn: () => api.transactions.list(options),
  })

  // Auto-prefetch referenced entities
  useEffect(() => {
    if (!query.data) return

    // Extract unique IDs for each reference
    const categoryIds = query.data.map(t => t.category_id).filter(Boolean)
    const accountIds = query.data.map(t => t.account_id).filter(Boolean)

    store.categories.prefetchMany(categoryIds)
    store.accounts.prefetchMany(accountIds)
  }, [query.data, store])

  return query
}
```

### Modified: ColumnMetadataGenerator

Include `reference` field for entity-type columns:

```typescript
{
  field: 'category_id',
  label: 'Category',
  type: 'entity',
  importance: 'high',
  reference: {
    entity: 'categories',
    displayField: 'name',
  },
  // ...
}
```

### Generator Implementation Notes

**Code Injection Prevention:** The generator pseudocode uses template literals for clarity. Real implementation must:

1. **Sanitize entity names** - Validate against `^[a-z][a-z0-9_]*$` pattern
2. **Use AST builders** - Consider using TypeScript Compiler API or ts-morph for safe code generation
3. **Escape special characters** - If using templates, escape backticks and `${` sequences

```typescript
// Example validation in generator
function validateEntityName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid entity name: ${name}`)
  }
}
```

**staleTime Configuration:** The current spec uses `staleTime: Infinity` for reference data. This should be configurable per entity:

```typescript
// In generated EntityStore config
export const entityStaleTime: Record<string, number> = {
  categories: Infinity,     // Reference data, never stale
  accounts: Infinity,       // Reference data
  users: 5 * 60 * 1000,     // 5 min - users may change more often
  // Default: Infinity
}

// Usage in resolver
staleTime: entityStaleTime[entity.name] ?? Infinity,
```

---

## 8. Challenges & Edge Cases

### 8.1 Circular References

**Scenario:** Category references ParentCategory, which references Category.

**Solution:** Prefetching is shallow (one level only). Deep resolution requires explicit opt-in.

### 8.2 Deleted References

**Scenario:** Transaction references category_id that was deleted.

**Solution:** Resolver returns undefined. EntityCell shows fallback:
```tsx
if (!resolved) {
  return <span className="text-muted italic">Unknown</span>
}
```

### 8.3 HTTP Error Responses

**Scenario:** Backend returns 404 (not found), 403 (forbidden), or 500 (server error).

**Solution:** Differentiate error types in resolver and UI:

```typescript
// In useCategoryResolverWithStatus
return {
  data: query.data,
  isLoading: query.isLoading,
  isNotFound: query.error?.status === 404,
  isForbidden: query.error?.status === 403,
  error: query.error,
}
```

```tsx
// In EntityCell
function EntityCell({ id, reference, mode = 'badge' }: EntityCellProps) {
  const { data, isLoading, isNotFound, isForbidden } = useEntityResolverWithStatus(reference.entity, id)

  if (!id) return <span className="text-muted">—</span>
  if (isLoading) return <Skeleton className="h-6 w-20" />
  if (isNotFound) return <span className="text-muted italic">Not found</span>
  if (isForbidden) return <span className="text-muted italic">No access</span>
  if (!data) return <span className="text-muted italic">Unknown</span>

  // ... render resolved entity
}
```

### 8.4 Large ID Lists

**Scenario:** 1000 transactions → 500 unique category IDs.

**Solution:**
1. Backend batch endpoint (`?ids=a,b,c`) - efficient
2. Fallback: Limit prefetch to first N, lazy-load rest
3. Consider: Does UI really show 1000 rows at once? Pagination helps.

### 8.5 Cache Coherence

**Scenario:** Category updated via different mutation, cache stale.

**Solution:** Event-driven invalidation:
```typescript
// On WebSocket message: { type: 'category.updated', id: 'cat-123' }
queryClient.invalidateQueries(['categories', 'detail', 'cat-123'])
```

### 8.6 Initial Load Race

**Scenario:** Transactions render before categories prefetch completes.

**Solution:** This is expected. EntityCell shows skeleton for ~100ms, then renders. Acceptable UX.

### 8.7 Self-References

**Scenario:** Category has parent_id referencing another Category.

**Solution:** Same pattern works. Just ensure prefetch doesn't infinite loop:
```typescript
// Only prefetch IDs not already being fetched
const inFlight = queryClient.isFetching(['categories', 'detail', id])
if (!inFlight) prefetch(id)
```

---

## 9. Implementation Phases

### Phase 1: Core Types & Parsing (~1 day)

**Goal:** Parse x-ui-reference from OpenAPI into ColumnMetadata.

- [ ] Add `EntityReference` interface to `entity-model.ts`
- [ ] Add `reference?: EntityReference` to `ColumnMetadata` type
- [ ] Add `uiReference` to `PropertyDefinition`
- [ ] Update `EntityResolver.extractPropertyDefinition()` to parse x-ui-reference
- [ ] Update `propertyToColumnMetadata()` to include reference field
- [ ] Update `ColumnMetadataGenerator` to output reference in columns

**Tests:**
- [ ] Parse spec with x-ui-reference, verify ColumnMetadata.reference populated
- [ ] Parse spec without x-ui-reference, verify reference is undefined
- [ ] Verify displayField defaults to 'name' when not specified
- [ ] Test invalid entity names are rejected

**Files touched:**
- `src/core/entity-model.ts`
- `src/core/entity-resolver.ts`
- `src/generators/column-metadata-generator.ts`

### Phase 2: EntityStore Generator (~2 days)

**Goal:** Generate typed entity store with get/set/prefetch per entity.

- [ ] Create `src/generators/entity-store-generator.ts`
- [ ] Generate `store/EntityStore.ts` with accessor per entity
- [ ] Generate `store/EntityStoreProvider.tsx` with React context
- [ ] Generate `store/index.ts` barrel
- [ ] Integrate into CLI orchestrator

**Tests:**
- [ ] Verify store class has get/set/prefetch/prefetchMany for each entity
- [ ] Test get() returns undefined when not cached
- [ ] Test get() returns entity when cached
- [ ] Test set() populates cache correctly
- [ ] Test prefetchMany() deduplicates IDs
- [ ] Test prefetchMany() skips already-cached IDs
- [ ] Test prefetchMany() error handling (logs, doesn't throw)

**Files touched:**
- `src/generators/entity-store-generator.ts` (new)
- `src/cli/orchestrator.ts`

### Phase 3: Entity Resolver Generator (~1 day)

**Goal:** Generate per-entity typed resolver hooks.

- [ ] Create `src/generators/entity-resolver-generator.ts`
- [ ] Generate `resolvers/use{Entity}Resolver.ts` per entity
- [ ] Generate `resolvers/index.ts` barrel
- [ ] Integrate into CLI orchestrator

**Tests:**
- [ ] Resolver returns cached data immediately (no loading state)
- [ ] Resolver triggers fetch when not cached
- [ ] Resolver re-renders component when fetch completes
- [ ] Resolver returns undefined for null/undefined id
- [ ] ResolverWithStatus returns isNotFound=true on 404
- [ ] ResolverWithStatus returns isForbidden=true on 403

**Files touched:**
- `src/generators/entity-resolver-generator.ts` (new)
- `src/cli/orchestrator.ts`

### Phase 4: Reference Prefetching in Hooks (~1 day)

**Goal:** List hooks auto-prefetch referenced entities.

- [ ] Detect entity-type columns with references in hook generator
- [ ] Generate useEffect that calls `store.{entity}.prefetchMany()`
- [ ] Extract unique IDs from list data for each reference

**Tests:**
- [ ] Generated hook includes useEffect with prefetch calls
- [ ] Prefetch extracts unique IDs from all reference fields
- [ ] Prefetch handles null/undefined IDs gracefully
- [ ] Prefetch runs when data changes (not on every render)
- [ ] Test race condition: list renders before prefetch completes → skeleton → resolved

**Files touched:**
- `src/generators/hook-generator.ts`

### Phase 5: Frontend-patterns Integration (~2 days)

**Goal:** Components that consume generated store + resolvers.

- [ ] Create `EntityCell` component (uses resolver, renders based on mode)
- [ ] Create `EntityBadge` primitive (icon + label)
- [ ] Update `EntityTable` to detect entity columns, render with EntityCell
- [ ] Update `EntityCard` similarly
- [ ] `useEntityConfig(entityType)` hook for config lookup

**Tests:**
- [ ] EntityCell shows skeleton while loading
- [ ] EntityCell shows resolved value after load
- [ ] EntityCell shows "Not found" for 404
- [ ] EntityCell shows "No access" for 403
- [ ] EntityCell shows "Unknown" for other errors
- [ ] EntityTable auto-detects entity columns and uses EntityCell
- [ ] All render modes work: badge, text, link, chip

**Files touched (in frontend-patterns):**
- `src/entity/EntityCell.tsx` (new)
- `src/primitives/EntityBadge.tsx` (new)
- `src/entity/EntityTable.tsx`
- `src/entity/EntityCard.tsx`

### Phase 6: Backend x-ui-reference Emission (~1.5 days)

**Goal:** Backend-patterns emits x-ui-reference for FK fields AND supports batch fetch.

- [ ] Update Field() to auto-detect FK and emit x-ui-reference
- [ ] Include target entity's title_field as displayField
- [ ] **Implement batch fetch endpoint for all entities** (`GET /{entity}?ids=a,b,c`)
  - Accept `ids` query parameter (comma-separated or repeated)
  - Return array of matching entities
  - Handle partial results (some IDs not found)
- [ ] Test with aloevera Transaction → Category reference
- [ ] Test batch fetch with 50+ IDs

**Files touched (in backend-patterns):**
- `pattern_stack/atoms/patterns/field.py`
- `pattern_stack/atoms/openapi/schema_generator.py`
- `pattern_stack/atoms/data/crud.py` (batch fetch support)

---

**Total estimate:** ~8.5 days of focused work

**Parallel tracks possible:**
- Phase 1-4 (sync-patterns) can proceed independently
- Phase 5 (frontend-patterns) requires:
  - Phase 1 (for ColumnMetadata.reference type)
  - Phase 2 (for EntityStore to exist)
- Phase 6 (backend-patterns) can proceed in parallel

**Dependency graph:**
```
Phase 1 ─────┬──→ Phase 2 ──→ Phase 3
             │         │
             │         └──→ Phase 4
             │
             └──→ Phase 5 (needs 1 + 2)

Phase 6 (parallel, no deps)
```

---

## 10. Decisions Made

| Question | Decision |
|----------|----------|
| displayField source | Backend includes in x-ui-reference |
| Batch endpoint | **Required** - backend must support `?ids=` filter |
| Render mode | Backend default (x-ui-render) + frontend override |
| Generic vs per-entity | **Per-entity** via EntityStore + typed resolvers |
| Prefetch strategy | Yes, for offline-first readiness |
| Reference depth | One level only |
| Cache strategy | **EntityStore** - typed facade over TanStack Query |
| frontend-patterns → generated | Expected dependency |

---

## 11. Resolved Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Entity icon source | **Option A: x-ui-icon extension** | Keeps metadata centralized in backend, consistent with other x-ui-* extensions |
| Status/category colors | **Backend emits** | Colors are data, not presentation. Backend includes in entity schema. |
| Render mode variants | **badge \| text \| link \| chip** sufficient | Card is a separate component (EntityCard), not a cell mode |
| EntityCell loading state | **Skeleton (shimmer)** | Consistent with modern UX patterns, indicates loading vs empty |

### Implementation Details

**Entity Icon (x-ui-icon):**
```yaml
Category:
  x-ui-icon: folder  # Lucide icon name
  properties:
    name: { type: string }
```

**Color Mapping:**
```yaml
Category:
  properties:
    color:
      type: string
      x-ui-type: color
      # Entity includes color field, resolved data has it
```

**Loading State:**
```tsx
// Skeleton renders for ~100ms max (prefetch is fast)
<Skeleton className="h-6 w-20 animate-pulse" />
```

---

## 12. Success Criteria

1. **Zero configuration for common case:** FK field automatically resolves and renders with no app code.

2. **No N+1 queries:** Batch prefetch via `?ids=` on list load.

3. **Instant re-render on update:** `store.categories.invalidate(id)` triggers re-render everywhere.

4. **Graceful degradation:** Missing/deleted reference shows fallback, not crash.

5. **Type-safe end-to-end:** `useCategoryResolver(id)` returns `Category | undefined` with full typing.

6. **Offline-ready architecture:** EntityStore can be backed by IndexedDB with same API.

---

## 13. Future Enhancements

These are not required for initial implementation but should be considered for future iterations.

### 13.1 Debug Mode

Enable visibility into resolution state during development:

```typescript
// Usage
const category = useCategoryResolver(id, { debug: true })
// Console: [EntityResolver] categories/abc123: cache miss, fetching...
// Console: [EntityResolver] categories/abc123: resolved in 45ms

// Implementation in generated resolver
export function useCategoryResolver(
  id: string | null,
  options?: { debug?: boolean }
): Category | undefined {
  const store = useEntityStore()

  if (options?.debug && id) {
    const cached = store.categories.get(id)
    console.log(
      `[EntityResolver] categories/${id}: ${cached ? 'cache hit' : 'cache miss, fetching...'}`
    )
  }

  // ... rest of implementation
}
```

### 13.2 Resolution Metrics

Track prefetch efficiency for monitoring:

```typescript
// EntityStore extension
class EntityStore {
  private metrics = {
    categories: { hits: 0, misses: 0, pending: 0, errors: 0 },
    accounts: { hits: 0, misses: 0, pending: 0, errors: 0 },
    // ... per entity
  }

  getMetrics(): EntityMetrics {
    return this.metrics
  }

  // In get():
  get: (id: string): Category | undefined => {
    const cached = this.queryClient.getQueryData(['categories', 'detail', id])
    if (cached) {
      this.metrics.categories.hits++
    } else {
      this.metrics.categories.misses++
    }
    return cached
  }
}

// Usage in dev tools or monitoring
const store = useEntityStore()
console.table(store.getMetrics())
// categories: { hits: 450, misses: 12, pending: 0, errors: 0 }
// accounts:   { hits: 200, misses: 5, pending: 2, errors: 1 }
```

### 13.3 Prefetch Timeout

Handle slow or hanging prefetch requests:

```typescript
// In EntityStore.prefetch()
prefetch: (id: string, options?: { timeout?: number }): void => {
  const timeout = options?.timeout ?? 5000  // 5s default

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  this.queryClient.prefetchQuery({
    queryKey: ['categories', 'detail', id],
    queryFn: () => api.categories.get(id, { signal: controller.signal }),
    staleTime: Infinity,
  }).finally(() => clearTimeout(timeoutId))
}

// EntityCell handles timeout gracefully
if (isLoading && elapsedTime > 5000) {
  return <span className="text-muted italic">Unavailable</span>
}
```

---

## 14. End State Example

```tsx
// App code - this is ALL you write
import {
  useTransactions,
  useTransactionColumns,
  EntityStoreProvider
} from '@/generated'
import { EntityTable } from '@pattern-stack/frontend-patterns'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <EntityStoreProvider>
        <TransactionsPage />
      </EntityStoreProvider>
    </QueryClientProvider>
  )
}

function TransactionsPage() {
  const { data: transactions } = useTransactions()  // Auto-prefetches category, account refs
  const { columns } = useTransactionColumns()

  return <EntityTable data={transactions} columns={columns} />
  // category_id column automatically:
  // 1. Detects type: 'entity'
  // 2. Calls useCategoryResolver(row.category_id)
  // 3. Renders CategoryBadge with resolved name + icon
}
```

**No mapping. No detection. No manual props. Just data + metadata → render.**
