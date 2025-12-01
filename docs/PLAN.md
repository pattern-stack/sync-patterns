# sync-patterns: Working Plan

> **Last Updated**: 2025-12-01
> **Status**: Planning Phase

This is a living document that captures the current state of planning for sync-patterns. It will be updated as decisions are made and implementation progresses.

---

## Vision

A CLI that generates typed clients from OpenAPI specs, enabling local-first applications with Linear/Notion-level UI responsiveness. Sits between backend-patterns and frontend-patterns.

**Core value proposition**: Features declare sync mode once in backend models; the CLI generates appropriate client code. Components consume a unified interface regardless of sync mode.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────────┐ │
│  │   UI     │◄──►│  TanStack DB │◄──►│  PGlite (local)       │ │
│  │          │    │  (reactive)  │    │  (source of change)   │ │
│  └──────────┘    └──────────────┘    └───────────────────────┘ │
│                                              │                  │
│                                              │ sync             │
└──────────────────────────────────────────────│──────────────────┘
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                  │
│  ┌──────────────┐    ┌───────────────────────┐                 │
│  │  ElectricSQL │◄──►│  Postgres             │                 │
│  │  (sync)      │    │  (source of truth)    │                 │
│  └──────────────┘    └───────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight**: Local SQLite is always present. The question is: *when do we tell the user it worked?*

---

## Key Decisions

See [Architecture Decision Records](adr/README.md) for full context.

| Decision | Summary | ADR |
|----------|---------|-----|
| Sync Stack | TanStack DB + TanStack Query + ElectricSQL | [ADR-001](adr/001-sync-stack-selection.md) |
| Write Modes | `local_first` (optimistic) vs confirmed | [ADR-002](adr/002-sync-modes.md) |
| Defaults | `local_first=False` (safe), backend wins conflicts | [ADR-003](adr/003-default-behaviors.md) |
| Phasing | Phase 1: metadata foundation, Phase 2: RBAC enforcement | [ADR-004](adr/004-phased-implementation.md) |
| Local Database | PGlite (Postgres WASM), SQLite adapter for mobile later | [ADR-005](adr/005-local-database-selection.md) |
| Write Pattern | Pattern 4: Through-the-Database | [ADR-006](adr/006-write-pattern-selection.md) |

---

## Write Modes

| Mode | Config | Behavior | Use Case |
|------|--------|----------|----------|
| **Optimistic** | `local_first = True` | Write to local DB, sync later, UI instant | User data, collaborative editing |
| **Confirmed** | `local_first = False` | Write to local DB, wait for server | Financial, permission-sensitive |

Both modes use PGlite. The difference is **when we tell the user it worked**.

---

## Client-Side Architecture

> **Full Spec**: [SYNC-002-client-architecture.md](specs/SYNC-002-client-architecture.md)

### Pattern 4: Through-the-Database

For each synced model, sync-patterns generates:

| Component | Purpose |
|-----------|---------|
| `{entity}_synced` table | Immutable server state (from Electric) |
| `{entity}_local` table | Optimistic/pending changes |
| `{entity}` view | Unified read/write interface (local > synced) |
| `_changes` table | Queue of writes to send to API |
| Triggers | Route writes, log changes, cleanup on sync |

### Write Flow

```
App writes to view
       │
       ▼
Trigger routes to _local + _changes
       │
       ▼
View reflects change (instant UI)
       │
       ▼ (background)
Sync worker POSTs _changes to API
       │
       ▼
Electric syncs from Postgres
       │
       ▼
Cleanup trigger removes from _local
```

### Generated Output

```
src/generated/
├── db/init.ts              # Database initialization
├── schema/*.sql            # PGlite schemas
├── collections/*.ts        # TanStack DB collections
├── types/*.ts              # TypeScript interfaces
└── index.ts                # Re-exports
```

---

## Backend-Patterns Integration

> **Full Spec**: [SYNC-001-backend-patterns-integration.md](specs/SYNC-001-backend-patterns-integration.md)

### Model Configuration

```python
class Contact(ActorPattern):
    __tablename__ = "contacts"

    class Pattern:
        entity = "contact"

        # === Sync Configuration ===
        local_first = True  # Optimistic writes

        # === RBAC Metadata (not enforced in Phase 1) ===
        field_groups = {
            "basic": ["first_name", "last_name", "email"],
            "financial": ["credit_limit"],
        }
        role_permissions = {
            "viewer": [],
            "editor": ["basic"],
            "owner": ["basic", "financial"],
        }

    # Standard fields
    first_name = Field(str, required=True)
    email = Field(str, unique=True)

    # Local-only field (not synced)
    local_notes = Field(str, sync_exclude=True)

    # Owner-only field (RBAC metadata, not enforced yet)
    credit_limit = Field(Decimal, owner_only=True)
```

