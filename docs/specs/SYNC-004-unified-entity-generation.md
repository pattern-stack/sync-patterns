# SPEC: Unified Entity Generation

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-004 |
| **Title** | Unified Entity Wrappers and Runtime Configuration |
| **Status** | Draft |
| **Created** | 2025-12-01 |
| **Phase** | 1 |
| **Depends On** | [SYNC-002](SYNC-002-client-architecture.md), [SYNC-003](SYNC-003-codegen-migration.md) |
| **ADR** | [ADR-007](../adr/007-unified-entity-wrappers.md) |

---

## Executive Summary

This specification defines how sync-patterns generates unified entity wrappers that abstract the difference between optimistic (TanStack DB) and confirmed (TanStack Query) modes, with runtime configuration for flexibility.

### Goals

1. Generate unified wrappers for each entity with consistent API
2. Generate runtime config module with build-time defaults
3. Normalize return types between TanStack Query and TanStack DB
4. Support runtime mode switching without code changes
5. Maintain access to raw hooks/collections for advanced use cases

### Non-Goals

- React Context-based configuration (simple module config is sufficient)
- Server-side rendering considerations (deferred)
- Offline persistence beyond TanStack DB's built-in (deferred)

---

## Generated File Structure

```
src/generated/
├── schemas/                    # Zod schemas (all entities)
│   ├── {entity}.schema.ts
│   └── index.ts
│
├── client/                     # API client (all entities)
│   ├── client.ts               # Axios instance
│   ├── {entity}.ts             # Entity-specific methods
│   └── index.ts
│
├── hooks/                      # TanStack Query hooks (all entities)
│   ├── {entity}.ts             # useQuery, useMutation hooks
│   ├── keys.ts                 # Query key factory
│   └── index.ts
│
├── collections/                # TanStack DB collections (local_first: true only)
│   ├── {entity}.ts             # Collection definition
│   └── index.ts
│
├── entities/                   # 🆕 Unified wrappers (all entities)
│   ├── {entity}.ts             # Unified hooks
│   └── index.ts
│
├── config.ts                   # 🆕 Runtime configuration
└── index.ts                    # Main exports
```

---

## Detailed Design

### 1. Config Module

**File:** `src/generated/config.ts`

```typescript
/**
 * Runtime sync configuration.
 *
 * Defaults are baked in from OpenAPI x-sync metadata at generation time.
 * Call configureSync() at app startup to set Electric URL and any overrides.
 */

export interface SyncConfig {
  /**
   * ElectricSQL service URL.
   * Required for optimistic mode to work.
   * If empty, all entities fall back to confirmed mode.
   */
  electricUrl: string

  /**
   * Default mode for entities not explicitly configured.
   * @default false (confirmed mode)
   */
  defaultLocalFirst: boolean

  /**
   * Per-entity local_first settings.
   * Generated from OpenAPI x-sync.local_first values.
   */
  entities: Record<string, boolean>
}

let config: SyncConfig = {
  electricUrl: '',
  defaultLocalFirst: false,
  entities: {
    // GENERATED: Populated from OpenAPI x-sync.local_first
    // Example:
    // contacts: true,
    // accounts: true,
    // analytics: false,
  }
}

/**
 * Configure sync settings at app startup.
 *
 * @example
 * ```typescript
 * // main.tsx
 * import { configureSync } from '@/generated/config'
 *
 * configureSync({
 *   electricUrl: import.meta.env.VITE_ELECTRIC_URL ?? '',
 * })
 * ```
 */
export function configureSync(overrides: Partial<SyncConfig>): void {
  config = {
    ...config,
    ...overrides,
    entities: {
      ...config.entities,
      ...overrides.entities,
    }
  }
}

/**
 * Check if an entity should use optimistic (local-first) mode.
 *
 * Returns false if:
 * - electricUrl is not configured
 * - Entity is explicitly set to false
 * - Entity is not configured and defaultLocalFirst is false
 */
export function isLocalFirst(entity: string): boolean {
  if (!config.electricUrl) return false
  return config.entities[entity] ?? config.defaultLocalFirst
}

/**
 * Get the configured Electric URL.
 */
export function getElectricUrl(): string {
  return config.electricUrl
}

/**
 * Get full config (for debugging).
 */
export function getSyncConfig(): Readonly<SyncConfig> {
  return { ...config }
}
```

### 2. Entity Wrapper Template

**File:** `src/generated/entities/{entity}.ts`

