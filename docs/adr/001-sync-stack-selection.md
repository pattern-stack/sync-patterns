# ADR-001: Sync Stack Selection

## Status

**Accepted**

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

## Decision

We will use **TanStack DB + TanStack Query + ElectricSQL** as our sync stack:

- **TanStack Query** - Network layer, caching, API calls (many teams already use this)
- **TanStack DB** - Client-side reactive store with normalized storage, live queries, and optimistic mutations
- **ElectricSQL** - Sync engine for real-time Postgres → SQLite synchronization

```
Backend-patterns (Postgres)
        │
        ▼
   ElectricSQL (sync engine)
        │
        ▼
   TanStack DB (client store) + TanStack Query (network layer)
        │
        ▼
Frontend-patterns (React + SQLite)
```

## Consequences

### Positive

- **Incremental adoption**: TanStack DB wraps existing TanStack Query calls; no rip-and-replace
- **Familiar DX**: TanStack ecosystem is widely adopted
- **First-class integration**: ElectricSQL and TanStack DB have active collaboration
- **Works with existing Postgres**: No backend database migration required
- **Future-proof**: Can start with `push` mode (API calls) and upgrade to `live` mode (sync) per-model

### Negative

- **ElectricSQL operational overhead**: Requires running Electric service between Postgres and clients
- **Ecosystem maturity**: TanStack DB targeting 1.0 in December 2025; still maturing
- **No Zero support**: If we later want Zero, we'd need to build a custom TanStack DB collection

### Neutral

- SQLite on frontend is standard for local-first; frontend-patterns will own this decision
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

- [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)
- [Electric Collection Docs](https://tanstack.com/db/latest/docs/collections/electric-collection)
- [ElectricSQL Documentation](https://electric-sql.com/docs)
- [TanStack DB 0.5 - Query-Driven Sync](https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-29 | Initial decision | Planning session |
