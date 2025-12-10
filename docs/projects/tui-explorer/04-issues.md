# TUI Explorer - Issues

**Status**: Planning
**Tracking**: Offline (markdown checkboxes)

---

## Status Key

| Marker | Meaning |
|--------|---------|
| `[ ]` | Planned |
| `[~]` | In Progress |
| `[x]` | Done |
| `[!]` | Blocked |

---

## Phase 1: Read-Only MVP

### [ ] Issue 1: TUI Foundation & CLI Command

**Priority**: P0 (Critical)
**Estimate**: 3 points
**Refs**: [01-architecture.md](./01-architecture.md), [02-components.md](./02-components.md)

### Description

Set up the TUI foundation using Ink (React for terminals) and add the `sync-patterns explore` CLI command.

### Acceptance Criteria

- [ ] Install Ink, chalk, ora, boxen dependencies
- [ ] Create `src/tui/` directory structure (components/, renderers/, utils/)
- [ ] Create `src/cli/commands/explore.ts` with CLI argument parsing
- [ ] Wire explore command to main CLI (`sync-patterns explore`)
- [ ] Create basic `src/tui/App.tsx` root component
- [ ] Support `--entity <name>` and `--api-url <url>` flags
- [ ] Validate `src/generated/` exists before launching TUI
- [ ] Clear error message if generated code missing

### Technical Notes

- Follow pattern from `src/cli/commands/generate.ts`
- Use Commander for CLI argument parsing (already installed)
- Ink version 4.x for React 18 compatibility
- Test with `npm run build && sync-patterns explore`

### Files to Create/Modify

```
src/tui/App.tsx                    (~100 lines)
src/cli/commands/explore.ts        (~120 lines)
src/cli/index.ts                   (add explore command)
package.json                       (add dependencies)
```

---

## Issue 2: Terminal Field Renderers

**Title**: `feat(tui): Terminal field renderers for all 19 UITypes`

**Priority**: P0 (Critical)
**Estimate**: 3 points
**Labels**: `feature`, `phase-1`

### Description

Create terminal-native renderers for all 19 UITypes, adapting the existing frontend-patterns field rendering system for ANSI terminal output.

### Acceptance Criteria

- [ ] Create renderer registry mapping UIType → terminal output
- [ ] Reuse `formatMoney()`, `formatDate()`, `formatNumber()` from frontend-patterns
- [ ] All 19 UITypes render correctly:
  - text, password (masked ●●●)
  - number, money (green, formatted), percent
  - date, datetime (gray, localized)
  - email, url, phone (displayed as text)
  - boolean (✓/✗ symbols)
  - badge, status (colored with ● indicator)
  - entity, user (name with optional icon)
  - json (syntax highlighted)
  - image, file (filename only)
  - rating (★☆ symbols)
  - color (hex with swatch approximation)
- [ ] Graceful fallback for unknown types
- [ ] Terminal capability detection (colors, unicode)
- [ ] ASCII fallbacks for terminals without unicode

### Technical Notes

- Reference: `frontend-patterns/src/atoms/utils/ui-mapping.tsx` lines 179-407
- Status colors: success=green, warning=yellow, error=red, info=cyan, neutral=gray
- Import formatters, don't duplicate logic
- Use chalk for ANSI colors

### Files to Create

```
src/tui/renderers/index.ts         (~250 lines)
src/tui/utils/terminal.ts          (~50 lines - capability detection)
```

---

## Issue 3: Entity Discovery & Navigation

**Title**: `feat(tui): Entity discovery and EntityList navigation component`

**Priority**: P0 (Critical)
**Estimate**: 2 points
**Labels**: `feature`, `phase-1`

### Description

Dynamically discover available entities from generated code and provide a navigable list UI.

### Acceptance Criteria

- [ ] Scan `src/generated/entities/` to find entity modules
- [ ] Extract entity metadata: name, displayName, syncMode, available operations
- [ ] Detect sync mode (api/realtime/offline) from imports
- [ ] Create `EntityList` component with:
  - Scrollable list of entities with record counts
  - Arrow key navigation (↑/↓)
  - Enter to select, Esc to go back
  - Current selection highlight
  - Sync mode indicator per entity (● realtime, ○ api)
- [ ] Show loading state while fetching counts
- [ ] Handle empty entities gracefully

### Technical Notes

- Reference: `entity-generator.ts` for entity extraction patterns
- Use `useInput` from Ink for keyboard handling
- Record counts fetched via generated hooks (or show "?" if slow)