```typescript
/**
 * Unified hooks for {Entity}.
 *
 * These wrappers automatically use the appropriate implementation
 * based on runtime configuration:
 * - local_first: true  → TanStack DB (optimistic)
 * - local_first: false → TanStack Query (confirmed)
 *
 * @see configureSync() to set Electric URL and mode overrides
 */

import { useLiveQuery } from '@tanstack/react-db'
import { isLocalFirst } from '../config'
import { {entity}Collection } from '../collections/{entity}'
import {
  use{Entity}ListQuery,
  use{Entity}Query,
  useCreate{Entity}Mutation,
  useUpdate{Entity}Mutation,
  useDelete{Entity}Mutation,
} from '../hooks/{entity}'
import type {
  {Entity},
  {Entity}Create,
  {Entity}Update,
} from '../schemas/{entity}.schema'

// Re-export types for convenience
export type { {Entity}, {Entity}Create, {Entity}Update }

// ============================================================================
// READ HOOKS
// ============================================================================

/**
 * Fetch all {entity}s.
 */
export function use{Entity}s() {
  if (isLocalFirst('{entity}')) {
    return useLiveQuery((q) =>
      q.from({ {entity}: {entity}Collection })
    )
  }
  return use{Entity}ListQuery()
}

/**
 * Fetch a single {entity} by ID.
 */
export function use{Entity}(id: string) {
  if (isLocalFirst('{entity}')) {
    return useLiveQuery((q) =>
      q.from({ {entity}: {entity}Collection })
       .where(({ {entity} }) => eq({entity}.id, id))
       .first()
    )
  }
  return use{Entity}Query(id)
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export interface MutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => void
  mutateAsync: (variables: TVariables) => Promise<TData>
  isPending: boolean
}

/**
 * Create a new {entity}.
 */
export function useCreate{Entity}(): MutationResult<{Entity}, {Entity}Create> {
  if (isLocalFirst('{entity}')) {
    return {
      mutate: (data) => {entity}Collection.insert(data),
      mutateAsync: async (data) => {
        const tx = {entity}Collection.insert(data)
        await tx.isPersisted.promise
        return tx.mutations[0].modified as {Entity}
      },
      isPending: false, // Optimistic = never pending
    }
  }

  const mutation = useCreate{Entity}Mutation()
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

/**
 * Update an existing {entity}.
 */
export function useUpdate{Entity}(): MutationResult<{Entity}, { id: string; data: {Entity}Update }> {
  if (isLocalFirst('{entity}')) {
    return {
      mutate: ({ id, data }) => {entity}Collection.update(id, (draft) => {
        Object.assign(draft, data)
      }),
      mutateAsync: async ({ id, data }) => {
        const tx = {entity}Collection.update(id, (draft) => {
          Object.assign(draft, data)
        })
        await tx.isPersisted.promise
        return tx.mutations[0].modified as {Entity}
      },
      isPending: false,
    }
  }

  const mutation = useUpdate{Entity}Mutation()
  return {
    mutate: ({ id, data }) => mutation.mutate({ id, data }),
    mutateAsync: ({ id, data }) => mutation.mutateAsync({ id, data }),
    isPending: mutation.isPending,
  }
}

/**
 * Delete a {entity}.
 */
export function useDelete{Entity}(): MutationResult<void, string> {
  if (isLocalFirst('{entity}')) {
    return {
      mutate: (id) => {entity}Collection.delete(id),
      mutateAsync: async (id) => {
        const tx = {entity}Collection.delete(id)
        await tx.isPersisted.promise
      },
      isPending: false,
    }
  }

  const mutation = useDelete{Entity}Mutation()
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}
```

### 3. Collection Template (for local_first: true entities)

**File:** `src/generated/collections/{entity}.ts`

```typescript
/**
 * TanStack DB collection for {Entity}.
 *
 * Used when local_first: true for optimistic updates via ElectricSQL.
 */

import { createCollection } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { getElectricUrl } from '../config'
import { {Entity}Schema } from '../schemas/{entity}.schema'
import { {entity}Api } from '../client/{entity}'
import type { {Entity} } from '../schemas/{entity}.schema'

export const {entity}Collection = createCollection<{Entity}>(
  electricCollectionOptions({
    id: '{entity_plural}',

    shapeOptions: {
      url: `${getElectricUrl()}/v1/shape`,
      params: {
        table: '{table_name}',
      },
    },

    getKey: (item) => item.id,
    schema: {Entity}Schema,

    onInsert: async ({ transaction }) => {
      const item = transaction.mutations[0].modified
      const response = await {entity}Api.create(item)
      return { txid: response.txid }
    },

    onUpdate: async ({ transaction }) => {
      const { original, changes } = transaction.mutations[0]
      const response = await {entity}Api.update(original.id, changes)
      return { txid: response.txid }
    },

    onDelete: async ({ transaction }) => {
      const { original } = transaction.mutations[0]
      const response = await {entity}Api.delete(original.id)
      return { txid: response.txid }
    },
  })
)
```

### 4. Index Exports

**File:** `src/generated/entities/index.ts`

```typescript
// Re-export all entity wrappers
export * from './contacts'
export * from './accounts'
// ... generated for each entity
```

**File:** `src/generated/index.ts`

```typescript
// Primary exports - what apps should import
export * from './entities'
export { configureSync, isLocalFirst, getElectricUrl } from './config'

// Schema exports
export * from './schemas'

// Advanced: raw hooks and collections
export * as hooks from './hooks'
export * as collections from './collections'
export * as client from './client'
```

---

## Generator Implementation

### 4.1 Config Generator

**File:** `src/generators/config-generator.ts`

