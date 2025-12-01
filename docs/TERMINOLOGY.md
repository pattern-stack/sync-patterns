# sync-patterns Terminology Reference

> **This is the canonical terminology for sync-patterns. All documentation, code, and discussions should use these terms.**

## Sync Modes

| Config Value | Behavior Name | Description |
|--------------|---------------|-------------|
| `local_first: true` | **Optimistic** | Write to local DB immediately, sync to server in background, UI updates instantly |
| `local_first: false` | **Confirmed** | Write to local DB, wait for server confirmation before UI updates |

### Deprecated Terms - DO NOT USE

| Deprecated | Replacement |
|------------|-------------|
| `push` | `local_first: false` (confirmed) |
| `sync` | `local_first: true` (optimistic) |
| `live` | `local_first: true` (optimistic) |
| `cache` | Deferred to Phase 3, not currently in scope |

## Configuration

### Backend (Pattern Config)

```python
class Pattern:
    local_first: bool = False  # Default: confirmed mode (safe)
```

### OpenAPI Extension

```yaml
paths:
  /contacts:
    x-sync:
      local_first: true
```

### Generated Code (Runtime Config)

```typescript
interface SyncConfig {
  electricUrl: string
  defaultLocalFirst: boolean
  entities: Record<string, boolean>  // entity name -> local_first
}
```

## Data Flow Terms

| Term | Definition |
|------|------------|
| **Synced data** | Data received from server via ElectricSQL, immutable locally |
| **Optimistic state** | Local mutations not yet confirmed by server |
| **Confirmed state** | Mutations acknowledged by server, synced back via Electric |
| **txid** | PostgreSQL transaction ID used to coordinate optimistic state lifecycle |

## Component Terms

| Term | Definition |
|------|------------|
| **Collection** | TanStack DB data container for a single entity type |
| **Live Query** | Reactive query that updates when underlying collection changes |
| **Shape** | ElectricSQL subscription defining what data to sync from a table |
| **Unified Wrapper** | Generated hook that abstracts whether entity uses optimistic or confirmed mode |

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Consuming App                                               │
│  └── Uses: useContacts(), useCreateContact(), etc.          │
├─────────────────────────────────────────────────────────────┤
│  Generated Unified Wrappers (entities/)                      │
│  └── Chooses: TanStack DB or TanStack Query based on config │
├─────────────────────────────────────────────────────────────┤
│  Generated Collections (collections/)     │  Generated Hooks │
│  └── TanStack DB + Electric               │  └── TanStack Q  │
├─────────────────────────────────────────────────────────────┤
│  Generated Schemas (schemas/)                                │
│  └── Zod schemas for runtime validation                      │
├─────────────────────────────────────────────────────────────┤
│  Generated API Client (client/)                              │
│  └── Axios-based, used by both paths                         │
└─────────────────────────────────────────────────────────────┘
```

## Field-Level Config

| Config | Location | Description |
|--------|----------|-------------|
| `sync_exclude: true` | Field | Field stored locally only, not synced |
| `owner_only: true` | Field | RBAC metadata (Phase 2 enforcement) |

## Behavior Summary

### Optimistic (`local_first: true`)

1. User action triggers mutation
2. TanStack DB applies change to collection immediately
3. UI re-renders with new data (instant)
4. Background: mutation handler POSTs to API
5. API returns `txid`
6. Electric syncs confirmed data back
7. TanStack DB drops optimistic state when `txid` matches

### Confirmed (`local_first: false`)

1. User action triggers mutation
2. TanStack DB applies change with `{ optimistic: false }`
3. UI shows loading/pending state
4. Mutation handler POSTs to API
5. Awaits server response
6. On success: UI updates with confirmed data
7. On failure: Error displayed, no local state changed

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────┐
│                    SYNC-PATTERNS TERMS                      │
├────────────────────────────────────────────────────────────┤
│  local_first: true   →  Optimistic  →  Instant UI          │
│  local_first: false  →  Confirmed   →  Wait for server     │
├────────────────────────────────────────────────────────────┤
│  ❌ push, sync, live, cache  →  DEPRECATED                 │
└────────────────────────────────────────────────────────────┘
```