### Files to Create

```
src/tui/utils/entity-discovery.ts  (~80 lines)
src/tui/components/EntityList.tsx  (~100 lines)
```

---

## Issue 4: DataTable Component

**Title**: `feat(tui): DataTable component with pagination and column rendering`

**Priority**: P0 (Critical)
**Estimate**: 5 points
**Labels**: `feature`, `phase-1`

### Description

Create the main data table view that displays entity records using metadata-driven column rendering.

### Acceptance Criteria

- [ ] Render data in tabular format with column headers
- [ ] Use ColumnMetadata from backend for column definitions
- [ ] Apply field renderers based on column type
- [ ] Smart column width calculation (truncate long values)
- [ ] Limit to 5-6 visible columns (most important first)
- [ ] Keyboard navigation:
  - ↑/↓: Navigate rows
  - PgUp/PgDn: Page navigation
  - Enter: Open detail view
  - Esc: Back to entity list
  - /: Enter search mode
- [ ] Pagination with page indicator (Page 1 of 5)
- [ ] Current row highlight
- [ ] Loading state with spinner
- [ ] Error state with message

### Technical Notes

- Reference: `frontend-patterns/src/atoms/components/data/DataTable/DataTable.tsx`
- Use `useMetadata('list')` from generated hooks for columns
- Respect `ui_importance` for column priority
- Handle terminal width constraints (80-120 cols typical)

### Files to Create

```
src/tui/components/DataTable.tsx   (~200 lines)
```

---

## Issue 5: Detail View Component

**Title**: `feat(tui): DetailView component with grouped fields`

**Priority**: P1 (High)
**Estimate**: 3 points
**Labels**: `feature`, `phase-1`

### Description

Create a detail view showing a single record with all fields organized by metadata groups.

### Acceptance Criteria

- [ ] Vertical layout showing all fields (label: value)
- [ ] Group fields by `ui_group` (identification, financial, sales_process, etc.)
- [ ] Collapsible sections with group headers
- [ ] Apply field renderers for proper formatting
- [ ] Show metadata fields (created_at, updated_at, id) in separate section
- [ ] Keyboard navigation:
  - ↑/↓: Scroll through fields
  - b or Esc: Back to table
  - e: Edit (future - show "Coming soon")
  - d: Delete (future - show "Coming soon")
- [ ] Handle null/undefined values gracefully
- [ ] Scrollable for records with many fields

### Technical Notes

- Reference: `sales-patterns/application/frontend/src/pages/AdminEditPage.tsx` for grouping logic
- Use boxen for section borders
- Group order: identification, financial, sales_process, contact, general, metadata

### Files to Create

```
src/tui/components/DetailView.tsx  (~150 lines)
```

---

## Issue 6: Search & Filtering

**Title**: `feat(tui): Search and filtering functionality`

**Priority**: P1 (High)
**Estimate**: 3 points
**Labels**: `feature`, `phase-1`

### Description

Add search and filtering capabilities to the DataTable view.

### Acceptance Criteria

- [ ] Press `/` to enter search mode
- [ ] Text input for search query
- [ ] Filter across all text, email, url, phone fields
- [ ] Case-insensitive matching
- [ ] Show match count in header (12 of 142)
- [ ] Highlight current search term
- [ ] Clear search with Esc
- [ ] Field-specific filters: `field:value` syntax
- [ ] Support operators: `>`, `<`, `!` (not)
- [ ] Multiple filters: `status:active type:premium`
- [ ] Show active filters in header

### Technical Notes

- Filter locally (client-side) for now
- Could support server-side filtering in future via query params
- Reference: `frontend-patterns` DataTable search implementation

### Files to Create/Modify

```
src/tui/components/SearchBar.tsx   (~80 lines)
src/tui/components/DataTable.tsx   (add search integration)
src/tui/hooks/useSearch.ts         (~60 lines)
```

---

## Issue 7: Generated Hook Integration

**Title**: `feat(tui): Integrate with sync-patterns generated hooks`

**Priority**: P0 (Critical)
**Estimate**: 3 points
**Labels**: `feature`, `phase-1`

### Description

Wire up the TUI to consume actual data from generated entity hooks, supporting both optimistic and confirmed sync modes.

### Acceptance Criteria

