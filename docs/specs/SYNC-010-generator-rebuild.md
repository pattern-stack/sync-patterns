# SYNC-010: Generator Architecture Rebuild

> **Status**: IN PROGRESS
> **Created**: 2025-12-11
> **Updated**: 2025-12-13
> **Author**: Claude + Dug

## Implementation Status

| Phase | Component | Tests | Status |
|-------|-----------|-------|--------|
| 1 | EntityModel + EntityResolver | 24 | ✅ Complete |
| 2 | ApiGenerator | 25 | ✅ Complete |
| 3 | HookGenerator | 25 | ✅ Complete |
| 4 | SchemaGenerator | - | 🔮 Deferred |
| 5 | Integration | 18 | ✅ Complete |
| **Total** | | **92** | |

### Completed Work

**Branch**: `refactor/generator-rebuild`

```
8b6b263 test(core): add integration tests with sales-patterns spec
a87c5ec feat(core): add HookGenerator (Phase 3)
739b1e9 feat(core): add ApiGenerator (Phase 2)
0572884 feat(core): add EntityModel and EntityResolver (Phase 1)
8ff6a3e docs: add SYNC-010 generator rebuild spec
```

**Files Created**:
```
src/core/
├── entity-model.ts      # Core types
├── entity-resolver.ts   # OpenAPI → EntityModel
├── api-generator.ts     # EntityModel → Pure TS API
├── hook-generator.ts    # EntityModel → React hooks
└── index.ts

test/core/
├── entity-resolver.test.ts   (24 tests)
├── api-generator.test.ts     (25 tests)
├── hook-generator.test.ts    (25 tests)
└── integration.test.ts       (18 tests)

test/fixtures/
├── minimal-crud.json
├── with-sync-modes.json
├── with-custom-operations.json
├── nested-resources.json
└── sales-patterns-openapi.json
```

## Problem Statement

The current generator architecture has a fundamental design issue:

1. **Parser outputs flat lists** - `endpoints[]`, `schemas[]` with no entity grouping
2. **Each generator re-derives entity grouping** - Duplicated logic across 5+ generators
3. **No shared entity model** - Inconsistent entity detection between generators
4. **Tight coupling** - Hard to add new generators or modify entity detection

This makes the codebase brittle and the TUI integration unnecessarily complex.

## Goal

Rebuild the generator pipeline with clean separation:

```
OpenAPI Spec → Entity Model → Generators
     │              │              │
   Parse      Single source    Consume
              of truth         entity model
```

## Architecture

### Phase 1: Entity Model (Core)

