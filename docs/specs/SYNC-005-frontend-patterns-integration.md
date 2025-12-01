# SPEC: Frontend-Patterns Integration

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-005 |
| **Title** | Frontend-Patterns Integration Requirements |
| **Status** | Draft |
| **Created** | 2025-12-01 |
| **Phase** | 1 |
| **Depends On** | [SYNC-004](SYNC-004-unified-entity-generation.md) |

---

## Executive Summary

This specification documents the changes required in frontend-patterns to consume sync-patterns generated code and support both optimistic and confirmed modes.

### Goals

1. Add required dependencies for TanStack DB and Electric
2. Remove legacy codegen (now owned by sync-patterns)
3. Document app initialization pattern
4. Provide utility components/hooks if needed

### Non-Goals

- Modifying existing UI components (DataTable, etc.)
- Adding sync-specific UI patterns (conflict resolution UI, etc.)

---

## Dependency Changes

### Add Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-db": "^0.x.x",
    "@tanstack/electric-db-collection": "^0.x.x"
  },
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "zod": "^3.22.0"
  }
}
```

### Remove Dependencies

```diff
- "openapi-typescript": "^7.8.0"
```

---

## Script Changes

### Remove Legacy Scripts

```diff
- "generate-types": "npx openapi-typescript ./openapi.json -o src/atoms/types/generated.ts",
- "generate-types:live": "npx openapi-typescript ${OPENAPI_URL:-...} -o src/atoms/types/generated.ts",
```

### Add sync-patterns Script

```json
{
  "scripts": {
    "generate": "sync-patterns generate ./openapi.json --output ./src/generated"
  }
}
```

---

## App Initialization

Consuming apps must call `configureSync()` before rendering. This should be documented in frontend-patterns.

### Recommended Pattern

```typescript
// src/main.tsx

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureSync } from '@/generated/config'
import App from './App'

// Configure sync BEFORE any components render
configureSync({
  electricUrl: import.meta.env.VITE_ELECTRIC_URL ?? '',
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

### Environment Variables

Document required env vars:

```bash
# .env.example
VITE_ELECTRIC_URL=http://localhost:3000
VITE_API_URL=http://localhost:8000/api
```

---

## Import Patterns

### Old Pattern (deprecated)

```typescript
// Don't use these anymore
import { useContactsQuery } from '@/generated/hooks'
import type { Contact } from '@/generated/types'
```

### New Pattern

```typescript
// Use unified entity wrappers
import { useContacts, useCreateContact, Contact } from '@/generated/entities/contacts'

// Or import all from main index
import { useContacts, Contact, configureSync } from '@/generated'
```

---

## Component Integration

### Data Fetching

Components use the same hooks regardless of mode:

```typescript
import { useContacts } from '@/generated/entities/contacts'

function ContactList() {
  const { data: contacts, isLoading, error } = useContacts()

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />

  return (
    <DataTable
      data={contacts}
      columns={contactColumns}
    />
  )
}
```

### Mutations

Mutations work identically:

```typescript
import { useCreateContact } from '@/generated/entities/contacts'

function CreateContactForm() {
  const createContact = useCreateContact()

  const handleSubmit = (data: ContactCreate) => {
    createContact.mutate(data, {
      onSuccess: () => {
        toast.success('Contact created')
      },
      onError: (error) => {
        toast.error('Failed to create contact')
      }
    })
  }

  return <Form onSubmit={handleSubmit} />
}
```

### Optimistic UI Indicators (Optional)

For optimistic mode, apps may want to show pending state:

```typescript
import { useContacts } from '@/generated/entities/contacts'

function ContactList() {
  const { data: contacts } = useContacts()

  return (
    <ul>
      {contacts?.map((contact) => (
        <li key={contact.id}>
          {contact.first_name}
          {contact._isPending && <span className="text-muted">(saving...)</span>}
        </li>
      ))}
    </ul>
  )
}
```

> **Note**: The `_isPending` field would need to be added to the entity wrapper if desired. This is optional and can be deferred.

---

## Documentation Updates

### Files to Update

1. **frontend-patterns/CLAUDE.md**
   - Add section on generated code from sync-patterns
   - Document `configureSync()` requirement
   - Update import patterns

2. **frontend-patterns/README.md**
   - Add sync-patterns as related project
   - Document code generation workflow

3. **New: frontend-patterns/docs/guides/SYNC_INTEGRATION.md**
   - Full guide on using generated code
   - Examples for optimistic vs confirmed modes
   - Troubleshooting common issues

---

## Testing Considerations

### Mocking Generated Hooks

For testing components that use generated hooks:

```typescript
// test-utils.tsx

import { configureSync } from '@/generated/config'

// Force confirmed mode in tests (simpler, no Electric needed)
beforeEach(() => {
  configureSync({
    electricUrl: '',  // Empty = confirmed mode
  })
})
```

### Testing Optimistic Behavior

For integration tests that need optimistic mode:

```typescript
import { configureSync } from '@/generated/config'

beforeEach(() => {
  configureSync({
    electricUrl: 'http://localhost:3000',
    entities: { contacts: true }
  })
})

it('shows optimistic state immediately', async () => {
  render(<ContactList />)

  // Trigger mutation
  fireEvent.click(screen.getByText('Add Contact'))

  // Should appear immediately (no loading)
  expect(screen.getByText('New Contact')).toBeInTheDocument()
})
```

---

## Migration Checklist

For existing frontend-patterns consumers:

- [ ] Install new dependencies (`@tanstack/react-db`, `@tanstack/electric-db-collection`)
- [ ] Remove `openapi-typescript` dependency
- [ ] Update `package.json` scripts
- [ ] Regenerate code with sync-patterns CLI
- [ ] Add `configureSync()` to app initialization
- [ ] Update imports from `hooks/` to `entities/`
- [ ] Add `VITE_ELECTRIC_URL` to environment (if using optimistic mode)
- [ ] Update tests to configure sync mode

---

## Timeline

This integration depends on:

1. sync-patterns CLI generating collections and entity wrappers (SYNC-004)
2. backend-patterns returning `txid` from mutations (SYNC-001)

Frontend-patterns changes can be prepared in parallel but won't be fully testable until sync-patterns Phase 1 is complete.

---

## Related Documents

- [SYNC-004: Unified Entity Generation](SYNC-004-unified-entity-generation.md)
- [SYNC-002: Client-Side Architecture](SYNC-002-client-architecture.md)
- [ADR-007: Unified Entity Wrappers](../adr/007-unified-entity-wrappers.md)
- [docs/TERMINOLOGY.md](../TERMINOLOGY.md)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-01 | Initial draft |
