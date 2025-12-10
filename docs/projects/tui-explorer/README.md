# TUI Explorer Project

**Status**: Planning
**Created**: 2025-12-10
**Demo**: Spec-Driven Development workflow

---

## Overview

Terminal-based React application (Ink) for validating sync-patterns generated code without building a full frontend.

## Documentation Index

| Document | Purpose |
|----------|---------|
| [00-prd.md](./00-prd.md) | Product requirements, personas, user stories |
| [01-architecture.md](./01-architecture.md) | System design, component hierarchy, data flow |
| [02-components.md](./02-components.md) | Component library mapping, what to build vs reuse |
| [03-implementation-guide.md](./03-implementation-guide.md) | File-by-file build plan, quick start |
| [04-issues.md](./04-issues.md) | Issue breakdown with acceptance criteria |
| [CHANGELOG.md](./CHANGELOG.md) | Implementation progress log |

---

## Workflow: Spec-Driven Development

```
┌─────────────────────────────────────────────────────────────────┐
│                      1. PLANNING (Today)                         │
│                                                                  │
│  PRD → Architecture → Components → Issues                       │
│  "What are we building? How does it fit together?"              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      2. IMPLEMENTATION                           │
│                                                                  │
│  Agent reads docs → Writes code → Updates CHANGELOG             │
│  "Build exactly what the spec says"                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      3. REVIEW                                   │
│                                                                  │
│  Compare code to spec → Note deviations → Update docs           │
│  "Did we build what we planned?"                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Issue Tracking (Offline)

Issues are tracked in [04-issues.md](./04-issues.md) with status markers:

| Status | Marker | Meaning |
|--------|--------|---------|
| Planned | `[ ]` | Not started |
| In Progress | `[~]` | Being worked on |
| Done | `[x]` | Completed |
| Blocked | `[!]` | Has blockers |

### Current Status

| Phase | Issues | Status |
|-------|--------|--------|
| Phase 1 (MVP) | 1-9, 15-16 | `[ ]` Planned |
| Phase 2 (CRUD) | 10-11, 13 | `[ ]` Planned |
| Phase 3 (Advanced) | 12, 14 | `[ ]` Planned |

---

## Agent Implementation Workflow

When implementing, agents should:

1. **Before starting**: Read relevant docs in this folder
2. **During work**: Follow patterns in 01-architecture.md and 02-components.md
3. **After completing**:
   - Update issue status in 04-issues.md (`[ ]` → `[x]`)
   - Add entry to CHANGELOG.md with commit hash
   - Note any doc updates needed

---

## Quick Reference

### Dependencies
```bash
npm install ink @inkjs/ui ink-table chalk
```

### Project Structure
```
sync-patterns/src/tui/
├── App.tsx
├── components/
├── renderers/
├── hooks/
└── utils/
```

### Key Libraries
- **ink** - React for CLI (core)
- **@inkjs/ui** - TextInput, Select, Spinner, Badge, Alert
- **ink-table** - Table rendering
- **chalk** - Terminal colors

---

## Maintainers

- Pattern Stack Team