```typescript
// src/core/entity-model.ts

/**
 * The canonical intermediate representation.
 * All generators consume this - no re-parsing.
 */
export interface EntityModel {
  /** API metadata */
  info: {
    title: string
    version: string
    description?: string
    baseUrl?: string
  }

  /** Entity definitions keyed by plural name */
  entities: Map<string, EntityDefinition>

  /** Non-entity schemas (e.g., ValidationError, shared types) */
  sharedSchemas: SchemaDefinition[]

  /** Auth configuration */
  auth: AuthConfig
}

export interface EntityDefinition {
  /** Plural name: 'accounts' */
  name: string
  /** Singular name: 'account' */
  singular: string
  /** PascalCase: 'Account' */
  pascalName: string
  /** Sync mode from x-sync-mode extension */
  syncMode: 'api' | 'realtime' | 'offline'

  /** Standard CRUD operations (detected from endpoints) */
  operations: {
    list?: OperationDefinition
    get?: OperationDefinition
    create?: OperationDefinition
    update?: OperationDefinition
    delete?: OperationDefinition
  }

  /** Non-CRUD operations (e.g., /accounts/{id}/transition) */
  customOperations: OperationDefinition[]

  /** Related schema names */
  schemas: EntitySchemas
}

export interface OperationDefinition {
  /** Original operationId from OpenAPI */
  operationId: string
  /** HTTP method */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  /** Full path: '/api/v1/accounts/{account_id}' */
  path: string
  /** Path parameters */
  pathParams: ParameterDefinition[]
  /** Query parameters */
  queryParams: ParameterDefinition[]
  /** Request body schema (for POST/PUT/PATCH) */
  requestSchema?: SchemaReference
  /** Response schema (200/201) */
  responseSchema?: SchemaReference
  /** Operation description */
  description?: string
  /** Whether auth is required */
  requiresAuth: boolean
}

export interface EntitySchemas {
  /** List response type: 'AccountListResponse' */
  listResponse?: string
  /** Single item type: 'AccountOwner' */
  item?: string
  /** Create request type: 'AccountCreate' */
  createRequest?: string
  /** Update request type: 'AccountUpdate' */
  updateRequest?: string
}

export interface SchemaDefinition {
  name: string
  type: 'object' | 'enum' | 'array' | 'primitive'
  properties?: Record<string, PropertyDefinition>
  enumValues?: string[]
  required?: string[]
  description?: string
}

export interface PropertyDefinition {
  name: string
  type: string
  format?: string
  nullable?: boolean
  description?: string
  ref?: string
}

export interface ParameterDefinition {
  name: string
  type: string
  required: boolean
  description?: string
  default?: unknown
}

export interface SchemaReference {
  name: string
  isArray: boolean
  /** For paginated responses: the property containing the array */
  arrayProperty?: string
}

export interface AuthConfig {
  type: 'bearer' | 'apiKey' | 'none'
  headerName?: string
}
```

### Phase 2: Entity Resolver

```typescript
// src/core/entity-resolver.ts

/**
 * Resolves OpenAPI spec into EntityModel.
 * Single source of truth for entity detection.
 */
export class EntityResolver {
  /**
   * Parse OpenAPI and resolve into EntityModel
   */
  resolve(spec: OpenAPIDocument): EntityModel

  /**
   * Detect entity from path
   * /api/v1/accounts/{id} → 'accounts'
   * /api/v1/accounts/{account_id}/activities → 'accounts' (parent)
   */
  private detectEntityFromPath(path: string): string | null

  /**
   * Detect CRUD operation type from method + path pattern
   * GET /accounts → list
   * GET /accounts/{id} → get
   * POST /accounts → create
   * PUT/PATCH /accounts/{id} → update
   * DELETE /accounts/{id} → delete
   */
  private detectOperationType(
    method: string,
    path: string,
    operationId: string
  ): 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom'

  /**
   * Extract sync mode from x-sync-mode extension
   */
  private extractSyncMode(pathItem: PathItem, operation: Operation): SyncMode
}
```

### Phase 3: Generators

Each generator consumes `EntityModel` directly:

```typescript
// src/generators/api-generator.ts
export class ApiGenerator {
  generate(model: EntityModel): GeneratedApi
}

// src/generators/hook-generator.ts
export class HookGenerator {
  generate(model: EntityModel): GeneratedHooks
}

// src/generators/schema-generator.ts
export class SchemaGenerator {
  generate(model: EntityModel): GeneratedSchemas
}
```

## Output Structure

```
src/generated/
├── api/                      # NEW: Pure TypeScript API layer
│   ├── accounts.ts           # accountsApi.list(), .get(), .create(), etc.
│   ├── activities.ts
│   ├── index.ts              # Re-exports + configureApi()
│   └── types.ts              # ApiConfig, ApiResponse types
│
├── hooks/                    # React hooks (wrap api layer)
│   ├── accounts.ts           # useAccounts(), useCreateAccount()
│   ├── activities.ts
│   ├── keys.ts               # Query key factories
│   └── index.ts
│
├── schemas/                  # Zod schemas
│   ├── account.ts
│   ├── activity.ts
│   └── index.ts
│
├── entities/                 # SIMPLIFIED: Just re-exports + unified types
│   ├── accounts.ts           # Re-exports from api/ + hooks/ + schemas/
│   └── index.ts
│
└── index.ts                  # Main entry point
```

