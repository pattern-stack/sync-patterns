# SYNC-011: Wire CLI to New Generator Architecture

> **Status**: COMPLETE
> **Created**: 2025-12-13
> **Completed**: 2025-12-13
> **Parent**: SYNC-010 (Generator Rebuild)
> **Author**: Claude + Dug

## Overview

Wire the `sync-patterns generate` CLI command to use the new core generators (`EntityResolver`, `ApiGenerator`, `HookGenerator`) built in SYNC-010.

## Current State

### CLI Flow (Old)

```
generate.ts
├── loadOpenAPISpec(source)
├── parseOpenAPI(spec) → ParsedSpec (flat lists)
├── generateZodSchemas(parsed) → schemas/
├── generateAPIClient(parsed) → client/
│   ├── client.ts
│   ├── methods.ts
│   ├── types.ts
│   ├── config.ts
│   └── index.ts
├── generateHooks(parsed) → hooks/
│   ├── queries.ts
│   ├── mutations.ts
│   ├── keys.ts
│   ├── types.ts
│   └── index.ts
├── generateCollections(parsed) → collections/
├── generateConfig(parsed) → config.ts
├── generateEntityWrappers(parsed) → entities/
└── generateEntitiesHook(parsed) → entities-hook.tsx
```

**Problems:**
- Each generator independently re-derives entity grouping
- Inconsistent entity detection between generators
- Flat file structure (methods.ts, queries.ts) doesn't match mental model
- Hard to extend or modify

### New Core Generators (SYNC-010)

```
EntityResolver.resolve(spec) → EntityModel
ApiGenerator.generate(model) → GeneratedApi
HookGenerator.generate(model) → GeneratedHooks
```

**Output structure (new):**
```
api/
├── accounts.ts      # accountsApi.list(), .get(), .create(), etc.
├── contacts.ts
├── client.ts        # Configurable HTTP client
├── types.ts
└── index.ts

hooks/
├── accounts.ts      # useAccounts(), useAccount(), useCreateAccount()
├── contacts.ts
├── keys.ts          # Query key factories
└── index.ts
```

## Goal

Replace old generators with new core generators while:
1. Maintaining backward compatibility during transition
2. Keeping existing features that work (zod schemas, collections)
3. Enabling validation via parallel generation

## Implementation Plan

### Phase 1: Add New Generation Path

Add `--use-new-generators` flag for opt-in testing.

```typescript
// generate.ts additions

import { EntityResolver, ApiGenerator, HookGenerator } from '../../core/index.js'

interface GenerateOptions {
  // ... existing options ...
  useNewGenerators?: boolean  // NEW: opt-in flag
}

if (options.useNewGenerators) {
  await generateWithNewArchitecture(spec, options)
} else {
  await generateWithOldArchitecture(spec, options)  // existing code
}
```

### Phase 2: Implement New Generation Function

```typescript
async function generateWithNewArchitecture(
  spec: OpenAPIV3.Document,
  options: GenerateOptions
): Promise<void> {
  // 1. Resolve to EntityModel
  const resolver = new EntityResolver()
  const model = resolver.resolve(spec)

  console.log(`Resolved ${model.entities.size} entities: ${[...model.entities.keys()].join(', ')}`)

  // 2. Generate API layer (NEW - replaces client-generator)
  if (options.client) {
    console.log('\nGenerating API layer...')
    const apiGenerator = new ApiGenerator()
    const api = apiGenerator.generate(model)

    const apiDir = join(options.output, 'api')
    await ensureDir(apiDir)

    // Write entity files
    for (const [name, content] of api.entities) {
      await writeFile(join(apiDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(apiDir, 'client.ts'), api.client)
    await writeFile(join(apiDir, 'types.ts'), api.types)
    await writeFile(join(apiDir, 'index.ts'), api.index)

    console.log(`Written API layer to ${apiDir}/`)
  }

  // 3. Generate hooks (NEW - replaces hook-generator)
  if (options.hooks) {
    console.log('\nGenerating React hooks...')
    const hookGenerator = new HookGenerator()
    const hooks = hookGenerator.generate(model)

    const hooksDir = join(options.output, 'hooks')
    await ensureDir(hooksDir)

    // Write entity files
    for (const [name, content] of hooks.entities) {
      await writeFile(join(hooksDir, `${toKebabCase(name)}.ts`), content)
    }

    // Write shared files
    await writeFile(join(hooksDir, 'keys.ts'), hooks.keys)
    await writeFile(join(hooksDir, 'index.ts'), hooks.index)

    console.log(`Written React hooks to ${hooksDir}/`)
  }

  // 4. Zod schemas (KEEP OLD - works fine)
  if (options.schemas) {
    console.log('\nGenerating Zod schemas...')
    // Use existing parseOpenAPI for zod-generator (until refactored)
    const parsed = await parseOpenAPI(spec)
    const schemas = generateZodSchemas(parsed)
    // ... existing schema writing code ...
  }

  // 5. Collections (KEEP OLD for now)
  // 6. Entity wrappers (KEEP OLD for now)
  // 7. Config (KEEP OLD for now)
}
```

### Phase 3: Output Directory Changes

