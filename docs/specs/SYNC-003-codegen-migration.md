# SPEC: Codegen Migration and Zod Integration

## Metadata

| Field | Value |
|-------|-------|
| **Spec ID** | SYNC-003 |
| **Title** | Codegen Migration from frontend-patterns to sync-patterns |
| **Status** | Draft |
| **Created** | 2025-11-30 |
| **Phase** | 1 |
| **Depends On** | None (foundational) |

---

## Executive Summary

This specification covers migrating the OpenAPI code generation system from frontend-patterns to sync-patterns, adding Zod schema generation for runtime validation, and establishing sync-patterns as the canonical CLI for generating typed clients.

### Goals

1. Move codegen from frontend-patterns to sync-patterns (single source of truth)
2. Add Zod schema generation alongside TypeScript interfaces
3. Rename CLI to `sync-patterns` (clearer identity)
4. Remove confusing duplicate type generation scripts from frontend-patterns
5. Maintain backward compatibility with existing generated code

### Non-Goals

- Implementing `live` mode (ElectricSQL integration) - future spec
- SQLite/PGlite schema generation - covered in SYNC-002
- TanStack DB collection generation - covered in SYNC-002

---

## Current State

### What Exists in frontend-patterns

```
frontend-patterns/
├── cli/
│   ├── index.ts                           # CLI entry: "pattern-stack"
│   ├── commands/
│   │   └── generate-hooks.ts              # Main generation command
│   └── src/codegen/openapi/
│       ├── parser.js                      # OpenAPI 3.0 parser
│       ├── type-generator.js              # TypeScript interface generator
│       ├── client-generator.js            # Axios/Fetch API client generator
│       ├── hook-generator.js              # React Query hook generator
│       ├── naming-utils.js                # Hook naming utilities
│       └── confidence-scorer.js           # Name quality scoring
│
└── src/codegen/openapi/                   # TypeScript sources (same as above)
    ├── parser.ts
    ├── type-generator.ts
    ├── client-generator.ts
    ├── hook-generator.ts
    └── ...
```

### Current Outputs

Running `npx tsx cli/index.ts generate hooks ./openapi.json` generates:

```
src/generated/
├── types/
│   ├── schemas.ts          # TypeScript interfaces (NO runtime validation)
│   ├── endpoints.ts
│   ├── parameters.ts
│   ├── responses.ts
│   └── index.ts
├── client/
│   ├── client.ts           # Axios-based API client
│   ├── methods.ts
│   ├── types.ts
│   ├── config.ts
│   └── index.ts
├── hooks/
│   ├── queries.ts          # React Query useQuery hooks
│   ├── mutations.ts        # React Query useMutation hooks
│   ├── keys.ts             # Query key factory
│   ├── types.ts
│   └── index.ts
└── index.ts
```

### Problems

1. **No runtime validation** - TypeScript interfaces vanish at runtime; bad API data causes silent failures
2. **Wrong location** - Codegen is frontend-patterns specific but should be cross-platform (sync-patterns vision)
3. **Confusing scripts** - `generate-types` uses third-party `openapi-typescript`, `generate:hooks` uses custom CLI
4. **Misnamed CLI** - Called `pattern-stack` but really does sync/API client generation

---

## Proposed Architecture

### sync-patterns CLI Structure

```
sync-patterns/
├── src/
│   ├── cli/
│   │   ├── index.ts                    # CLI entry: "sync-patterns"
│   │   └── commands/
│   │       ├── generate.ts             # Main generation command
│   │       └── init.ts                 # Project initialization
│   │
│   └── generators/
│       ├── parser.ts                   # OpenAPI 3.0 parser (from frontend-patterns)
│       ├── zod-generator.ts            # NEW: Zod schema generator
│       ├── type-generator.ts           # TypeScript interface generator (from Zod)
│       ├── client-generator.ts         # API client generator
│       ├── hook-generator.ts           # React Query hook generator
│       └── index.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

### New Output Structure

```
src/generated/
├── schemas/
│   ├── contact.schema.ts       # Zod schemas + inferred types
│   ├── account.schema.ts
│   └── index.ts
├── client/
│   ├── client.ts
│   ├── methods.ts
│   └── index.ts
├── hooks/
│   ├── queries.ts
│   ├── mutations.ts
│   ├── keys.ts
│   └── index.ts
└── index.ts
```

### Generated Schema File Example

```typescript
// src/generated/schemas/contact.schema.ts

import { z } from 'zod'

/**
 * Contact schema
 *
 * Auto-generated from OpenAPI specification
 */
export const ContactSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().nullable(),
  email: z.string().email().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

// Inferred TypeScript type (compile-time + runtime aligned)
export type Contact = z.infer<typeof ContactSchema>

// Create/Update variants
export const ContactCreateSchema = ContactSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})
export type ContactCreate = z.infer<typeof ContactCreateSchema>

export const ContactUpdateSchema = ContactCreateSchema.partial()
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>

// Validation helper
export function parseContact(data: unknown): Contact {
  return ContactSchema.parse(data)
}

