# ADR-001: Sync Stack Selection

## Status

**Accepted** (Amended 2025-12-28)

## Date

2025-11-29

## Context

sync-patterns needs a technology stack to enable local-first, real-time data synchronization between backend-patterns (Postgres) and frontend-patterns (React). The solution must:

1. Work with existing Postgres databases (backend-patterns uses Postgres)
2. Enable instant UI updates via local database on the client
3. Support incremental adoption (not require full rewrite)
4. Provide familiar developer experience
5. "Slot easily" between the two patterns with minimal changes to either

We evaluated several sync engine candidates:
- **ElectricSQL** - Postgres-native sync engine
- **Zero** - Clean API sync engine from Rocicorp
- **TanStack DB** - Client-side reactive store (not a full sync solution)
- **Convex** - Turnkey but requires their backend

---

## Current Implementation (2025-12-28)

**Stack: TanStack DB + TanStack Query + Broadcast**

```
Backend-patterns (Postgres)
        │
        ├──────────────────────────────┐
        ▼                              ▼
   REST API                    WebSocket Broadcast
        │                              │
        ▼                              ▼
   TanStack Query              BroadcastProvider
   (network layer)             (cache invalidation)
        │                              │
        └──────────┬───────────────────┘
                   ▼
            TanStack DB
         (normalized store)
                   │
                   ▼
            Live Queries
         (reactive UI updates)
```

**What this provides:**
- ✅ Normalized storage (same entity = single object across queries)
- ✅ Live queries (mutations update all subscribers instantly)
- ✅ Optimistic updates (UI instant, API confirms in background)
- ✅ Cross-client sync (broadcast triggers refetch)
- ❌ Offline persistence (deferred - data lost on refresh)

**See:** [SYNC-014: TanStack DB as Primary Data Layer](../specs/SYNC-014-tanstack-db-collections.md)

---

## Target Architecture (When Offline Required)

**Stack: TanStack DB + TanStack Query + PGlite + ElectricSQL**

```
Backend-patterns (Postgres)
        │
        ├──────────────────────────────┐
        ▼                              ▼
   ElectricSQL                  WebSocket Broadcast
   (Postgres → PGlite sync)     (change notifications)
        │                              │
        ▼                              ▼
      PGlite                    BroadcastProvider
   (local Postgres WASM)               │
        │                              │
        └──────────┬───────────────────┘
                   ▼
            TanStack DB
         (normalized store)
                   │
                   ▼
            Live Queries
```

**What this adds:**
- ✅ Offline reads (PGlite persists data locally)
- ✅ Offline writes (queue mutations, sync when online)
- ✅ Automatic sync (Electric handles Postgres replication)

**Trigger:** When offline support becomes a hard requirement for sales-patterns or aloevera.

---

## Original Decision

We will use **TanStack DB + TanStack Query** as our client stack, with **ElectricSQL + PGlite** added when offline is required:

- **TanStack Query** - Network layer, caching, API calls (many teams already use this)
- **TanStack DB** - Client-side reactive store with normalized storage, live queries, and optimistic mutations
- **PGlite** - Postgres in WASM (same SQL as backend, persistence)
- **ElectricSQL** - Sync engine for real-time Postgres → PGlite replication

## Consequences

### Positive

- **Incremental adoption**: TanStack DB wraps existing TanStack Query calls; no rip-and-replace
- **Familiar DX**: TanStack ecosystem is widely adopted
- **First-class integration**: ElectricSQL and TanStack DB have active collaboration
- **Works with existing Postgres**: No backend database migration required
- **Future-proof**: Can start with confirmed mode (`local_first: false`) and upgrade to optimistic mode (`local_first: true`) per-entity

### Negative

- **ElectricSQL operational overhead**: Requires running Electric service between Postgres and clients
- **Ecosystem maturity**: TanStack DB targeting 1.0 in December 2025; still maturing
- **No Zero support**: If we later want Zero, we'd need to build a custom TanStack DB collection

### Neutral

- PGlite on frontend gives same SQL as backend (Postgres everywhere)
- Lock-in to TanStack ecosystem (but it's widely adopted and open source)

## Alternatives Considered

### Zero
- Clean API, good DX
- No built-in TanStack DB integration
- Would require custom collection implementation
- Smaller ecosystem than Electric

### Building our own thin sync layer
- Full control, fits exactly between the patterns
- Significant engineering effort
- Would reinvent solved problems (conflict resolution, offline queue, sync protocol)
- Decided this was wasteful given mature options exist

### Convex
- Excellent DX, turnkey solution
- Requires using Convex backend, conflicts with backend-patterns architecture
- Not compatible with existing Postgres

## References

- [SYNC-014: TanStack DB as Primary Data Layer](../specs/SYNC-014-tanstack-db-collections.md)
- [SYNC-012: Broadcast + Optimistic Sync](../specs/SYNC-012-broadcast-optimistic-sync.md)
- [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)
- [PGlite Documentation](https://pglite.dev/)
- [ElectricSQL Documentation](https://electric-sql.com/docs)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-29 | Initial decision | Planning session |
| 2025-12-26 | Amended: Electric deferred, using TanStack Query + Broadcast | Review session |
| 2025-12-28 | Clarified: TanStack DB is primary data layer (SYNC-014), PGlite replaces SQLite | Review session |
