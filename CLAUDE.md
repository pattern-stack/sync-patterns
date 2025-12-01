# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**sync-patterns** is the real-time data synchronization layer for Pattern Stack. It provides a CLI that generates typed clients from OpenAPI specs, enabling local-first, offline-capable applications with Linear/Notion-level UI snappiness.

## Terminology

> **IMPORTANT**: See `docs/TERMINOLOGY.md` for canonical terms. Summary:

| Config | Behavior | Description |
|--------|----------|-------------|
| `local_first: true` | **Optimistic** | Write to local DB, sync later, UI instant |
| `local_first: false` | **Confirmed** | Write to local DB, wait for server |

**Deprecated terms (DO NOT USE)**: `push`, `sync`, `live`, `cache`

## Architecture

```
                     OPENAPI SPEC
                (single source of truth)
                          │
                          ▼
┌────────────────────────────────────────────┐
│              SYNC-PATTERNS CLI             │
│           (generates typed clients)        │
└────────────────────────────────────────────┘
                          │
                          ▼
              src/generated/
              ├── schemas/       # Zod schemas
              ├── client/        # API client
              ├── hooks/         # TanStack Query hooks
              ├── collections/   # TanStack DB collections
              └── entities/      # Unified wrappers
```

## Sync Configuration

Backend models declare sync behavior:
```python
class Contact(ActorPattern):
    class Pattern:
        local_first = True  # Optimistic mode
```

OpenAPI output:
```yaml
paths:
  /contacts:
    x-sync:
      local_first: true
```

## Tech Stack (Decided)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Client Store | TanStack DB | Reactive collections, optimistic mutations |
| Sync Engine | ElectricSQL | Postgres → client real-time sync |
| API Layer | TanStack Query | Fallback for confirmed mode |
| Local DB | PGlite | Postgres WASM (same SQL as backend) |
| Validation | Zod | Runtime schema validation |

## Generated Output

```
src/generated/
├── schemas/           # Zod schemas (all entities)
│   └── {entity}.schema.ts
├── client/            # API client (all entities)
│   └── methods.ts
├── hooks/             # TanStack Query hooks (all entities)
│   └── queries.ts, mutations.ts
├── collections/       # TanStack DB (local_first: true only)
│   └── {entity}.ts
├── entities/          # Unified wrappers (all entities)
│   └── {entity}.ts    # Abstracts optimistic vs confirmed
├── config.ts          # Runtime sync configuration
└── index.ts
```

## Commands

```bash
# Install dependencies
npm install

# Build CLI
npm run build

# Run CLI
sync-patterns generate <openapi-spec> --output <dir>

# Development
npm run dev      # Watch mode
npm run test     # Run tests
npm run lint     # Lint code
```

## Key Files

| File | Purpose |
|------|---------|
| `src/cli/commands/generate.ts` | Main CLI command |
| `src/generators/zod-generator.ts` | Zod schema generation |
| `src/generators/client-generator.ts` | API client generation |
| `src/generators/hook-generator.ts` | TanStack Query hooks |
| `src/generators/collection-generator.ts` | TanStack DB collections (TODO) |
| `src/generators/entity-generator.ts` | Unified wrappers (TODO) |

## Implementation Status

### Phase 1: CLI Foundation
- [x] Zod schema generation with runtime validation
- [x] API client generation (axios-based)
- [x] React Query hook generation
- [x] OpenAPI parser with x-sync extension support
- [ ] TanStack DB collection generation
- [ ] Unified entity wrapper generation
- [ ] Runtime config generation

### Backend Integration (backend-patterns)
- [ ] `local_first` on Pattern config
- [ ] `sync_exclude` on Field class
- [ ] Return `txid` from mutation endpoints
- [ ] Custom OpenAPI hook for x-sync extensions

## Key Principles

1. **OpenAPI as source of truth** - Types and sync modes declared once, generated everywhere
2. **Progressive enhancement** - Start with `local_first: false`, upgrade to `true` per entity
3. **Backend unchanged** - Pattern Stack handles business logic, sync-patterns handles delivery
4. **Unified interface** - Components don't know which mode is active
5. **Runtime flexibility** - Config can be overridden without regenerating

## Documentation

- `docs/TERMINOLOGY.md` - Canonical terminology reference
- `docs/PLAN.md` - Working implementation plan
- `docs/adr/` - Architecture Decision Records
- `docs/specs/` - Detailed specifications

## Related Repositories

- [backend-patterns](https://github.com/pattern-stack/backend-patterns) - Python/FastAPI Atomic Architecture framework
- [frontend-patterns](https://github.com/pattern-stack/frontend-patterns) - React frontend framework
