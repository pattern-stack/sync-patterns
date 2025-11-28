# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**sync-patterns** is the real-time data synchronization layer for Pattern Stack. It provides a CLI that generates typed clients from OpenAPI specs, enabling local-first, offline-capable applications with Linear/Notion-level UI snappiness.

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
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   frontend-patterns  swift-patterns  kotlin-patterns
        (React)         (SwiftUI)       (Android)
```

### Sync Modes

Features declare sync mode in OpenAPI spec via `x-sync` extension:

```yaml
paths:
  /contacts:
    x-sync: live    # real-time, local-first
  /analytics:
    x-sync: push    # traditional API calls
```

- **`live`** - Local-first with instant UI updates, background sync (uses ElectricSQL/Zero/TanStack DB)
- **`push`** - Traditional API calls with TanStack Query

Components consume a unified interface - they don't know or care which mode is active.

## Key Principles

1. **OpenAPI as source of truth** - Types and sync modes declared once, generated everywhere
2. **Progressive enhancement** - Start with `push`, flip to `live` when ready
3. **Backend unchanged** - Pattern Stack handles business logic, sync-patterns handles delivery
4. **Cross-platform** - Same spec generates React, SwiftUI, Kotlin clients
5. **Unified interface** - Components are agnostic to sync mode

## Sync Engine Candidates

| Engine | Status |
|--------|--------|
| ElectricSQL | Works with existing Postgres |
| Zero | Clean API, good DX |
| TanStack DB | TanStack ecosystem, very new |
| Convex | Turnkey but opinionated backend |

## Current Status

**Phase: Planning** - Architecture vision documented. Implementation follows once backend-patterns and frontend-patterns reach stability.

## Related Repositories

- [backend-patterns](https://github.com/pattern-stack/backend-patterns) - Python/FastAPI Atomic Architecture framework
- [frontend-patterns](https://github.com/pattern-stack/frontend-patterns) - React frontend framework
