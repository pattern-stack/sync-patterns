# SPEC: Client-Side Architecture for sync-patterns

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-002 |
| **Title** | Client-Side Sync Architecture |
| **Status** | Draft |
| **Created** | 2025-12-01 |
| **Phase** | 1 |
| **Depends On** | [SYNC-001](SYNC-001-backend-patterns-integration.md) |

---

## Executive Summary

This specification defines the client-side architecture for sync-patterns: how the generated code structures local storage, handles writes, and integrates with ElectricSQL and TanStack DB.

### Goals

1. Define the local database schema pattern (Pattern 4: Through-the-Database)
2. Specify what sync-patterns CLI generates for each model
3. Document the write flow for both `local_first=True` and `local_first=False` modes
4. Establish the adapter pattern for future SQLite support

### Non-Goals

- iOS/Android native implementation (Phase 3)
- SQLite adapter implementation (deferred until needed)
- Custom conflict resolution (Phase 3)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         React App                                 │   │
│  │                                                                   │   │
│  │   useContacts()  ──►  TanStack DB Collection  ──►  contacts view │   │
│  │                                                                   │   │
│  └───────────────────────────────────┬──────────────────────────────┘   │
│                                      │                                   │
│  ┌───────────────────────────────────┴──────────────────────────────┐   │
│  │                         PGlite (Local)                            │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │   │
│  │  │ contacts_synced │  │ contacts_local  │  │     _changes     │  │   │
│  │  │ (from Electric) │  │ (your edits)    │  │ (pending writes) │  │   │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘  │   │
│  │           │                    │                     │            │   │
│  │           └─────────┬──────────┘                     │            │   │
│  │                     ▼                                │            │   │
│  │           ┌─────────────────┐                        │            │   │
│  │           │ contacts (VIEW) │                        │            │   │
│  │           └─────────────────┘                        │            │   │
│  │                                                      │            │   │
│  └──────────────────────────────────────────────────────│────────────┘   │
│                                                         │                │
│  ┌──────────────────────────────────────────────────────│────────────┐   │
│  │                      Sync Utilities                  │            │   │
│  │                                                      ▼            │   │
│  │  Electric ShapeStream ◄────────────┐    Sync Worker ─────────────────►
│  │  (reads from server)               │    (POSTs to API)            │   │
│  └────────────────────────────────────│──────────────────────────────┘   │
│                                       │                                  │
└───────────────────────────────────────│──────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼                                       ▼
           ┌───────────────┐                      ┌─────────────────┐
           │  ElectricSQL  │◄────────────────────►│    Postgres     │
           │   (service)   │                      │ (source of truth)│
           └───────────────┘                      └─────────────────┘