## Test Strategy

### Test Fixtures

Create minimal OpenAPI fixtures that cover all patterns:

```typescript
// src/__tests__/fixtures/minimal-crud.json
{
  "paths": {
    "/api/v1/accounts": {
      "get": { "operationId": "list_accounts", ... },
      "post": { "operationId": "create_account", ... }
    },
    "/api/v1/accounts/{account_id}": {
      "get": { "operationId": "get_account", ... },
      "put": { "operationId": "update_account", ... },
      "delete": { "operationId": "delete_account", ... }
    }
  }
}
```

### Test Categories

#### 1. Entity Resolution Tests (`entity-resolver.test.ts`)

```typescript
describe('EntityResolver', () => {
  describe('entity detection', () => {
    it('detects entity from simple path: /accounts → accounts', () => {
      const model = resolver.resolve(simpleSpec)
      expect(model.entities.has('accounts')).toBe(true)
    })

    it('detects entity from versioned path: /api/v1/accounts → accounts', () => {
      const model = resolver.resolve(versionedSpec)
      expect(model.entities.has('accounts')).toBe(true)
    })

    it('ignores non-entity paths: /health, /ready', () => {
      const model = resolver.resolve(specWithHealth)
      expect(model.entities.has('health')).toBe(false)
    })

    it('handles nested resources: /accounts/{id}/activities → activities entity', () => {
      const model = resolver.resolve(nestedSpec)
      expect(model.entities.has('activities')).toBe(true)
    })
  })

  describe('CRUD operation detection', () => {
    it('detects list: GET /accounts', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.operations.list).toBeDefined()
      expect(accounts.operations.list!.method).toBe('get')
    })

    it('detects get: GET /accounts/{id}', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.operations.get).toBeDefined()
      expect(accounts.operations.get!.pathParams[0].name).toBe('account_id')
    })

    it('detects create: POST /accounts', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.operations.create).toBeDefined()
      expect(accounts.operations.create!.requestSchema).toBeDefined()
    })

    it('detects update: PUT/PATCH /accounts/{id}', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.operations.update).toBeDefined()
    })

    it('detects delete: DELETE /accounts/{id}', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.operations.delete).toBeDefined()
    })

    it('classifies custom operations: POST /accounts/{id}/transition', () => {
      const model = resolver.resolve(customOpSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.customOperations.length).toBeGreaterThan(0)
      expect(accounts.customOperations[0].operationId).toContain('transition')
    })
  })

  describe('sync mode extraction', () => {
    it('extracts x-sync-mode: api', () => {
      const model = resolver.resolve(apiModeSpec)
      expect(model.entities.get('accounts')!.syncMode).toBe('api')
    })

    it('extracts x-sync-mode: offline', () => {
      const model = resolver.resolve(offlineModeSpec)
      expect(model.entities.get('accounts')!.syncMode).toBe('offline')
    })

    it('defaults to api when no x-sync-mode', () => {
      const model = resolver.resolve(noSyncModeSpec)
      expect(model.entities.get('accounts')!.syncMode).toBe('api')
    })

    it('handles legacy x-sync.local_first: true → realtime', () => {
      const model = resolver.resolve(legacyLocalFirstSpec)
      expect(model.entities.get('accounts')!.syncMode).toBe('realtime')
    })
  })

  describe('schema detection', () => {
    it('detects list response schema', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.schemas.listResponse).toBe('AccountListResponse')
    })

    it('detects item schema from get response', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.schemas.item).toBe('AccountOwner')
    })

    it('detects create request schema', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.schemas.createRequest).toBe('AccountCreate')
    })

    it('detects update request schema', () => {
      const model = resolver.resolve(crudSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.schemas.updateRequest).toBe('AccountUpdate')
    })

    it('handles paginated list response with items property', () => {
      const model = resolver.resolve(paginatedSpec)
      const accounts = model.entities.get('accounts')!
      expect(accounts.operations.list!.responseSchema!.arrayProperty).toBe('items')
    })
  })

  describe('parameter extraction', () => {
    it('extracts path parameters with correct names', () => {
      const model = resolver.resolve(crudSpec)
      const get = model.entities.get('accounts')!.operations.get!
      expect(get.pathParams[0].name).toBe('account_id')
      expect(get.pathParams[0].type).toBe('string')
      expect(get.pathParams[0].required).toBe(true)
    })

    it('extracts query parameters', () => {
      const model = resolver.resolve(queryParamsSpec)
      const list = model.entities.get('accounts')!.operations.list!
      expect(list.queryParams.length).toBeGreaterThan(0)
      expect(list.queryParams.find(p => p.name === 'limit')).toBeDefined()
    })
  })
})
```

