# ADR-007: Unified Entity Wrappers with Runtime Configuration

## Status

**Accepted**

## Date

2025-12-01

## Context

sync-patterns generates two different hook types for data fetching:

1. **TanStack Query hooks** - Traditional API calls (confirmed mode)
2. **TanStack DB collections** - Local-first with ElectricSQL (optimistic mode)

Without a unified interface, consuming apps must:
- Know which mode each entity uses
- Import from different paths (`hooks/` vs `collections/`)
- Refactor code when switching modes
- Handle different return types and mutation patterns

This creates tight coupling between app code and sync implementation details.

Additionally, we need flexibility for:
- Local development without Electric running
- Feature flags for gradual rollout
- Testing with simpler confirmed mode
- Emergency fallback if Electric has issues

## Decision

We will generate **unified entity wrappers** that abstract the sync mode, with **runtime configuration** that defaults to build-time values from the OpenAPI spec.

### Architecture

```
src/generated/
├── schemas/           # Zod schemas (all entities)
├── client/            # API client (all entities)
├── hooks/             # TanStack Query - raw hooks (all entities)
├── collections/       # TanStack DB - raw collections (local_first entities only)
├── entities/          # Unified wrappers (all entities) ← App imports from here
└── config.ts          # Runtime configuration
```

### Config Module

```typescript
// src/generated/config.ts

interface SyncConfig {
  electricUrl: string
  defaultLocalFirst: boolean
  entities: Record<string, boolean>
}

let config: SyncConfig = {
  electricUrl: '',
  defaultLocalFirst: false,
  entities: {
    // Baked in from OpenAPI x-sync.local_first at generation time
  }
}

export function configureSync(overrides: Partial<SyncConfig>): void {
  config = { ...config, ...overrides }
}

export function isLocalFirst(entity: string): boolean {
  // No Electric URL = always confirmed mode
  if (!config.electricUrl) return false
  return config.entities[entity] ?? config.defaultLocalFirst
}
```

### Unified Wrapper Pattern

```typescript
// src/generated/entities/{entity}.ts

import { isLocalFirst } from '../config'
import { {entity}Collection } from '../collections/{entity}'
import { use{Entity}Query, useCreate{Entity}Mutation } from '../hooks/{entity}'

export function use{Entity}s() {
  if (isLocalFirst('{entity}')) {
    return useLiveQuery((q) => q.from({ {entity}: {entity}Collection }))
  }
  return use{Entity}Query()
}

export function useCreate{Entity}() {
  if (isLocalFirst('{entity}')) {
    return {
      mutate: (data) => {entity}Collection.insert(data),
      mutateAsync: (data) => {entity}Collection.insert(data),
    }
  }
  return useCreate{Entity}Mutation()
}

// Re-export types
export type { {Entity}, {Entity}Create, {Entity}Update } from '../schemas/{entity}.schema'
```

### App Initialization

```typescript
// Consuming app's main.tsx
import { configureSync } from '@/generated/config'

configureSync({
  electricUrl: import.meta.env.VITE_ELECTRIC_URL ?? '',
  // Optional overrides
})
```

### App Usage

```typescript
// Component code - doesn't know or care about sync mode
import { useContacts, useCreateContact } from '@/generated/entities/contacts'

function ContactList() {
  const { data, isLoading } = useContacts()
  const createContact = useCreateContact()
  // Works identically in both modes
}
```

## Consequences

### Positive

- **Decoupled app code** - Components don't know sync implementation
- **Easy mode switching** - Change config, not code
- **Progressive enhancement** - Start confirmed, upgrade to optimistic per-entity
- **Dev flexibility** - Run without Electric locally
- **Feature flags** - Gradual rollout support
- **Graceful degradation** - Fallback if Electric unavailable

### Negative

- **Larger bundle** - Both code paths included for entities with `local_first: true`
- **Runtime overhead** - `isLocalFirst()` check on each hook call (minimal)
- **Return type complexity** - Must normalize TanStack Query and TanStack DB returns

### Neutral

- Apps import from `entities/` instead of `hooks/` or `collections/`
- Raw hooks/collections still available for advanced use cases
- Config must be called before first hook renders

## Alternatives Considered

### Build-time only (no runtime config)

- Tree-shaking removes unused code path
- No flexibility for local dev, feature flags, or fallback
- Rejected: flexibility outweighs bundle size savings

### Environment variables in generated code

- `import.meta.env.VITE_*` directly in generated files
- Tight coupling to specific env var names
- Rejected: config function is more flexible

### React Context for config

- `<SyncProvider config={...}>` wrapping app
- More "React-ish" pattern
- Rejected: adds complexity, simple module-level config sufficient

### Separate packages per mode

- `@generated/local-first` and `@generated/api`
- App chooses which to import
- Rejected: defeats purpose of unified interface

## References

- [ADR-005: Local Database Selection](005-local-database-selection.md)
- [ADR-006: Write Pattern Selection](006-write-pattern-selection.md)
- [TanStack DB Collections](https://tanstack.com/db/latest/docs/overview)
- [ElectricSQL + TanStack DB Integration](https://electric-sql.com/blog/2025/07/29/local-first-sync-with-tanstack-db)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-01 | Initial decision | Planning session |