- [ ] Dynamically import hooks from `src/generated/entities/`
- [ ] Support `useList()` for entity tables
- [ ] Support `useOne(id)` for detail view
- [ ] Support `useMetadata()` for column definitions
- [ ] Handle loading states from hooks
- [ ] Handle error states from hooks
- [ ] Detect and display sync mode (realtime/offline/api)
- [ ] Show sync status indicator in header
- [ ] Works with both TanStack Query (api) and TanStack DB (realtime/offline)
- [ ] Graceful handling when hooks fail to load

### Technical Notes

- Reference: `sales-patterns/application/frontend/src/generated/entities/accounts.ts`
- Use dynamic imports to load entity modules
- TanStack Query needs QueryClientProvider - set up in App.tsx
- May need to mock/stub React context for terminal environment

### Files to Create/Modify

```
src/tui/App.tsx                    (add QueryClientProvider)
src/tui/hooks/useEntity.ts         (~100 lines - wrapper for dynamic imports)
src/tui/utils/entity-discovery.ts  (enhance to extract hook names)
```

---

## Issue 8: Status Bar & Help System

**Title**: `feat(tui): Status bar, header, and help system`

**Priority**: P2 (Medium)
**Estimate**: 2 points
**Labels**: `feature`, `phase-1`

### Description

Add persistent UI chrome: header with app title/sync mode, footer with keyboard shortcuts, and help overlay.

### Acceptance Criteria

- [ ] Header component showing:
  - App title "sync-patterns Explorer"
  - Current entity name (when in table/detail view)
  - Sync mode indicator (● Realtime / ○ API / ◐ Offline)
  - API URL (truncated)
- [ ] StatusBar (footer) component showing:
  - Context-sensitive keyboard shortcuts
  - Different shortcuts per view (list, table, detail)
  - Current page / total pages (in table view)
- [ ] Help overlay (press `?`):
  - Full keyboard shortcut reference
  - Dismiss with any key
- [ ] Quit with `q` from any view (with confirmation if unsaved changes)

### Technical Notes

- Use Ink's `Box` with `position="absolute"` for fixed positioning
- Help overlay uses boxen for modal effect
- Shortcuts should match PRD Section 7.2

### Files to Create

```
src/tui/components/Header.tsx      (~60 lines)
src/tui/components/StatusBar.tsx   (~80 lines)
src/tui/components/HelpOverlay.tsx (~100 lines)
```

---

## Issue 9: Error Handling & Loading States

**Title**: `feat(tui): Comprehensive error handling and loading states`

**Priority**: P1 (High)
**Estimate**: 2 points
**Labels**: `feature`, `phase-1`

### Description

Implement robust error handling and loading states throughout the TUI.

### Acceptance Criteria

- [ ] Loading spinner (ora) while fetching data
- [ ] Skeleton/placeholder while loading table
- [ ] Clear error messages with context
- [ ] TypeScript import errors: show file and line number
- [ ] Network errors: show status code and message
- [ ] Validation errors: show field and constraint
- [ ] Retry option for transient errors (press `r`)
- [ ] Graceful degradation when generated code is invalid
- [ ] Error boundary to prevent crashes
- [ ] Force quit with double Ctrl+C

### Technical Notes

- Use ora for spinners (already in deps)
- Wrap dynamic imports in try/catch
- Log errors to stderr, show user-friendly message in TUI
- Consider `--debug` flag for verbose error output

### Files to Create/Modify

```
src/tui/components/ErrorView.tsx   (~80 lines)
src/tui/components/LoadingView.tsx (~40 lines)
src/tui/utils/error-handler.ts     (~60 lines)
```

---

## Issue 10: CRUD Operations - Create

**Title**: `feat(tui): Create operation with form generation`

**Priority**: P1 (High)
**Estimate**: 5 points
**Labels**: `feature`, `phase-2`

### Description

Add create functionality with forms generated from Zod schemas.

### Acceptance Criteria

- [ ] Press `n` on entity list to create new record
- [ ] Generate form fields from Zod schema
- [ ] Input components by field type:
  - Text input for strings
  - Number input for numbers
  - Select/dropdown for enums
  - Date picker (simplified) for dates
  - Checkbox for booleans
- [ ] Required field indicators (*)
- [ ] Default values from schema
- [ ] Tab/Shift+Tab navigation between fields
- [ ] Validation on blur and on submit
- [ ] Inline error messages per field
- [ ] Submit with Ctrl+S
- [ ] Cancel with Esc (confirm if changes made)
- [ ] Success message on create
- [ ] Return to table view after create