### OpenAPI Extensions

sync-patterns reads these from the generated OpenAPI spec:

```yaml
paths:
  /api/contacts:
    x-sync:
      local_first: true
    x-rbac:
      field_groups: {...}
      role_permissions: {...}

components:
  schemas:
    Contact:
      properties:
        local_notes:
          x-sync-exclude: true
        credit_limit:
          x-owner-only: true
```

---

## Smart Defaults

| Aspect | Default | Override |
|--------|---------|----------|
| Write mode | `local_first = False` | `local_first = True` on Pattern |
| Fields synced | All | `sync_exclude=True` on Field |
| Field editability | Any role | `owner_only=True` on Field |
| Conflict resolution | Backend wins | Future: configurable |

---

## Implementation Phases

### Phase 1: Metadata Foundation (Current Target)

**Backend-Patterns Changes:**
- [x] Design spec complete ([SYNC-001](specs/SYNC-001-backend-patterns-integration.md))
- [ ] Add `local_first` to Pattern config with validation
- [ ] Add `sync_exclude` to Field class
- [ ] Add `owner_only` to Field class (metadata only)
- [ ] Add `field_groups` / `role_permissions` to Pattern (metadata only)
- [ ] Custom OpenAPI schema hook for `x-sync` and `x-rbac` extensions
- [ ] Documentation

**sync-patterns CLI:**
- [ ] Read OpenAPI spec with `x-sync` extensions
- [ ] Generate TypeScript types
- [ ] Generate optimistic mutation hooks (`local_first=True`)
- [ ] Generate confirmed mutation hooks (`local_first=False`)
- [ ] Generate SQLite schema for synced models
- [ ] Integration test with finance_tracker

### Phase 2: RBAC Enforcement (Future)

- [ ] Role column in database join tables (`user_accounts.role`)
- [ ] `_role` included in API responses
- [ ] Server-side permission enforcement in API facade
- [ ] Client-side permission checking in generated hooks
- [ ] Permission-aware UI generation

### Phase 3: Advanced (Future)

- [ ] Custom conflict resolution strategies
- [ ] Partial/filtered sync (sync subsets of data)
- [ ] Cross-platform clients (SwiftUI, Kotlin)
- [ ] Cache mode for pre-computed metrics

---

## Current Authorization Model

```
Phase 1: If you can see it, you can use it.
```

- Access is binary via household/tenant scoping
- No edit vs. view distinction per row
- RBAC metadata is stored but NOT enforced
- Enforcement comes in Phase 2 when RBAC requirements are concrete

---

## Open Questions

~~1. **Model annotation syntax** - Exact syntax for declaring sync mode~~ ✅ Resolved: `local_first` in Pattern config

Questions remaining:
1. **ElectricSQL deployment** - How to deploy/manage Electric service
2. **Error handling** - How to surface sync errors/rollbacks to UI
3. **Conflict resolution** - What strategies beyond "backend wins"?
4. **Cache mode** - How does it integrate with metrics layer? (Phase 3)

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| backend-patterns stability | ✅ Ready | Model structure stable, can add sync config |
| frontend-patterns stability | In progress | Need stable project structure for generated code |
| RBAC requirements | Not started | Required for Phase 2 enforcement |

---

## Planning History

| Date | Milestone |
|------|-----------|
| 2025-11-29 | Initial planning session; core decisions made (ADR-001 through ADR-004) |
| 2025-11-29 | Backend-patterns integration review; SYNC-001 spec drafted |
| 2025-12-01 | Client-side architecture decisions; ADR-005, ADR-006, SYNC-002 drafted |

---

## Notes & Ideas

- **RBAC future direction**: Role-per-row via join table, `_role` in responses, client computes editability
- **Optimistic rollback**: If server rejects, sync engine rolls back local change and surfaces error
- **UI implications**: Client uses `_role` + `owner_only` metadata to show/hide edit controls

---

## Related Documents

- [README.md](../README.md) - Project overview
- [CLAUDE.md](../CLAUDE.md) - AI assistant context
- [ADRs](adr/README.md) - Architecture decisions
- [SYNC-001](specs/SYNC-001-backend-patterns-integration.md) - Backend-patterns integration spec
- [SYNC-002](specs/SYNC-002-client-architecture.md) - Client-side architecture spec