| Component | Old Location | New Location | Change |
|-----------|-------------|--------------|--------|
| API client | `client/` | `api/` | **BREAKING** |
| API methods | `client/methods.ts` | `api/{entity}.ts` | **BREAKING** |
| Hooks | `hooks/queries.ts` | `hooks/{entity}.ts` | **BREAKING** |
| Schemas | `schemas/` | `schemas/` | No change |
| Collections | `collections/` | `collections/` | No change |
| Entities | `entities/` | `entities/` | No change |

**Migration strategy:** The `--use-new-generators` flag lets users opt-in and update imports before we make it default.

### Phase 4: Update Root Index

```typescript
// New root index structure
const rootIndexLines: string[] = [
  '/**',
  ' * Generated API',
  ' * Auto-generated from OpenAPI specification',
  ' */',
  '',
  '// API layer (pure TypeScript, TUI-compatible)',
  "export * from './api/index'",
  '',
  '// React hooks (TanStack Query)',
  "export * from './hooks/index'",
  '',
  '// Zod schemas and types',
  "export * from './schemas/index'",
  '',
]
```

### Phase 5: Validation Mode

Add `--compare` flag to run both generators and diff output:

```typescript
if (options.compare) {
  const oldOutput = await generateWithOldArchitecture(spec, { ...options, output: tempOld })
  const newOutput = await generateWithNewArchitecture(spec, { ...options, output: tempNew })

  // Compare file counts
  // Compare method names
  // Report differences
}
```

## File Changes

### Modified Files

1. **`src/cli/commands/generate.ts`**
   - Add `useNewGenerators` option
   - Add `generateWithNewArchitecture()` function
   - Update root index generation
   - Add `compare` option for validation

2. **`src/cli/index.ts`** (if CLI options defined there)
   - Add `--use-new-generators` flag
   - Add `--compare` flag

### New Imports

```typescript
// In generate.ts
import {
  EntityResolver,
  ApiGenerator,
  HookGenerator,
  type EntityModel,
} from '../../core/index.js'
```

## Test Plan

### Unit Tests

1. **New generator path produces valid output**
   ```typescript
   it('generates api/ directory with entity files', async () => {
     await generateCommand(minimalSpec, {
       output: tempDir,
       client: true,
       useNewGenerators: true
     })

     expect(existsSync(join(tempDir, 'api/accounts.ts'))).toBe(true)
     expect(existsSync(join(tempDir, 'api/client.ts'))).toBe(true)
     expect(existsSync(join(tempDir, 'api/index.ts'))).toBe(true)
   })
   ```

2. **Hooks import from API layer**
   ```typescript
   it('hooks import from api layer', async () => {
     await generateCommand(minimalSpec, {
       output: tempDir,
       hooks: true,
       useNewGenerators: true
     })

     const content = readFileSync(join(tempDir, 'hooks/accounts.ts'), 'utf-8')
     expect(content).toContain("from '../api/accounts'")
   })
   ```

### Integration Tests

1. **Generate from sales-patterns spec**
   ```bash
   sync-patterns generate ../sales-patterns/openapi.json \
     --output ./test-output \
     --use-new-generators
   ```

2. **Type-check generated code**
   ```bash
   cd test-output && npx tsc --noEmit
   ```

3. **Compare with old output**
   ```bash
   sync-patterns generate ../sales-patterns/openapi.json \
     --output ./test-output \
     --compare
   ```

### Manual Validation

1. Generate for sales-patterns with new flag
2. Update sales-patterns frontend imports
3. Verify app still works
4. Verify TUI can use new API layer

## CLI Interface

```bash
# Existing behavior (unchanged)
sync-patterns generate <spec> --output <dir>

# New generator architecture (opt-in)
sync-patterns generate <spec> --output <dir> --use-new-generators

# Compare both and show differences
sync-patterns generate <spec> --output <dir> --compare

# Eventually (after validation)
sync-patterns generate <spec> --output <dir>  # New becomes default
sync-patterns generate <spec> --output <dir> --use-legacy-generators  # Old for migration
```

## Rollout Plan

1. **Week 1**: Implement `--use-new-generators` flag
2. **Week 2**: Test with sales-patterns, fix issues
3. **Week 3**: Make new generators default, add `--use-legacy-generators`
4. **Week 4+**: Remove legacy generators after no issues reported

## Success Criteria

- [x] `--use-new-generators` flag implemented
- [x] Generates `api/` directory with entity-grouped files
- [x] Generates `hooks/` directory with entity-grouped files
- [x] Hooks correctly import from API layer
- [x] Type-checks cleanly with `tsc --noEmit`
- [ ] `--compare` mode shows no functional differences (deferred)
- [x] sales-patterns generates correctly (22 methods across 3 entities)
- [ ] TUI can use generated API layer (separate spec: SYNC-012)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Import path changes break existing code | Opt-in flag, document migration |
| Missing features in new generators | Keep old generators available |
| Generated code has type errors | Integration test with tsc |
| Runtime behavior differs | Compare mode, manual testing |

## Dependencies

- SYNC-010 complete (EntityResolver, ApiGenerator, HookGenerator)
- Test fixtures available (sales-patterns-openapi.json)

## Out of Scope

- SchemaGenerator refactor (deferred in SYNC-010)
- Collections refactor (keep using old)
- TUI updates (separate spec - SYNC-012)