#### 2. API Generator Tests (`api-generator.test.ts`)

```typescript
describe('ApiGenerator', () => {
  it('generates entity-grouped api object', () => {
    const output = generator.generate(accountsModel)
    expect(output.files.has('accounts.ts')).toBe(true)
  })

  it('generates list method', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('async list(')
    expect(code).toContain('Promise<Account[]>')
  })

  it('generates get method with path param', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('async get(id: string)')
  })

  it('generates create method with typed input', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('async create(data: AccountCreate)')
  })

  it('generates listWithMeta convenience method', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('async listWithMeta(')
    expect(code).toContain('/fields/metadata')
  })

  it('generates configurable client', () => {
    const output = generator.generate(accountsModel)
    const indexCode = output.files.get('index.ts')!
    expect(indexCode).toContain('configureApi(')
    expect(indexCode).toContain('baseUrl')
    expect(indexCode).toContain('authToken')
  })

  it('generates custom operations', () => {
    const output = generator.generate(accountsWithTransitionModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('async transitionStage(')
  })
})
```

#### 3. Hook Generator Tests (`hook-generator.test.ts`)

```typescript
describe('HookGenerator', () => {
  it('generates useList hook', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('export function useAccounts(')
    expect(code).toContain('useQuery')
  })

  it('generates useGet hook', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('export function useAccount(id: string)')
  })

  it('generates mutation hooks', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('export function useCreateAccount(')
    expect(code).toContain('useMutation')
  })

  it('hooks call api layer (not direct fetch)', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('accounts.ts')!
    expect(code).toContain('accountsApi.list()')
    expect(code).not.toContain('fetch(')
  })

  it('generates query keys', () => {
    const output = generator.generate(accountsModel)
    const keysCode = output.files.get('keys.ts')!
    expect(keysCode).toContain("accounts: ['accounts']")
    expect(keysCode).toContain('account: (id: string)')
  })
})
```

#### 4. Schema Generator Tests (`schema-generator.test.ts`)

```typescript
describe('SchemaGenerator', () => {
  it('generates Zod schema for object type', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('account.ts')!
    expect(code).toContain('z.object({')
  })

  it('generates enum schema', () => {
    const output = generator.generate(enumModel)
    const code = output.files.get('status.ts')!
    expect(code).toContain('z.enum([')
  })

  it('handles nullable fields', () => {
    const output = generator.generate(nullableModel)
    const code = output.files.get('account.ts')!
    expect(code).toContain('.nullable()')
  })

  it('exports TypeScript types alongside schemas', () => {
    const output = generator.generate(accountsModel)
    const code = output.files.get('account.ts')!
    expect(code).toContain('export type Account = z.infer<')
  })
})
```

#### 5. Integration Tests (`integration.test.ts`)