### Technical Notes

- Reference: `sales-patterns/AdminEditPage.tsx` for form logic
- Import Zod schemas from `src/generated/schemas/`
- Use `schema.safeParse()` for validation
- Handle optimistic vs confirmed mode

### Files to Create

```
src/tui/components/FormView.tsx    (~250 lines)
src/tui/components/FormField.tsx   (~100 lines)
src/tui/hooks/useForm.ts           (~80 lines)
```

---

## Issue 11: CRUD Operations - Update & Delete

**Title**: `feat(tui): Update and delete operations`

**Priority**: P1 (High)
**Estimate**: 4 points
**Labels**: `feature`, `phase-2`

### Description

Add update and delete functionality to the detail view.

### Acceptance Criteria

**Update:**
- [ ] Press `e` on detail view to edit
- [ ] Pre-populate form with current values
- [ ] Track changed fields only
- [ ] Show diff before submitting (optional)
- [ ] Partial update (only changed fields sent to API)
- [ ] Handle optimistic mode (immediate UI update)
- [ ] Handle confirmed mode (loading state)

**Delete:**
- [ ] Press `d` on detail view to delete
- [ ] Confirmation dialog (type "DELETE" to confirm)
- [ ] Show record summary in confirmation
- [ ] Handle soft delete vs hard delete
- [ ] Success/error message
- [ ] Return to table view after delete

### Technical Notes

- Reuse FormView from Issue 10
- Use `update?.mutateAsync()` from generated hooks
- Use `delete?.mutateAsync()` from generated hooks
- Show sync status during mutation

### Files to Modify

```
src/tui/components/DetailView.tsx  (add edit/delete triggers)
src/tui/components/FormView.tsx    (add update mode)
src/tui/components/ConfirmDialog.tsx (~80 lines)
```

---

## Issue 12: Query Inspector

**Title**: `feat(tui): Query inspector for debugging API calls`

**Priority**: P2 (Medium)
**Estimate**: 3 points
**Labels**: `feature`, `phase-3`

### Description

Add a query inspector panel showing raw API requests/responses for debugging.

### Acceptance Criteria

- [ ] Toggle inspector with `i` key
- [ ] Show last API request:
  - Method and URL
  - Headers (redact auth token)
  - Request body (if any)
- [ ] Show response:
  - Status code and text
  - Response time (ms)
  - Response body (pretty-printed JSON)
- [ ] Syntax highlighting for JSON
- [ ] Copy as curl command (press `c`)
- [ ] Scrollable for large responses
- [ ] Persists across navigation (shows last request)

### Technical Notes

- Intercept axios requests/responses
- Store last N requests (default 10)
- Use chalk for JSON syntax highlighting
- Reference: PRD Layout 5 (Query Inspector mockup)

### Files to Create

```
src/tui/components/Inspector.tsx   (~150 lines)
src/tui/hooks/useRequestLog.ts     (~80 lines)
```

---

## Issue 13: Relationship Navigation

**Title**: `feat(tui): Navigate between related entities`

**Priority**: P2 (Medium)
**Estimate**: 3 points
**Labels**: `feature`, `phase-2`

### Description

Enable navigation from entity references to their related records.

### Acceptance Criteria

