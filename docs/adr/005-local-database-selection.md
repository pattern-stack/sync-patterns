# ADR-005: Local Database Selection

## Status

**Deferred** (2025-12-26)

> **Note**: Local database selection is deferred along with Electric integration. Current architecture uses TanStack Query in-memory cache only. When offline support becomes a requirement, this ADR's decision (PGlite) remains the intended direction. See [SYNC-012](../specs/SYNC-012-broadcast-optimistic-sync.md).

## Date

2025-12-01

## Context

sync-patterns needs a local database on the client to enable:

1. Instant UI updates (no network latency)
2. Offline support (queue mutations, sync when online)
3. Optimistic writes with rollback capability
4. Local-first architecture per Pattern 4 (through-the-database)

The primary candidates are:

| Option | Description | Platforms |
|--------|-------------|-----------|
| **PGlite** | Postgres compiled to WASM | Web, Node, Bun, Deno |
| **SQLite** | Via wa-sqlite, sql.js, etc. | Web, iOS, Android, Node |

Key consideration: The application will start as a web app but will need iOS support within ~6 months.

## Decision

We will use **PGlite** as the initial local database, with an **adapter abstraction** that allows swapping to SQLite when iOS support is needed.

### Rationale

1. **Same SQL dialect as Postgres** - No type mapping or SQL translation needed between backend (Postgres) and client (PGlite)
2. **ElectricSQL first-class support** - PGlite is built by the Electric team with tight integration
3. **Faster initial development** - Schema generated once, works on both server and client
4. **iOS is 6+ months away** - PGlite native support may land by then; if not, we add SQLite adapter

### Adapter Strategy

TanStack DB provides the abstraction layer. sync-patterns generates:

```
src/generated/
├── schema/
│   ├── contacts.pglite.sql   ← Used now
│   └── contacts.sqlite.sql   ← Generated but unused until iOS
├── collections/
│   └── contacts.ts           ← Same regardless of DB
└── config.ts                 ← LOCAL_DB_ADAPTER = 'pglite' | 'sqlite'
```

When iOS is needed:
1. Generate SQLite schemas (type mapping: UUID→TEXT, TIMESTAMPTZ→TEXT, JSONB→TEXT)
2. Add SQLite collection wrapper
3. Flip config flag

## Consequences

### Positive

- **Zero translation overhead** - Postgres types work directly
- **Simpler Phase 1** - One SQL dialect to think about
- **Future flexibility** - Adapter pattern allows swap without rewrite
- **If PGlite ships native** - No migration needed, we win

### Negative

- **Web-only initially** - Can't do iOS/Android until adapter is built
- **PGlite maturity** - Newer than SQLite ecosystem
- **If PGlite native never ships** - Must build SQLite adapter (estimated 1-2 days)

### Neutral

- SQLite adapter work is deferred, not eliminated
- Either database works with TanStack DB and Electric

## Alternatives Considered

### SQLite from day one

- **Pro**: Works everywhere immediately
- **Con**: Requires type mapping between Postgres and SQLite
- **Con**: Different SQL dialects to maintain
- **Decision**: Deferred complexity not worth it for web-only Phase 1

### Dual-track (PGlite for web, SQLite for mobile)

- **Pro**: Best of both worlds
- **Con**: More complexity from day one
- **Decision**: YAGNI - build when needed

### Wait for PGlite native support

- **Pro**: Single codebase forever
- **Con**: No timeline, blocks iOS work
- **Decision**: Can't block on uncertain roadmap

## References

- [PGlite GitHub](https://github.com/electric-sql/pglite)
- [PGlite React Native Support Issue #87](https://github.com/electric-sql/pglite/issues/87)
- [PGlite Benchmarks](https://pglite.dev/benchmarks)
- [ADR-001: Sync Stack Selection](001-sync-stack-selection.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-01 | Initial decision | Planning session |