```typescript
describe('Full Pipeline Integration', () => {
  it('generates valid TypeScript from sales-patterns spec', async () => {
    const spec = await loadSpec('./fixtures/sales-patterns-openapi.json')
    const model = resolver.resolve(spec)
    const api = apiGenerator.generate(model)
    const hooks = hookGenerator.generate(model)
    const schemas = schemaGenerator.generate(model)

    // Write to temp dir
    await writeOutput(tempDir, { api, hooks, schemas })

    // Type-check generated code
    const result = await typecheck(tempDir)
    expect(result.errors).toHaveLength(0)
  })

  it('generates correct entity count', async () => {
    const spec = await loadSpec('./fixtures/sales-patterns-openapi.json')
    const model = resolver.resolve(spec)

    // sales-patterns has: accounts, activities, files
    expect(model.entities.size).toBe(3)
    expect(model.entities.has('accounts')).toBe(true)
    expect(model.entities.has('activities')).toBe(true)
    expect(model.entities.has('files')).toBe(true)
  })

  it('api methods are callable at runtime', async () => {
    // ... generate and dynamically import
    const { accountsApi, configureApi } = await import(tempDir + '/api')
    configureApi({ baseUrl: 'http://test', authToken: 'test' })

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] })
    })

    const result = await accountsApi.list()
    expect(Array.isArray(result)).toBe(true)
  })
})
```

## Implementation Plan

### Phase 1: Foundation (Tests First)

1. **Set up test infrastructure**
   - Add vitest to sync-patterns
   - Create `src/__tests__/` directory structure
   - Create test fixtures from sales-patterns OpenAPI

2. **Write EntityResolver tests**
   - All entity detection tests
   - All CRUD operation detection tests
   - All sync mode extraction tests
   - All schema detection tests

3. **Implement EntityResolver**
   - Make tests pass one by one
   - Start with simplest cases, build up

### Phase 2: API Generator (Tests First)

1. **Write ApiGenerator tests**
   - Entity-grouped output
   - All CRUD methods
   - Custom operations
   - Configuration

2. **Implement ApiGenerator**
   - Generate pure TypeScript (no React)
   - Include `listWithMeta()` convenience method

### Phase 3: Hook Generator (Tests First)

1. **Write HookGenerator tests**
   - Hooks call api layer
   - Query keys
   - Proper typing

2. **Implement HookGenerator**
   - Hooks wrap api layer
   - No direct fetch calls

### Phase 4: Schema Generator (Tests First)

1. **Write SchemaGenerator tests**
2. **Implement SchemaGenerator** (mostly exists, may need refactoring)

### Phase 5: Integration & Migration

1. **Integration tests with real spec**
2. **Wire up CLI commands**
3. **Update TUI to use generated api layer**
4. **Deprecate old generators**

## Migration Path

1. New generators write to separate output directory initially
2. Run both old and new in parallel, compare outputs
3. Once validated, switch default to new generators
4. Remove old generator code

## Success Criteria

- [x] All EntityResolver tests pass (24 tests)
- [x] All ApiGenerator tests pass (25 tests)
- [x] All HookGenerator tests pass (25 tests)
- [ ] All SchemaGenerator tests pass (deferred - existing zod-generator works)
- [x] Integration test with sales-patterns spec passes (18 tests)
- [ ] TUI can use generated api layer
- [ ] Generated code type-checks cleanly
- [ ] CLI wired up to new generators
- [ ] No regression in existing functionality

## Decisions Made

1. **Entity-grouped files over flat files**
   - ✅ Decision: hooks/accounts.ts, api/accounts.ts (entity-grouped)
   - Rationale: Cleaner imports, better tree-shaking, matches mental model

2. **Hooks wrap API layer**
   - ✅ Decision: `useAccounts()` calls `accountsApi.list()`, NOT `fetch()`
   - Rationale: Single source of truth, TUI and React share same API layer

3. **Smart path parameter naming**
   - ✅ Decision: Single `{entity_id}` param → `id` in method signature
   - ✅ Decision: Multiple params → preserve exact names
   - Rationale: Clean API for common case, explicit for complex nested resources

4. **Metadata endpoint detection**
   - ✅ Decision: Detect `/fields/metadata` pattern, generate `listWithMeta()`
   - Rationale: Common pattern in Pattern Stack, needed for DataTable integration

5. **Auth detection hierarchy**
   - ✅ Decision: Operation > Path > Global security
   - Rationale: Matches OpenAPI spec semantics, explicit empty array = no auth

