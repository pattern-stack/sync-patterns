# sync-patterns

The real-time data synchronization layer for Pattern Stack. Sits between backend-patterns and frontend-patterns to enable local-first, offline-capable applications with Linear/Notion-level UI snappiness.

## Architecture

```
                         OPENAPI SPEC
                    (single source of truth)
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      SYNC-PATTERNS CLI                       │
│                   (generates typed clients)                  │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      frontend-patterns  swift-patterns  kotlin-patterns
           (React)         (SwiftUI)       (Android)
              │               │               │
              ▼               ▼               ▼
         useLiveQuery    @Observable      Flow<T>
         useQuery        async/await      suspend fun
```

## The Problem

Traditional API-first architecture:
```
User clicks → API call → Wait 200-500ms → UI updates
```

Local-first architecture (Linear, Notion):
```
User clicks → UI updates instantly → Sync happens in background
```

## The Solution

Features declare their sync mode in the OpenAPI spec:

```yaml
paths:
  /contacts:
    x-sync: live    # real-time, local-first
  /analytics:
    x-sync: push    # traditional API calls
```

The CLI generates appropriate code for each mode:

**Live mode** (local-first, instant):
```typescript
export function useContacts() {
  return useLiveQuery(db.contacts.liveMany())
}
```

**Push mode** (traditional, API-backed):
```typescript
export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts')
  })
}
```

Components consume a unified interface - they don't know or care which mode is active:
```typescript
function ContactList() {
  const { data } = useContacts()  // works either way
  return data.map(c => <Contact key={c.id} {...c} />)
}
```

## Full Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EXTERNAL WORLD                         │
│           HubSpot  ·  Salesforce  ·  Google                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ webhooks / polling
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND-PATTERNS                          │
│    Business logic · Normalization · Orchestration           │
│                      PostgreSQL                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     SYNC LAYER                              │
│              ElectricSQL / Zero / TanStack DB               │
│              Real-time · Offline · Optimistic               │
└─────────────────────┬───────────────────────────────────────┘
                      │ instant sync
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND-PATTERNS                          │
│     Local DB (SQLite) · Instant reads · Instant writes      │
└─────────────────────────────────────────────────────────────┘
```

## Key Principles

1. **OpenAPI as source of truth** - Types and sync modes declared once, generated everywhere
2. **Progressive enhancement** - Start with `push`, flip to `live` when ready
3. **Backend unchanged** - Pattern Stack handles business logic, sync-patterns handles delivery
4. **Cross-platform** - Same spec generates React, SwiftUI, Kotlin clients
5. **Unified interface** - Components are agnostic to sync mode

## Sync Engine Candidates

| Engine | Pros | Cons |
|--------|------|------|
| **ElectricSQL** | Works with existing Postgres, mature | Requires specific Postgres setup |
| **Zero** | Clean API, good DX | Newer, smaller ecosystem |
| **TanStack DB** | Incremental adoption, TanStack ecosystem | Very new (2024) |
| **Convex** | Turnkey, great DX | Opinionated backend (may conflict with Pattern Stack) |

## Status

**Phase: Planning**

This repo captures the architectural vision. Implementation will follow once backend-patterns and frontend-patterns reach stability.

## Related

- [backend-patterns](../backend-patterns) - Atomic Architecture backend framework
- [frontend-patterns](../frontend-patterns) - React frontend framework
- [Linear sync engine talks](https://www.youtube.com/watch?v=WxK11RsLqp4) - Tuomas Artman
- [Zero](https://zero.rocicorp.dev/) - Aaron Boodman's sync engine
- [ElectricSQL](https://electric-sql.com/) - Postgres to SQLite sync