export function safeParseContact(data: unknown) {
  return ContactSchema.safeParse(data)
}
```

---

## Implementation Plan

### Phase 1: Setup sync-patterns Package

**Tasks:**
1. Initialize TypeScript project in sync-patterns root
2. Add dependencies: `zod`, `commander`, `openapi-types`
3. Create CLI entry point
4. Set up build tooling (tsup or similar)

**Files to create:**
- `package.json`
- `tsconfig.json`
- `src/cli/index.ts`

### Phase 2: Migrate Existing Generators

**Tasks:**
1. Copy `parser.ts` from frontend-patterns
2. Copy `client-generator.ts` from frontend-patterns
3. Copy `hook-generator.ts` from frontend-patterns
4. Copy supporting utilities (naming, confidence scoring)
5. Update imports and paths

**Files to migrate:**
- `src/generators/parser.ts`
- `src/generators/client-generator.ts`
- `src/generators/hook-generator.ts`
- `src/generators/naming.ts`

### Phase 3: Implement Zod Generator

**Tasks:**
1. Create `zod-generator.ts` that walks parsed OpenAPI schemas
2. Map OpenAPI types to Zod types
3. Generate Create/Update schema variants
4. Generate validation helpers
5. Update `type-generator.ts` to derive types from Zod (optional - could keep separate)

**Type Mapping:**

| OpenAPI Type | Zod Type |
|--------------|----------|
| `string` | `z.string()` |
| `string` + `format: email` | `z.string().email()` |
| `string` + `format: uuid` | `z.string().uuid()` |
| `string` + `format: date-time` | `z.string().datetime()` |
| `string` + `format: uri` | `z.string().url()` |
| `integer` | `z.number().int()` |
| `number` | `z.number()` |
| `boolean` | `z.boolean()` |
| `array` | `z.array(...)` |
| `object` | `z.object({...})` |
| `nullable: true` | `.nullable()` |
| `enum` | `z.enum([...])` |
| `$ref` | Reference to other schema |

### Phase 4: Wire Up CLI

**Tasks:**
1. Create `generate` command that orchestrates all generators
2. Add CLI options (output dir, format, etc.)
3. Add `--dry-run` support
4. Add progress output

**CLI Interface:**
```bash
# Basic usage
sync-patterns generate ./openapi.json

# With options
sync-patterns generate ./openapi.json \
  --output ./src/generated \
  --client axios \
  --include-schemas \
  --include-hooks

# Dry run
sync-patterns generate ./openapi.json --dry-run
```

### Phase 5: Clean Up frontend-patterns

**Tasks:**
1. Remove `openapi-typescript` dependency
2. Remove `generate-types` and `generate-types:live` scripts
3. Update `generate:hooks` to use sync-patterns CLI (or deprecate)
4. Update documentation

**package.json changes:**
```diff
- "openapi-typescript": "^7.8.0",

- "generate-types": "npx openapi-typescript ./openapi.json -o src/atoms/types/generated.ts",
- "generate-types:live": "npx openapi-typescript ${OPENAPI_URL:-...} -o src/atoms/types/generated.ts",
+ "generate": "sync-patterns generate ./openapi.json --output ./src/generated",
```

### Phase 6: Documentation and Testing

**Tasks:**
1. Update sync-patterns README
2. Add usage examples
3. Create integration test with sample OpenAPI spec
4. Update PLAN.md to reference this spec

---

## API Client Changes

The generated API client should use Zod for response validation:

```typescript
// src/generated/client/methods.ts

import { ContactSchema, type Contact } from '../schemas/contact.schema'

export async function getContact(id: string): Promise<Contact> {
  const response = await client.get(`/contacts/${id}`)

  // Runtime validation - throws if response doesn't match schema
  return ContactSchema.parse(response.data)
}

// Or safe version that returns Result type
export async function getContactSafe(id: string) {
  const response = await client.get(`/contacts/${id}`)
  return ContactSchema.safeParse(response.data)
}
```

---

## Hook Changes

Generated hooks should validate responses:

```typescript
// src/generated/hooks/queries.ts

import { useQuery } from '@tanstack/react-query'
import { ContactSchema, type Contact } from '../schemas/contact.schema'
import { api } from '../client'

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: async (): Promise<Contact> => {
      const response = await api.get(`/contacts/${id}`)
      return ContactSchema.parse(response.data)  // Runtime validation
    },
  })
}
```

---

## Migration Path for Existing Projects

1. Install sync-patterns CLI globally or as dev dependency
2. Run `sync-patterns generate` pointing to existing OpenAPI spec
3. Update imports from old generated paths to new
4. Remove old generated files
5. Update build scripts

---

## Success Criteria

1. **CLI works end-to-end** - Can generate all outputs from OpenAPI spec
2. **Zod schemas validate** - Generated schemas correctly validate API responses
3. **Types align** - `z.infer<typeof Schema>` produces correct TypeScript types
4. **Backward compatible** - Generated hooks work with existing React Query setup
5. **Clean separation** - sync-patterns owns codegen, frontend-patterns consumes output

---

## Open Questions

1. **Keep separate TypeScript generator?** - Could derive all types from Zod, or keep both generators
2. **x-sync extension parsing** - When to add? This spec or separate?
3. **Monorepo structure** - Should sync-patterns CLI be a separate npm package?

---

## Related Documents

- [SYNC-001: Backend-Patterns Integration](SYNC-001-backend-patterns-integration.md)
- [SYNC-002: Client-Side Architecture](SYNC-002-client-architecture.md)
- [ADR-001: Sync Stack Selection](../adr/001-sync-stack-selection.md)
- [frontend-patterns Hook Generation Guide](../../frontend-patterns/docs/guides/HOOK_GENERATION_GUIDE.md)

---

## Changelog

| Date | Change |
|------|--------|
| 2025-11-30 | Initial draft |