```typescript
export function generateConfig(entities: ParsedEntity[]): string {
  const entityDefaults = entities
    .filter(e => e.localFirst !== undefined)
    .map(e => `    ${e.name}: ${e.localFirst},`)
    .join('\n')

  return `
// Generated by sync-patterns - do not edit

export interface SyncConfig {
  electricUrl: string
  defaultLocalFirst: boolean
  entities: Record<string, boolean>
}

let config: SyncConfig = {
  electricUrl: '',
  defaultLocalFirst: false,
  entities: {
${entityDefaults}
  }
}

export function configureSync(overrides: Partial<SyncConfig>): void {
  config = {
    ...config,
    ...overrides,
    entities: { ...config.entities, ...overrides.entities }
  }
}

export function isLocalFirst(entity: string): boolean {
  if (!config.electricUrl) return false
  return config.entities[entity] ?? config.defaultLocalFirst
}

export function getElectricUrl(): string {
  return config.electricUrl
}

export function getSyncConfig(): Readonly<SyncConfig> {
  return { ...config }
}
`
}
```

### 4.2 Entity Wrapper Generator

**File:** `src/generators/entity-generator.ts`

```typescript
export function generateEntityWrapper(entity: ParsedEntity): string {
  const { name, namePlural, hasCollection } = entity
  const Name = pascalCase(name)

  return `
// Generated by sync-patterns - do not edit

import { isLocalFirst } from '../config'
${hasCollection ? `import { useLiveQuery, eq } from '@tanstack/react-db'` : ''}
${hasCollection ? `import { ${name}Collection } from '../collections/${name}'` : ''}
import {
  use${Name}ListQuery,
  use${Name}Query,
  useCreate${Name}Mutation,
  useUpdate${Name}Mutation,
  useDelete${Name}Mutation,
} from '../hooks/${name}'
import type { ${Name}, ${Name}Create, ${Name}Update } from '../schemas/${name}.schema'

export type { ${Name}, ${Name}Create, ${Name}Update }

// ... rest of template
`
}
```

---

## Consuming App Integration

### 5.1 App Initialization

```typescript
// src/main.tsx

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureSync } from '@/generated/config'
import App from './App'

// Configure sync before rendering
configureSync({
  electricUrl: import.meta.env.VITE_ELECTRIC_URL ?? '',
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

### 5.2 Component Usage

```typescript
// src/components/ContactList.tsx

import { useContacts, useCreateContact, Contact } from '@/generated/entities/contacts'

export function ContactList() {
  const { data: contacts, isLoading } = useContacts()
  const createContact = useCreateContact()

  const handleCreate = () => {
    createContact.mutate({
      first_name: 'New',
      email: 'new@example.com',
    })
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      <button onClick={handleCreate}>Add Contact</button>
      <ul>
        {contacts?.map((contact: Contact) => (
          <li key={contact.id}>{contact.first_name}</li>
        ))}
      </ul>
    </div>
  )
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// Test config module
describe('config', () => {
  beforeEach(() => {
    // Reset config between tests
    configureSync({
      electricUrl: '',
      defaultLocalFirst: false,
      entities: {}
    })
  })

  it('returns false when electricUrl not set', () => {
    configureSync({ entities: { contacts: true } })
    expect(isLocalFirst('contacts')).toBe(false)
  })

  it('returns entity-specific setting', () => {
    configureSync({
      electricUrl: 'http://localhost:3000',
      entities: { contacts: true, analytics: false }
    })
    expect(isLocalFirst('contacts')).toBe(true)
    expect(isLocalFirst('analytics')).toBe(false)
  })

  it('falls back to defaultLocalFirst', () => {
    configureSync({
      electricUrl: 'http://localhost:3000',
      defaultLocalFirst: true
    })
    expect(isLocalFirst('unknown')).toBe(true)
  })
})
```

### Integration Tests

```typescript
// Test unified wrapper switches correctly
describe('useContacts', () => {
  it('uses TanStack Query when not local_first', () => {
    configureSync({ electricUrl: '' })
    // Render hook, verify TanStack Query is used
  })

  it('uses TanStack DB when local_first', () => {
    configureSync({
      electricUrl: 'http://localhost:3000',
      entities: { contacts: true }
    })
    // Render hook, verify TanStack DB is used
  })
})
```

---

## Migration Path

### For Projects Using Current sync-patterns Output

1. Regenerate with new CLI version
2. Add `configureSync()` call to app initialization
3. Change imports from `@/generated/hooks` to `@/generated/entities`
4. Remove manual TanStack Query / TanStack DB switching logic

### Import Migration

```diff
- import { useContactsQuery, useCreateContactMutation } from '@/generated/hooks/contacts'
+ import { useContacts, useCreateContact } from '@/generated/entities/contacts'
```

---

## Related Documents

- [ADR-007: Unified Entity Wrappers](../adr/007-unified-entity-wrappers.md)
- [SYNC-002: Client-Side Architecture](SYNC-002-client-architecture.md)
- [SYNC-003: Codegen Migration](SYNC-003-codegen-migration.md)
- [docs/TERMINOLOGY.md](../TERMINOLOGY.md)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-01 | Initial draft |