```

---

## Local Database Schema

### Pattern 4: Through-the-Database

For each model with sync enabled, sync-patterns generates three tables and one view:

#### 1. Synced Table (`{entity}_synced`)

Stores data from ElectricSQL. **Immutable locally** - only Electric writes to this table.

```sql
CREATE TABLE IF NOT EXISTS contacts_synced (
    -- Primary key
    id TEXT PRIMARY KEY,

    -- All synced fields (excludes sync_exclude fields)
    first_name TEXT NOT NULL,
    last_name TEXT,
    email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    -- Bookkeeping
    write_id TEXT  -- Matches against local writes for reconciliation
);
```

#### 2. Local Table (`{entity}_local`)

Stores optimistic/pending changes. **App writes here** (via view triggers).

```sql
CREATE TABLE IF NOT EXISTS contacts_local (
    -- Primary key
    id TEXT PRIMARY KEY,

    -- Only mutable fields (same as synced, nullable for partial updates)
    first_name TEXT,
    last_name TEXT,
    email TEXT,

    -- Bookkeeping
    changed_columns TEXT NOT NULL,  -- JSON array: ["first_name", "email"]
    is_deleted INTEGER NOT NULL DEFAULT 0,
    write_id TEXT NOT NULL
);
```

#### 3. Changes Table (`_changes`)

Shared across all entities. Logs mutations to send to the API.

```sql
CREATE TABLE IF NOT EXISTS _changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,           -- 'contacts', 'accounts', etc.
    operation TEXT NOT NULL,            -- 'insert' | 'update' | 'delete'
    value TEXT NOT NULL,                -- JSON payload
    write_id TEXT NOT NULL,             -- Matches local table
    transaction_id TEXT,                -- Groups related changes
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_changes_created ON _changes(created_at);
```

#### 4. Unified View (`{entity}`)

App reads and writes through this view. COALESCE prioritizes local over synced.

```sql
CREATE VIEW IF NOT EXISTS contacts AS
SELECT
    COALESCE(local.id, synced.id) AS id,

    -- Each field: prefer local if changed, else synced
    CASE
        WHEN local.changed_columns LIKE '%"first_name"%' THEN local.first_name
        ELSE synced.first_name
    END AS first_name,

    CASE
        WHEN local.changed_columns LIKE '%"last_name"%' THEN local.last_name
        ELSE synced.last_name
    END AS last_name,

    CASE
        WHEN local.changed_columns LIKE '%"email"%' THEN local.email
        ELSE synced.email
    END AS email,

    -- Timestamps from synced (local can't change these)
    synced.created_at,
    synced.updated_at,

    -- Metadata for UI (optional)
    CASE WHEN local.id IS NOT NULL THEN 1 ELSE 0 END AS _has_local_changes,
    local.write_id AS _pending_write_id

FROM contacts_synced synced
FULL OUTER JOIN contacts_local local ON synced.id = local.id
WHERE COALESCE(local.is_deleted, 0) = 0;
```

#### 5. Triggers

INSTEAD OF triggers on the view route writes to appropriate tables:

```sql
-- INSERT trigger
CREATE TRIGGER IF NOT EXISTS contacts_insert
INSTEAD OF INSERT ON contacts
BEGIN
    -- Generate write_id for tracking
    INSERT INTO contacts_local (
        id, first_name, last_name, email,
        changed_columns, write_id
    ) VALUES (
        NEW.id,
        NEW.first_name,
        NEW.last_name,
        NEW.email,
        json_array('first_name', 'last_name', 'email'),
        lower(hex(randomblob(16)))
    );

    -- Log change for sync
    INSERT INTO _changes (table_name, operation, value, write_id)
    SELECT
        'contacts',
        'insert',
        json_object(
            'id', NEW.id,
            'first_name', NEW.first_name,
            'last_name', NEW.last_name,
            'email', NEW.email
        ),
        write_id
    FROM contacts_local WHERE id = NEW.id;
END;

-- UPDATE trigger
CREATE TRIGGER IF NOT EXISTS contacts_update
INSTEAD OF UPDATE ON contacts
BEGIN
    -- Upsert into local table
    INSERT INTO contacts_local (
        id, first_name, last_name, email,
        changed_columns, write_id
    ) VALUES (
        NEW.id,
        NEW.first_name,
        NEW.last_name,
        NEW.email,
        json_array('first_name', 'last_name', 'email'),
        lower(hex(randomblob(16)))
    )
    ON CONFLICT(id) DO UPDATE SET
        first_name = NEW.first_name,
        last_name = NEW.last_name,
        email = NEW.email,
        changed_columns = json_array('first_name', 'last_name', 'email'),
        write_id = lower(hex(randomblob(16)));

    -- Log change
    INSERT INTO _changes (table_name, operation, value, write_id)
    SELECT
        'contacts',
        'update',
        json_object(
            'id', NEW.id,
            'first_name', NEW.first_name,
            'last_name', NEW.last_name,
            'email', NEW.email
        ),
        write_id
    FROM contacts_local WHERE id = NEW.id;
END;

-- DELETE trigger
CREATE TRIGGER IF NOT EXISTS contacts_delete
INSTEAD OF DELETE ON contacts
BEGIN
    -- Soft delete in local table
    INSERT INTO contacts_local (id, is_deleted, changed_columns, write_id)
    VALUES (OLD.id, 1, '[]', lower(hex(randomblob(16))))
    ON CONFLICT(id) DO UPDATE SET
        is_deleted = 1,
        write_id = lower(hex(randomblob(16)));

    -- Log change
    INSERT INTO _changes (table_name, operation, value, write_id)
    SELECT
        'contacts',
        'delete',
        json_object('id', OLD.id),
        write_id
    FROM contacts_local WHERE id = OLD.id;
END;

-- Cleanup trigger: when synced data arrives with matching write_id
CREATE TRIGGER IF NOT EXISTS contacts_synced_cleanup
AFTER INSERT ON contacts_synced
BEGIN
    DELETE FROM contacts_local
    WHERE id = NEW.id
    AND write_id = NEW.write_id;
END;
```

---

## Write Flow

### Optimistic Mode (`local_first = True`)

```
User clicks "Save"
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 1. TanStack DB calls collection.insert(data)   │
│    - Executes INSERT on contacts view          │
│    - Trigger writes to contacts_local          │
│    - Trigger writes to _changes                │
│    - View immediately reflects new data        │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 2. UI updates instantly                         │
│    - React component re-renders                │
│    - User sees their change                    │
└─────────────────────────────────────────────────┘
       │
       ▼ (async, in background)
┌─────────────────────────────────────────────────┐
│ 3. Sync worker processes _changes              │
│    - Reads pending changes                     │
│    - POSTs to backend-patterns API             │
│    - API returns { txid, write_id }            │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 4. Electric syncs from Postgres                │
│    - Change appears in contacts_synced         │
│    - Cleanup trigger deletes from local        │
│    - View now shows synced data                │
└─────────────────────────────────────────────────┘
```

### Confirmed Mode (`local_first = False`)

```
User clicks "Save"
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 1. TanStack DB calls collection.insert(data)   │
│    - Executes INSERT on contacts view          │
│    - Trigger writes to contacts_local          │
│    - Trigger writes to _changes                │
└─────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│ 2. UI shows loading state                       │
│    - Mutation is pending                       │
│    - Spinner or disabled state                 │
└─────────────────────────────────────────────────┘
       │
       ▼ (sync, blocks UI)
┌─────────────────────────────────────────────────┐
│ 3. Sync worker processes _changes              │
│    - Reads pending changes                     │
│    - POSTs to backend-patterns API             │
│    - WAITS for response                        │
└─────────────────────────────────────────────────┘
       │
       ├─── Success ───┐
       │               ▼
       │    ┌─────────────────────────────────────┐
       │    │ 4a. UI shows success                │
       │    │     - Electric syncs data           │
       │    │     - Cleanup trigger fires         │
       │    └─────────────────────────────────────┘
       │
       └─── Failure ───┐
                       ▼
            ┌─────────────────────────────────────┐
            │ 4b. Rollback and show error         │
            │     - Delete from contacts_local    │
            │     - Delete from _changes          │
            │     - UI shows error message        │
            └─────────────────────────────────────┘
```

---

## Generated Output Structure

For each model, sync-patterns CLI generates:

```
src/generated/
├── db/
│   ├── init.ts                    # Database initialization
│   └── sync-worker.ts             # Background sync to API
│
├── schema/
│   ├── _changes.sql               # Shared changes table
│   ├── contacts.sql               # Full schema for contacts
│   └── accounts.sql               # Full schema for accounts
│
├── collections/
│   ├── contacts.ts                # TanStack DB collection
│   └── accounts.ts                # TanStack DB collection
│
├── types/
│   ├── contacts.ts                # TypeScript interfaces
│   └── accounts.ts                # TypeScript interfaces
│
└── index.ts                       # Re-exports
```

### Example: Generated Collection

```typescript
// src/generated/collections/contacts.ts

import { createCollection } from '@tanstack/db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import type { Contact } from '../types/contacts'
import { api } from '../../api'
import { ELECTRIC_URL } from '../../config'

export const contactsCollection = createCollection<Contact>(
  electricCollectionOptions({
    id: 'contacts',

    // Electric shape for syncing reads
    shapeOptions: {
      url: `${ELECTRIC_URL}/v1/shape`,
      params: {
        table: 'contacts',
        // Tenant scoping injected at runtime
      },
    },

    getKey: (contact) => contact.id,

    // Mutations go through your API
    onInsert: async ({ transaction }) => {
      const contact = transaction.mutations[0].modified
      const response = await api.contacts.create(contact)
      return { txid: response.txid }
    },

    onUpdate: async ({ transaction }) => {
      const contact = transaction.mutations[0].modified
      const response = await api.contacts.update(contact.id, contact)
      return { txid: response.txid }
    },

    onDelete: async ({ transaction }) => {
      const contact = transaction.mutations[0].original
      const response = await api.contacts.delete(contact.id)
      return { txid: response.txid }
    },
  })
)

// Hook for React components
export function useContacts() {
  return useCollection(contactsCollection)
}

export function useContact(id: string) {
  return useCollectionItem(contactsCollection, id)
}
```

### Example: Generated Types

```typescript
// src/generated/types/contacts.ts

export interface Contact {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  created_at: string
  updated_at: string

  // Local metadata (not synced)
  _has_local_changes?: boolean
  _pending_write_id?: string
}

export interface ContactCreate {
  first_name: string
  last_name?: string | null
  email?: string | null
}

export interface ContactUpdate {
  first_name?: string
  last_name?: string | null
  email?: string | null
}
```

### Example: Database Initialization

```typescript
// src/generated/db/init.ts

import { PGlite } from '@electric-sql/pglite'

// Import generated schemas
import changesSchema from '../schema/_changes.sql?raw'
import contactsSchema from '../schema/contacts.sql?raw'
import accountsSchema from '../schema/accounts.sql?raw'

let db: PGlite | null = null

export async function initializeDatabase(): Promise<PGlite> {
  if (db) return db

  // Create PGlite with IndexedDB persistence
  db = new PGlite('idb://sync-patterns-app')

  // Execute schemas in order
  await db.exec(changesSchema)
  await db.exec(contactsSchema)
  await db.exec(accountsSchema)

  console.log('[sync-patterns] Local database initialized')

  return db
}

export function getDatabase(): PGlite {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}
```

---

## Backend API Requirements

For write reconciliation to work, backend-patterns API must return `txid`:

```python
# In backend-patterns API facade

from sqlalchemy import text

@router.post("/contacts", response_model=ContactResponse)
async def create_contact(data: ContactCreate, db: Session = Depends(get_db)):
    # Create the contact
    contact = Contact(**data.dict())
    db.add(contact)
    db.flush()

    # Get transaction ID for sync reconciliation
    txid = db.execute(text("SELECT pg_current_xact_id()::text")).scalar()

    db.commit()

    return ContactResponse(
        **contact.to_dict(),
        txid=txid,  # Required for sync-patterns
    )
```

---

## Configuration

### sync-patterns CLI Config

```yaml
# sync-patterns.config.yaml

# OpenAPI spec location
spec: ./openapi.json

# Output directory
output: ./src/generated

# Local database adapter (pglite | sqlite)
adapter: pglite

# Electric service URL (can be overridden at runtime)
electric_url: http://localhost:3000

# API base URL for mutations
api_base_url: http://localhost:8000/api
```

### Runtime Config

```typescript
// src/config.ts

export const ELECTRIC_URL = import.meta.env.VITE_ELECTRIC_URL
  ?? 'http://localhost:3000'

export const API_BASE_URL = import.meta.env.VITE_API_URL
  ?? 'http://localhost:8000/api'

// Future: switch adapter for mobile
export const LOCAL_DB_ADAPTER = 'pglite' as const
```

---

## Type Mapping (Postgres → PGlite)

Since PGlite uses Postgres SQL, no type mapping is needed for Phase 1.

For future SQLite adapter:

| Postgres Type | SQLite Type | Notes |
|---------------|-------------|-------|
| `UUID` | `TEXT` | Store as string |
| `TIMESTAMPTZ` | `TEXT` | ISO8601 format |
| `TIMESTAMP` | `TEXT` | ISO8601 format |
| `JSONB` | `TEXT` | JSON string |
| `JSON` | `TEXT` | JSON string |
| `DECIMAL` | `TEXT` or `REAL` | Depends on precision needs |
| `BOOLEAN` | `INTEGER` | 0/1 |
| `INTEGER` | `INTEGER` | Direct mapping |
| `TEXT` | `TEXT` | Direct mapping |
| `VARCHAR(n)` | `TEXT` | SQLite ignores length |

---

## Testing Strategy

### Unit Tests

```typescript
// Test schema generation
describe('Schema Generator', () => {
  it('generates synced table with correct columns', () => {
    const schema = generateSchema(contactOpenAPISchema)
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS contacts_synced')
    expect(schema).toContain('first_name TEXT NOT NULL')
    expect(schema).not.toContain('local_notes')  // sync_exclude
  })

  it('excludes sync_exclude fields from synced table', () => {
    const schema = generateSchema(contactOpenAPISchema)
    expect(schema).not.toContain('local_notes')
  })
})
```

### Integration Tests

```typescript
// Test full write flow
describe('Write Flow', () => {
  it('optimistic write updates view immediately', async () => {
    const db = await initializeDatabase()

    // Insert via view
    await db.exec(`
      INSERT INTO contacts (id, first_name, email)
      VALUES ('test-1', 'John', 'john@example.com')
    `)

    // View should reflect change
    const result = await db.query('SELECT * FROM contacts WHERE id = $1', ['test-1'])
    expect(result.rows[0].first_name).toBe('John')

    // Local table should have entry
    const local = await db.query('SELECT * FROM contacts_local WHERE id = $1', ['test-1'])
    expect(local.rows).toHaveLength(1)

    // Changes table should have entry
    const changes = await db.query('SELECT * FROM _changes WHERE table_name = $1', ['contacts'])
    expect(changes.rows).toHaveLength(1)
    expect(changes.rows[0].operation).toBe('insert')
  })
})
```

---

## Migration Guide

### For New Projects

1. Install sync-patterns CLI: `npm install -g @pattern-stack/sync-patterns`
2. Configure: Create `sync-patterns.config.yaml`
3. Generate: `sync-patterns generate`
4. Initialize: Call `initializeDatabase()` at app startup
5. Use: Import and use generated collections/hooks

### For Existing Projects

1. Ensure backend-patterns models have sync metadata (per SYNC-001)
2. Regenerate OpenAPI spec
3. Run sync-patterns CLI
4. Replace manual API calls with generated hooks
5. Initialize local database at app startup

---

## Related Documents

- [SYNC-001: Backend-Patterns Integration](SYNC-001-backend-patterns-integration.md)
- [ADR-005: Local Database Selection](../adr/005-local-database-selection.md)
- [ADR-006: Write Pattern Selection](../adr/006-write-pattern-selection.md)
- [ElectricSQL Writes Guide](https://electric-sql.com/docs/guides/writes)
- [TanStack DB Documentation](https://tanstack.com/db/latest)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-01 | Initial draft |