## Next Steps

### Immediate (Wire Up)

1. **Wire CLI to new generators**
   ```bash
   # Update src/cli/commands/generate.ts
   # Use EntityResolver + ApiGenerator + HookGenerator
   ```

2. **Update TUI to use generated API layer**
   ```typescript
   // EntityTableView.tsx
   import { accountsApi, configureApi } from './generated/api'

   configureApi({ baseUrl: apiUrl, authToken })
   const { data, columns } = await accountsApi.listWithMeta()
   ```

3. **Test with sales-patterns**
   - Regenerate sales-patterns frontend
   - Verify no regressions
   - Verify TUI works with new layer

### Future (When Needed)

4. **SchemaGenerator refactor**
   - Existing zod-generator works but uses flat structure
   - Could refactor to use EntityModel for consistency
   - Low priority - current output is correct

5. **Deprecate old generators**
   - Once validated, remove old generator code
   - Update all imports to use `src/core/`

6. **Event-driven sync**
   - When ready to implement new sync architecture
   - EntityModel already has `syncMode` field
   - New generators can use this to generate appropriate code

## Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │         OpenAPI Spec                │
                    │    (sales-patterns, etc.)           │
                    └─────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────┐
                    │        EntityResolver               │
                    │   (src/core/entity-resolver.ts)     │
                    │                                     │
                    │   - Detects entities from paths     │
                    │   - Classifies CRUD vs custom ops   │
                    │   - Extracts sync modes             │
                    │   - Resolves schemas                │
                    └─────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────┐
                    │          EntityModel                │
                    │   (Single Source of Truth)          │
                    │                                     │
                    │   entities: Map<name, EntityDef>    │
                    │     - operations (CRUD)             │
                    │     - customOperations              │
                    │     - metadataOperation             │
                    │     - schemas                       │
                    │     - syncMode                      │
                    └─────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│    ApiGenerator     │   │   HookGenerator     │   │  (SchemaGenerator)  │
│                     │   │                     │   │                     │
│  Pure TypeScript    │   │  React + TanStack   │   │  Zod schemas        │
│  No React deps      │   │  Query integration  │   │  (existing works)   │
│                     │   │                     │   │                     │
│  TUI uses this!     │   │  Wraps API layer    │   │                     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
           │                         │                         │
           ▼                         ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Generated Output                                 │
│                                                                         │
│  api/                     hooks/                    schemas/            │
│  ├── accounts.ts          ├── accounts.ts           ├── account.ts      │
│  │   accountsApi.list()   │   useAccounts()         │   AccountSchema   │
│  │   accountsApi.get(id)  │   useCreateAccount()    │                   │
│  │   listWithMeta()       │   useAccountsWithMeta() │                   │
│  ├── client.ts            ├── keys.ts               └── index.ts        │
│  │   configureApi()       │   queryKeys.accounts                        │
│  └── index.ts             └── index.ts                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Usage Examples

### TUI (Pure TypeScript)

```typescript
import { accountsApi, configureApi } from './generated/api'

// Configure once at startup
configureApi({
  baseUrl: 'http://localhost:8000/api/v1',
  authToken: storedToken,
})

// Use anywhere - no React needed
const { data, columns } = await accountsApi.listWithMeta()
const account = await accountsApi.get('uuid-here')
await accountsApi.create({ name: 'New Account' })
```

### React App

```typescript
import { useAccounts, useAccountsWithMeta, useCreateAccount } from './generated/hooks'
import { configureApi } from './generated/api'

// Configure once in App.tsx
configureApi({ baseUrl: import.meta.env.VITE_API_URL })

// In components
function AccountsPage() {
  const { data, columns, isReady } = useAccountsWithMeta()
  const createMutation = useCreateAccount()

  if (!isReady) return <Loading />

  return (
    <DataTable
      data={data}
      columns={columns}
      onAdd={() => createMutation.mutate({ name: 'New' })}
    />
  )
}
```
