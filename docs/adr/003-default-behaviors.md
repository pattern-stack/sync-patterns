# ADR-003: Default Behaviors and Configuration Philosophy

## Status

**Accepted**

## Date

2025-11-29

## Context

sync-patterns is a framework intended for use across multiple projects. It needs to:

1. Work out of the box with sensible defaults
2. Require minimal configuration for common cases
3. Allow customization when needed
4. "Slot easily" between backend-patterns and frontend-patterns with minimal changes to either

The guiding principle is **convention over configuration** - smart defaults with escape hatches.

## Decision

### Default Behaviors

| Aspect | Default | Override |
|--------|---------|----------|
| **Sync mode** | `push` | `sync: live` or `sync: cache` on model |
| **Conflict resolution** | Backend wins | Configurable per model (future) |
| **Sync timing** | Immediate with retry | Configurable (future) |
| **Fields synced** | All fields | `sync_exclude: [field_name]` |
| **Offline behavior** | Queue writes, sync when online | Configurable (future) |

### Rationale for Each Default

#### Sync mode: `push`
- Safest default; no sync infrastructure required
- Explicit opt-in to sync complexity
- Teams can progressively adopt `live` mode

#### Conflict resolution: Backend wins
- Backend-patterns is the source of truth
- Simplest mental model
- Frontend is "source of change" but backend has final authority
- Future: support last-write-wins, custom merge strategies

#### Sync timing: Immediate with retry
- Best UX for most cases
- Changes sync as soon as possible
- Automatic retry on failure
- Future: support batched sync, on-demand sync

#### Fields synced: All
- Simplest default
- Explicit exclusion for sensitive or large fields
- Example: `sync_exclude: ['password_hash', 'large_blob']`

### Configuration Hierarchy

```
1. Framework defaults (this ADR)
      ↓
2. Project-level config (sync-patterns.yaml or similar)
      ↓
3. Model-level annotations (in backend-patterns models)
      ↓
4. Field-level annotations (sync_exclude, etc.)
```

Lower levels override higher levels.

## Consequences

### Positive

- **Low barrier to entry**: Works without configuration
- **Progressive complexity**: Simple cases stay simple, complex cases are possible
- **Predictable**: Defaults are documented and consistent
- **Safe**: Default to `push` means no accidental sync of sensitive data

### Negative

- **Hidden behavior**: Developers must learn defaults to understand system
- **Future configuration scope**: Many overrides marked as "future" - need to implement

### Neutral

- Defaults may need adjustment as we learn from real usage
- This ADR should be updated as new defaults are established

## Alternatives Considered

### Require explicit configuration for everything
- More explicit, less magic
- Higher barrier to entry
- Doesn't fit "slots easily" goal

### Default to `live` mode
- More exciting out of the box
- Dangerous - could sync sensitive data accidentally
- Requires sync infrastructure from day one

## References

- [ADR-001: Sync Stack Selection](001-sync-stack-selection.md)
- [ADR-002: Sync Modes Definition](002-sync-modes.md)
- [Ruby on Rails Convention over Configuration](https://rubyonrails.org/doctrine#convention-over-configuration)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-29 | Initial decision | Planning session |
