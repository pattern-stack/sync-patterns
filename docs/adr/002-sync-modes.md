# ADR-002: Sync Modes Definition

## Status

**Superseded**

> **Note (2025-12-01)**: The three-mode system (`push`/`live`/`cache`) described in this ADR was simplified to a single boolean `local_first` configuration:
>
> | Config | Behavior | Description |
> |--------|----------|-------------|
> | `local_first: true` | **Optimistic** | Write to local, sync later, UI instant |
> | `local_first: false` | **Confirmed** | Write to local, wait for server |
>
> The `cache` mode is deferred to Phase 2+. See [PLAN.md](../PLAN.md) for current implementation.
>
> **Do NOT use**: `push`, `sync`, `live`, `cache` - these terms are deprecated.

## Date

2025-11-29

## Context

Different types of data have different synchronization requirements:

1. **CRUD entities** (contacts, tasks, projects) - Benefit from instant local updates and background sync
2. **Direct API calls** (one-off fetches, writes that need immediate server validation) - Traditional request/response
3. **Computed results** (aggregations, metrics, expensive queries) - Pre-computed on server, cached locally

Local-first sync (mode 1) only works well for data that:
- Can be fully replicated to the client (or a relevant subset)
- Doesn't require server-side computation
- Benefits from offline access and instant UI

Additionally, we need a progressive enhancement path: teams should be able to start simple and adopt sync incrementally.

## Decision

We will support **three sync modes**, declared at the model level in backend-patterns:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `push` | Direct API calls via TanStack Query | Default; one-off fetches, server-validated writes |
| `live` | Real-time sync via ElectricSQL → TanStack DB → local SQLite | CRUD entities needing instant UI |
| `cache` | Sync pre-computed results from server cache (e.g., Redis) | Dashboards, metrics, expensive aggregations |

### Mode Details

#### `push` (Default)
```typescript
// Generated hook
function useAnalytics() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get('/analytics')
  })
}
```
- Traditional API call
- No local persistence
- Familiar TanStack Query pattern

#### `live`
```typescript
// Generated hook
function useContacts() {
  return useQuery(contactsCollection)  // TanStack DB + Electric
}
```
- Data syncs to local SQLite
- Instant reads from local DB
- Writes apply optimistically, sync in background
- Works offline

#### `cache` (Phase 2)
```typescript
// Generated hook
function useDashboardMetrics() {
  return useCachedQuery('dashboard_metrics', { ttl: 300 })
}
```
- Server computes expensive queries, stores in Redis
- Result syncs to client local store
- Read-only on client (server is source of computation)
- TTL-based or event-driven refresh

### Declaration Syntax (Preliminary)

```python
# In backend-patterns model
class Contact(Model):
    sync = "live"  # or "push" or "cache"

class AnalyticsSummary(Model):
    sync = "push"

class DashboardMetrics(Model):
    sync = "cache"
    cache_ttl = 300
```

## Consequences

### Positive

- **Progressive enhancement**: Start with `push` (safe default), flip to `live` when ready
- **Right tool for the job**: Different data types get appropriate sync behavior
- **Unified interface**: Components consume the same hook API regardless of mode
- **Clear mental model**: Three distinct modes with clear use cases

### Negative

- **Complexity**: Three modes to understand and maintain
- **Cache mode adds scope**: Requires metrics layer integration (deferred to Phase 2)

### Neutral

- Components don't know which mode is active - abstraction is intentional
- Mode is declared once in backend model, generated code handles the rest

## Alternatives Considered

### Two modes only (push/live)
- Simpler, covers 80% of cases
- Doesn't address expensive computed queries elegantly
- Would force computed results into `push` (no local caching benefit)

### Per-field sync modes
- More granular control
- Significantly more complexity
- Decided model-level is sufficient; can revisit if needed

## References

- [ADR-001: Sync Stack Selection](001-sync-stack-selection.md)
- [ElectricSQL Shapes](https://electric-sql.com/docs/guides/shapes)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-11-29 | Initial decision | Planning session |
