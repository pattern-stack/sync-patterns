# ADR-006: Write Pattern Selection

## Status

**Accepted**

## Date

2025-12-01

## Context

ElectricSQL handles **read-path sync only** (Postgres → Client). It does not prescribe how writes get back to Postgres. The [ElectricSQL Writes Guide](https://electric-sql.com/docs/guides/writes) documents four patterns:

| Pattern | Description | Complexity |
|---------|-------------|------------|
| **1. Online writes** | Direct API calls, no local state | Low |
| **2. Optimistic state** | In-memory optimistic state during API call | Medium |
| **3. Shared persistent optimistic state** | Optimistic state persisted, shared across tabs | Medium-High |
| **4. Through-the-database** | Full local-first with embedded DB | High |

We need a pattern that:
1. Provides instant UI feedback (local-first feel)
2. Works offline (queue mutations)
3. Handles rollback when server rejects
4. Supports both optimistic (`local_first=True`) and confirmed (`local_first=False`) modes

## Decision

We will use **Pattern 4: Through-the-Database** as our write pattern.

### How It Works

Two tables per entity, unified by a view:

```
┌─────────────────────────────────────────────────────────────┐
│                     LOCAL DATABASE                           │
│                                                              │
│  ┌─────────────────┐      ┌─────────────────┐               │
│  │ contacts_synced │      │  contacts_local │               │
│  │ (from Electric) │      │  (your edits)   │               │
│  └────────┬────────┘      └────────┬────────┘               │
│           │                        │                         │
│           └───────────┬────────────┘                         │
│                       ▼                                      │
│              ┌─────────────────┐                            │
│              │ contacts (VIEW) │ ◄── App reads/writes here  │
│              │ local > synced  │                            │
│              └────────┬────────┘                            │
│                       │                                      │
│                       ▼                                      │
│              ┌─────────────────┐                            │
│              │    _changes     │ ◄── Sent to API            │
│              └─────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Write Flow

1. **App writes to view** → Trigger routes to `_local` table + `_changes` log
2. **UI sees change instantly** → View merges local + synced (local wins)
3. **Sync utility** → Reads `_changes`, POSTs to backend-patterns API
4. **API writes to Postgres** → Returns `txid`
5. **Electric syncs back** → Change appears in `_synced` table
6. **Cleanup trigger** → Matching `write_id` deletes from `_local`

### Schema Structure

```sql
-- Server state (synced via Electric, immutable locally)
CREATE TABLE contacts_synced (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    email TEXT,
    write_id TEXT  -- For matching optimistic writes
);

-- Local optimistic state
CREATE TABLE contacts_local (
    id TEXT PRIMARY KEY,
    first_name TEXT,
    email TEXT,
    changed_columns TEXT,  -- JSON array of modified fields
    is_deleted INTEGER DEFAULT 0,
    write_id TEXT NOT NULL
);

-- Unified view
CREATE VIEW contacts AS
SELECT
    COALESCE(local.id, synced.id) AS id,
    CASE WHEN local.changed_columns LIKE '%"first_name"%'
         THEN local.first_name
         ELSE synced.first_name END AS first_name,
    -- ...
FROM contacts_synced synced
FULL OUTER JOIN contacts_local local ON synced.id = local.id
WHERE COALESCE(local.is_deleted, 0) = 0;

-- Change log
CREATE TABLE _changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,  -- 'insert' | 'update' | 'delete'
    value TEXT NOT NULL,      -- JSON payload
    write_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
```

## Consequences

### Positive

- **True local-first** - App code just reads/writes to views
- **Works offline** - Changes queue in `_changes` table
- **Automatic reconciliation** - `write_id` matching handles cleanup
- **Generatable** - Schema is mechanical, derived from OpenAPI spec
- **Unified interface** - Same view for both sync modes

### Negative

- **Complex local schema** - Three tables + view + triggers per entity
- **Rollback context loss** - When server rejects, limited info for error handling
- **SQL complexity** - Triggers and views require careful generation

### Neutral

- Complexity is hidden by sync-patterns code generation
- Developers interact with simple views, not the underlying tables
- Pattern is well-documented by ElectricSQL team

## Alternatives Considered

### Pattern 1: Online writes only

- **Pro**: Simplest, no local state
- **Con**: No offline support, no instant UI
- **Decision**: Doesn't meet local-first requirements

### Pattern 2: In-memory optimistic state

- **Pro**: Simpler than Pattern 4
- **Con**: Lost on page refresh, no offline support
- **Decision**: Not durable enough

### Pattern 3: Shared persistent optimistic state

- **Pro**: Persists across tabs, simpler than Pattern 4
- **Con**: Optimistic state separate from synced state, more app code complexity
- **Decision**: Pattern 4 unifies reads, cleaner for generated code

### Custom sync layer

- **Pro**: Full control
- **Con**: Reinvents solved problems (conflict resolution, offline queue)
- **Decision**: Use proven pattern, don't reinvent

## References

- [ElectricSQL Writes Guide](https://electric-sql.com/docs/guides/writes)
- [Pattern 4 Example Code](https://github.com/electric-sql/electric/tree/main/examples/write-patterns/patterns/4-through-the-db)
- [Local-first with your existing API](https://electric-sql.com/blog/2024/11/21/local-first-with-your-existing-api)
- [ADR-005: Local Database Selection](005-local-database-selection.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-01 | Initial decision | Planning session |