- [ ] Detect entity/user reference fields from metadata
- [ ] Show reference fields as navigable links
- [ ] Press Enter on reference field to navigate
- [ ] Breadcrumb trail (Orders > #1234 > Customer)
- [ ] Press `b` to go back in breadcrumb
- [ ] Handle circular references gracefully
- [ ] Support multi-level navigation (3+ levels)
- [ ] Cache visited records for fast back navigation

### Technical Notes

- Reference fields have `ui_type: 'entity'` or `ui_type: 'user'`
- Need to detect target entity from field name or format.entityType
- Store navigation stack in App state

### Files to Modify

```
src/tui/App.tsx                    (add navigation stack)
src/tui/components/DetailView.tsx  (make refs clickable)
src/tui/components/Breadcrumb.tsx  (~60 lines)
```

---

## Issue 14: Configuration & Persistence

**Title**: `feat(tui): Configuration file and session persistence`

**Priority**: P3 (Low)
**Estimate**: 2 points
**Labels**: `feature`, `phase-3`

### Description

Add configuration file support and persist user preferences across sessions.

### Acceptance Criteria

- [ ] Config file at `~/.sync-patterns/config.json`
- [ ] Configurable options:
  - defaultApiUrl
  - defaultEntity
  - theme (light/dark)
  - pageSize
- [ ] Saved filters per entity
- [ ] Remember last viewed entity
- [ ] Remember scroll position when returning to list
- [ ] Environment variable overrides
- [ ] `--config <path>` flag for custom config

### Technical Notes

- Use `os.homedir()` for config location
- Merge: defaults → config file → env vars → CLI flags
- Don't save sensitive data (tokens) to config

### Files to Create

```
src/tui/utils/config.ts            (~100 lines)
```

---

## Issue 15: Testing & Terminal Compatibility

**Title**: `test(tui): Unit tests and terminal compatibility testing`

**Priority**: P1 (High)
**Estimate**: 3 points
**Labels**: `testing`, `phase-1`

### Description

Comprehensive testing for TUI components and terminal compatibility.

### Acceptance Criteria

**Unit Tests:**
- [ ] Field renderer tests (all 19 UITypes)
- [ ] Entity discovery tests
- [ ] Search/filter logic tests
- [ ] Form validation tests
- [ ] 80%+ test coverage

**Integration Tests:**
- [ ] Full navigation flow (list → table → detail → back)
- [ ] Mock generated hooks
- [ ] Error handling scenarios

**Terminal Compatibility:**
- [ ] macOS Terminal
- [ ] iTerm2
- [ ] Windows Terminal
- [ ] PowerShell
- [ ] WSL Ubuntu
- [ ] Linux (GNOME Terminal, Konsole)
- [ ] Document unsupported terminals

### Technical Notes

- Use Vitest for unit tests
- Use ink-testing-library for component tests
- Create terminal compatibility matrix in docs

### Files to Create

```
tests/tui/renderers.test.ts
tests/tui/entity-discovery.test.ts
tests/tui/components/*.test.tsx
docs/terminal-compatibility.md
```

---

## Issue 16: Documentation & Examples

**Title**: `docs(tui): Documentation, README, and usage examples`

**Priority**: P2 (Medium)
**Estimate**: 2 points
**Labels**: `documentation`, `phase-1`

### Description

Create comprehensive documentation for the TUI Explorer.

### Acceptance Criteria

- [ ] README section for `sync-patterns explore`
- [ ] Keyboard shortcuts reference table
- [ ] Usage examples for common workflows
- [ ] Troubleshooting guide (terminal issues)
- [ ] Screenshots/GIFs of TUI in action
- [ ] Integration with existing sync-patterns docs
- [ ] Help text in CLI (`sync-patterns explore --help`)

### Technical Notes

- Add to existing sync-patterns README
- Create separate `docs/tui-explorer.md` for detailed guide
- Use asciinema or similar for terminal recordings

### Files to Create/Modify

```
README.md                          (add explore section)
docs/tui-explorer.md               (~200 lines)
docs/keyboard-shortcuts.md         (~100 lines)
```

---

## Summary

| Issue | Title | Priority | Points | Phase |
|-------|-------|----------|--------|-------|
| 1 | TUI Foundation & CLI Command | P0 | 3 | 1 |
| 2 | Terminal Field Renderers | P0 | 3 | 1 |
| 3 | Entity Discovery & Navigation | P0 | 2 | 1 |
| 4 | DataTable Component | P0 | 5 | 1 |
| 5 | Detail View Component | P1 | 3 | 1 |
| 6 | Search & Filtering | P1 | 3 | 1 |
| 7 | Generated Hook Integration | P0 | 3 | 1 |
| 8 | Status Bar & Help System | P2 | 2 | 1 |
| 9 | Error Handling & Loading States | P1 | 2 | 1 |
| 10 | CRUD - Create | P1 | 5 | 2 |
| 11 | CRUD - Update & Delete | P1 | 4 | 2 |
| 12 | Query Inspector | P2 | 3 | 3 |
| 13 | Relationship Navigation | P2 | 3 | 2 |
| 14 | Configuration & Persistence | P3 | 2 | 3 |
| 15 | Testing & Compatibility | P1 | 3 | 1 |
| 16 | Documentation | P2 | 2 | 1 |

**Phase 1 Total**: 26 points (Issues 1-9, 15-16)
**Phase 2 Total**: 12 points (Issues 10-11, 13)
**Phase 3 Total**: 5 points (Issues 12, 14)

**Overall Total**: 43 points
