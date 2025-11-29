# sync-patterns: Working Plan

> **Last Updated**: 2025-11-29
> **Status**: Planning Phase

This is a living document that captures the current state of planning for sync-patterns. It will be updated as decisions are made and implementation progresses.

---

## Vision

A CLI that generates typed clients from OpenAPI specs, enabling local-first applications with Linear/Notion-level UI responsiveness. Sits between backend-patterns and frontend-patterns.

**Core value proposition**: Features declare sync mode once in backend models; the CLI generates appropriate client code. Components consume a unified interface regardless of sync mode.

---

## Architecture

```
BACKEND-PATTERNS (Postgres - source of truth)
        │
        │  Models declare sync mode via annotations
        ▼
   SYNC-PATTERNS CLI
        │
        │  Reads OpenAPI spec (includes sync metadata)
        │  Generates: types, hooks, SQLite schema
        ▼
   ELECTRICSQL (sync engine for 'live' mode)
        │
        ▼
   TANSTACK DB + TANSTACK QUERY (client layer)
        │
        ▼
FRONTEND-PATTERNS (SQLite - source of change)
```

---

## Key Decisions

See [Architecture Decision Records](adr/README.md) for full context.

| Decision | Summary | ADR |
|----------|---------|-----|
| Sync Stack | TanStack DB + TanStack Query + ElectricSQL | [ADR-001](adr/001-sync-stack-selection.md) |
| Sync Modes | `push`, `live`, `cache` (Phase 2) | [ADR-002](adr/002-sync-modes.md) |
| Defaults | `push` default, backend wins conflicts, convention over config | [ADR-003](adr/003-default-behaviors.md) |
| Phasing | Phase 1: push/live, Phase 2: cache | [ADR-004](adr/004-phased-implementation.md) |

---

## Sync Modes

| Mode | Behavior | Phase |
|------|----------|-------|
| `push` | Direct API calls via TanStack Query | 1 |
| `live` | Real-time sync via ElectricSQL → local SQLite | 1 |
| `cache` | Sync pre-computed results from metrics layer | 2 |

---

## Smart Defaults

| Aspect | Default | Override |
|--------|---------|----------|
| Sync mode | `push` | `sync: live` on model |
| Conflict resolution | Backend wins | Configurable per model |
| Sync timing | Immediate with retry | Configurable |
| Fields synced | All | `sync_exclude: [field]` |

---

## Implementation Phases

### Phase 1: Core Sync (Current Target)

- [ ] Define model annotation syntax for backend-patterns
- [ ] CLI reads OpenAPI spec with sync metadata
- [ ] Generate TypeScript types
- [ ] Generate `push` mode hooks (TanStack Query)
- [ ] Generate `live` mode hooks (TanStack DB + Electric)
- [ ] Generate SQLite schema for `live` models
- [ ] Documentation and examples
- [ ] Integration test with real project

### Phase 2: Cache Mode

- [ ] Define cache mode configuration
- [ ] Integrate with backend-patterns caching/metrics layer
- [ ] Generate `cache` mode hooks
- [ ] TTL and invalidation support

### Phase 3: Advanced (Future)

- [ ] Custom conflict resolution
- [ ] Partial/filtered sync
- [ ] Cross-platform clients (SwiftUI, Kotlin)
- [ ] Batched sync modes

---

## Open Questions

Questions to be resolved as implementation progresses:

1. **Model annotation syntax** - Exact syntax for declaring sync mode in backend-patterns models
2. **ElectricSQL deployment** - How to deploy/manage Electric service
3. **Sync timing configuration** - What configurability is needed beyond "immediate"?
4. **Metrics layer integration** - How does cache mode connect to the metrics layer?
5. **Error handling** - How to surface sync errors to the UI?

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| backend-patterns stability | In progress | Need stable model structure for annotations |
| frontend-patterns stability | In progress | Need stable project structure for generated code |
| Metrics layer | Not started | Required for Phase 2 cache mode |

---

## Planning History

| Date | Milestone |
|------|-----------|
| 2025-11-29 | Initial planning session; core decisions made (ADR-001 through ADR-004) |

---

## Notes & Ideas

Space for capturing ideas, concerns, and notes during development:

- *Add notes here as planning evolves*

---

## Related Documents

- [README.md](../README.md) - Project overview
- [CLAUDE.md](../CLAUDE.md) - AI assistant context
- [ADRs](adr/README.md) - Architecture decisions
