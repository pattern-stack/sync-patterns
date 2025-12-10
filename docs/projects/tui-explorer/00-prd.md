# Product Requirements Document: sync-patterns TUI Explorer

**Version**: 1.0
**Status**: Draft
**Created**: 2025-12-10
**Owner**: Pattern Stack Team
**Target Release**: sync-patterns v2.0

---

## 1. Executive Summary

### 1.1 Problem Statement

Pattern Stack developers face a critical validation gap in their development workflow:

1. **Backend changes require full frontend builds to validate**: Modifying backend models or sync-patterns generators requires building and running an entire frontend application to confirm the generated TypeScript code actually works.

2. **No quick feedback loop**: The cycle of "change backend → regenerate → test in frontend" takes 5-10 minutes per iteration, slowing development velocity by 80%.

3. **No data exploration tools**: Developers and operations teams lack a lightweight way to inspect Pattern Stack backend data without either building a custom frontend or using raw database/API tools.

4. **Generated code verification is manual**: After generating hooks, types, and schemas from OpenAPI specs, there's no automated way to verify they compile, render correctly, or handle all 19 UITypes properly.

### 1.2 Solution Overview

The **sync-patterns TUI Explorer** is a terminal-based React application (using Ink) that provides instant validation of generated sync-patterns code without requiring a full frontend build. It:

- Consumes generated hooks, types, and schemas directly from `src/generated/`
- Renders data in the terminal using the same field renderer pattern as frontend-patterns
- Provides a keyboard-driven interface for browsing, searching, and exploring entities
- Acts as a lightweight admin panel for any Pattern Stack backend
- Validates that all 19 UITypes render correctly in a terminal context
- Enables rapid iteration on backend models and sync-patterns generators

### 1.3 Key Benefits

| Benefit | Impact |
|---------|--------|
| **Instant validation** | Reduce validation cycle from 5-10 minutes to 10-30 seconds |
| **Zero frontend dependency** | Test sync-patterns changes without building frontend-patterns |
| **Data exploration** | Quick access to backend data for debugging and operations |
| **Field renderer validation** | Confirm all 19 UITypes work correctly before frontend integration |
| **Developer velocity** | Enable rapid iteration on backend models and generators |
| **Operations support** | Give DevOps/DBA teams a modern CLI for data inspection |
| **Documentation by example** | Generated code serves as live documentation of API capabilities |

---

## 2. User Personas

### 2.1 The Framework Developer

**Name**: Alex Chen
**Role**: Core Pattern Stack contributor
**Environment**: macOS, VS Code, terminal-heavy workflow
**Technical Level**: Expert (writes TypeScript generators, Python backend, React components)

#### Pain Points
- Spends 40% of development time waiting for frontend builds to validate backend changes
- Frequently breaks generated code with generator refactors, discovers issues late
- Needs to verify all 19 UITypes render correctly after changing field rendering logic
- Must switch between 3+ terminal windows (backend, frontend, sync-patterns) to test changes
- Has to manually test every entity type after regenerating code

#### Goals
- Validate sync-patterns generator changes in under 30 seconds
- Confirm backend model changes produce working TypeScript without building frontend
- Test field renderer edge cases (null values, long strings, special characters) quickly
- Verify optimistic vs confirmed mode behavior without browser DevTools

#### How TUI Explorer Helps
- Run `sync-patterns explore` immediately after regeneration to validate all entities load
- Test field rendering edge cases with real backend data in seconds
- Switch between entities with arrow keys, no context switching
- View API requests/responses inline to debug generator issues
- Validate sync mode behavior (optimistic vs confirmed) with status indicators

#### Example Scenario
> "I just refactored the Zod schema generator to handle nested objects better. Before TUI Explorer, I'd spend 10 minutes: regenerate code, rebuild frontend, start dev server, navigate to the right page, check the data. Now I run `sync-patterns explore --entity products` and see the results in 15 seconds. If there's a TypeScript error, I see it immediately. If the schema is wrong, I see the runtime validation error. Game changer."

---

### 2.2 The App Developer

**Name**: Jordan Martinez
**Role**: Application developer building a CRM on Pattern Stack
**Environment**: Linux, Neovim, tmux workflow
**Technical Level**: Advanced (knows React and TypeScript, learning Pattern Stack)

#### Pain Points
- Unsure which backend fields are available without reading OpenAPI specs
- Needs to understand entity relationships and available filters before building UI
- Wants to verify API behavior before writing React components
- Struggles to debug data issues - is it the backend, the generator, or the frontend?
- Has to build example pages just to see what data looks like

#### Goals
- Explore backend entities to understand data structure before coding
- Test API queries and filters to plan component data needs
- Verify sync mode (optimistic vs confirmed) per entity
- Quickly check if new backend features work before integrating
- Debug data issues without browser DevTools

#### How TUI Explorer Helps
- Browse all entities with `sync-patterns explore` to discover available data
- Search and filter to test query capabilities before building search UI
- View field metadata (type, format, validation) to plan form components
- Test relationship navigation (e.g., order → customer → contacts)
- Copy example data for test fixtures and documentation

#### Example Scenario
> "I'm building a contacts page and need to know what fields are available. Instead of digging through OpenAPI specs or running the backend, I run `sync-patterns explore --entity contacts`. I see all fields with types, test the search, and check how status badges render. I even discover there's a 'company_name' computed field I didn't know about. Saved me hours."

---

### 2.3 The DevOps/DBA

**Name**: Sam Kumar
**Role**: DevOps engineer and database administrator
**Environment**: Production servers, SSH sessions, no GUI access
**Technical Level**: Intermediate (SQL expert, basic TypeScript knowledge)

#### Pain Points
- Can't access frontend applications from production servers (security policy)
- SQL queries return raw data - hard to read status codes, UUIDs, JSON blobs
- No quick way to verify data integrity after migrations or imports
- Must context-switch between SQL and application logic to understand data
- Needs to inspect data during incidents without exposing database credentials

#### Goals
- Quick data inspection during production incidents
- Verify data migrations completed correctly
- Explore data without writing SQL queries
- Understand entity relationships and business logic context
- Provide read-only access to support teams without database credentials

#### How TUI Explorer Helps
- SSH into server, run `sync-patterns explore` - instant data access
- Status fields render with colors (success/warning/error) - spot issues fast
- Search and filter without SQL - accessible to non-DBA support staff
- View relationships (e.g., which orders are stuck in 'processing')
- Export data to JSON for incident reports

#### Example Scenario
> "We had a production incident where orders were stuck in 'pending' state. I SSH'd into the server, ran `sync-patterns explore --entity orders --filter 'state:pending'`, and saw 47 orders with the same error pattern. The TUI showed me the full order details, related customer info, and state transition history - all without writing a single SQL query. Diagnosed the issue in 2 minutes."

---

### 2.4 The API Consumer

**Name**: Riley Thompson
**Role**: External developer evaluating Pattern Stack for their project
**Environment**: Windows, cursor, exploring open-source solutions
**Technical Level**: Intermediate (React developer, evaluating frameworks)

#### Pain Points
- Needs to understand API capabilities before committing to a framework
- Wants to see real data examples, not just OpenAPI specs
- Uncertain about sync patterns (optimistic vs confirmed) - needs to see it working
- Doesn't want to build a full frontend just to evaluate the API
- Needs to demo the API to stakeholders without coding

#### Goals
- Explore API capabilities quickly to evaluate fit
- See real data rendering examples for all field types
- Understand sync patterns and how they affect UX
- Generate example API requests for documentation
- Demo backend capabilities to team without building frontend

#### How TUI Explorer Helps
- Install sync-patterns, run `npm run generate`, then `sync-patterns explore` - see everything
- Browse all entities to understand data model
- View API requests/responses to learn request format
- Test sync modes to understand optimistic vs confirmed behavior
- Screenshot TUI for documentation and presentations

#### Example Scenario
> "I'm evaluating Pattern Stack for our startup's CRM. The docs are good, but I wanted to see it working. I cloned backend-patterns, started it up, ran `sync-patterns generate` and `sync-patterns explore`. In 10 minutes, I was browsing contacts, products, and orders - all rendering beautifully in my terminal. I showed my CTO the TUI and he was sold. We're adopting Pattern Stack."

---

## 3. User Stories

### 3.1 Must Have (MVP - Phase 1)

#### Story 1: Entity List View
**As a** framework developer
**I want to** view a list of all available entities with their counts
**So that** I can quickly see what data is available and navigate to specific entities

**Acceptance Criteria:**
- Display scrollable list of all entities from generated code
- Show record count for each entity (e.g., "Contacts (47)")
- Highlight current selection with arrow key navigation
- Press Enter to view entity detail
- Press 'q' to quit application
- Show loading state while fetching counts
- Handle API errors gracefully with error message

#### Story 2: Entity Data Table
**As an** app developer
**I want to** view entity records in a table with field-aware rendering
**So that** I can explore data structure and verify field types

**Acceptance Criteria:**
- Display records in tabular format with column headers
- Render fields using UIType-aware formatters (money, date, status, etc.)
- Support arrow key navigation (up/down for rows, left/right for columns)
- Show pagination controls (page N of M, X records total)
- Handle empty states ("No records found")
- Truncate long text fields with ellipsis
- Highlight selected row

#### Story 3: Search and Filter
**As a** DevOps engineer
**I want to** search and filter entity records
**So that** I can quickly find specific data during incidents

**Acceptance Criteria:**
- Press '/' to enter search mode
- Search across all text fields (case-insensitive)
- Show search results count ("12 matches")
- Clear search with Esc key
- Highlight search matches in results
- Support simple field filters (e.g., `status:active`)
- Persist search across pagination

#### Story 4: Detail View
**As an** API consumer
**I want to** view detailed information for a single record
**So that** I can see all fields including relationships

**Acceptance Criteria:**
- Press Enter on a row to view detail
- Display all fields in labeled key-value format
- Group fields by metadata group (if available)
- Render each field using appropriate UIType formatter
- Show null values as "(empty)"
- Press Esc or 'b' to return to list view
- Support scrolling for records with many fields

#### Story 5: Field Rendering Validation
**As a** framework developer
**I want to** see all 19 UITypes rendered correctly in the terminal
**So that** I can validate field renderer changes work across all types

**Acceptance Criteria:**
- Render each UIType with terminal-appropriate formatting:
  - **text**: plain output
  - **password**: masked with dots (●●●●●)
  - **number**: formatted with thousand separators
  - **money**: currency symbol + formatted value
  - **percent**: value + % symbol
  - **date**: formatted date (e.g., "Jan 15, 2024")
  - **datetime**: date + time (e.g., "Jan 15, 2024 2:30 PM")
  - **email**: clickable terminal link (if supported)
  - **url**: clickable terminal link with truncated display
  - **phone**: formatted phone number
  - **boolean**: ✓ or ✗ symbols
  - **badge**: colored text (using terminal colors)
  - **status**: colored text with status indicator (● Active)
  - **entity**: entity name with icon/abbreviation
  - **user**: initials + name
  - **json**: pretty-printed, truncated if long
  - **image**: show URL (terminal can't render images)
  - **rating**: star symbols (★★★★☆)
  - **color**: color name + ANSI color preview
  - **file**: file name + size

### 3.2 Should Have (Phase 2)

#### Story 6: Create Record
**As an** app developer
**I want to** create new records through the TUI
**So that** I can test CRUD operations without building forms

**Acceptance Criteria:**
- Press 'n' (new) on entity list to create record
- Show form with all required fields
- Use appropriate input widgets per UIType (text input, select, date picker)
- Validate input using Zod schemas
- Show validation errors inline
- Submit with Ctrl+S, cancel with Esc
- Show success message and return to list
- For optimistic mode: show immediate UI update, then sync indicator

#### Story 7: Update Record
**As a** DevOps engineer
**I want to** update existing records
**So that** I can fix data issues without SQL

**Acceptance Criteria:**
- Press 'e' (edit) on detail view to enter edit mode
- Pre-populate form with current values
- Support field-by-field editing with Tab navigation
- Validate changes with Zod schemas
- Show diff of changed fields before save
- Submit with Ctrl+S, cancel with Esc
- Handle optimistic vs confirmed mode appropriately
- Show sync status for optimistic updates

#### Story 8: Delete Record
**As a** framework developer
**I want to** delete records with confirmation
**So that** I can clean up test data

**Acceptance Criteria:**
- Press 'd' (delete) on detail view
- Show confirmation dialog with record summary
- Require typing 'DELETE' to confirm (for safety)
- Cancel with Esc or 'n'
- Show success message and return to list
- For optimistic mode: show immediate removal, then sync indicator
- Handle delete errors gracefully

#### Story 9: Relationship Navigation
**As an** app developer
**I want to** navigate between related entities
**So that** I can explore data relationships

**Acceptance Criteria:**
- Detect entity/user fields in detail view
- Press Enter on entity field to navigate to related record
- Show breadcrumb trail (e.g., "Orders > Order #1234 > Customer")
- Press 'b' to go back one level
- Support deep navigation (e.g., Order → Customer → Company → Primary Contact)
- Cache navigation history for fast back navigation

### 3.3 Could Have (Phase 3)

#### Story 10: Query Inspector
**As an** API consumer
**I want to** see the actual API requests and responses
**So that** I can learn the API format and debug issues

**Acceptance Criteria:**
- Press 'i' (inspector) to toggle query inspector panel
- Show HTTP method, URL, headers, and body for last request
- Show response status, headers, and body
- Pretty-print JSON with syntax highlighting
- Support copying request as curl command
- Show TanStack Query cache status
- For optimistic mode: show both local and server state

#### Story 11: Bulk Operations
**As a** DevOps engineer
**I want to** select and operate on multiple records
**So that** I can perform bulk updates efficiently

**Acceptance Criteria:**
- Press Space to select/deselect row
- Press 'a' to select all, Shift+A to deselect all
- Show selection count in footer ("5 selected")
- Press 'b' (bulk) to open bulk operations menu
- Support bulk delete, bulk update (single field), bulk export
- Show progress bar for bulk operations
- Handle partial failures gracefully

#### Story 12: Export Data
**As a** DevOps engineer
**I want to** export filtered data to JSON/CSV
**So that** I can analyze data externally or create reports

**Acceptance Criteria:**
- Press 'x' (export) to open export dialog
- Choose format: JSON, CSV, or JSON Lines
- Export current view (with search/filters applied) or all records
- Choose export location (prompt for file path)
- Show export progress for large datasets
- Include metadata (export timestamp, filters applied)
- Support exporting from detail view (single record)

### 3.4 Won't Have (Out of Scope)

- **Graphical charts/visualizations**: Terminal limitations make this impractical
- **Rich text editing**: Simple text input only
- **Image preview**: Can't render images in terminal
- **Multi-user collaboration**: Single-user tool only
- **Custom scripting/automation**: Use API directly for automation
- **Advanced query builder**: Use GraphQL/filtering via API instead

---

## 4. Functional Requirements

### 4.1 Entity Browsing

#### FR-1.1: Entity Discovery
- Auto-discover entities from `src/generated/entities/` directory
- Parse TypeScript exports to extract entity names and types
- Cache entity metadata for fast subsequent launches
- Support both single-entity (`--entity contacts`) and multi-entity modes

#### FR-1.2: List Rendering
- Render up to 100 records per page efficiently
- Support virtual scrolling for large datasets
- Calculate optimal column widths based on terminal size
- Truncate cells that exceed column width with ellipsis
- Support horizontal scrolling for tables wider than terminal

#### FR-1.3: Metadata Integration
- Fetch `ColumnMetadata` from backend if available
- Fall back to inferred metadata from TypeScript types
- Use metadata to determine field importance, grouping, and sorting
- Respect `visible: false` fields (hide by default, show on demand)

### 4.2 Navigation

#### FR-2.1: Keyboard Shortcuts
| Key | Action | Context |
|-----|--------|---------|
| `↑/↓` | Navigate rows/items | List view |
| `←/→` | Navigate columns/fields | Table view |
| `Enter` | Select/open | All views |
| `Esc` | Cancel/back | All views |
| `/` | Search | List view |
| `n` | New record | List view |
| `e` | Edit record | Detail view |
| `d` | Delete record | Detail view |
| `i` | Toggle inspector | All views |
| `q` | Quit | All views |
| `?` | Help | All views |
| `Tab` | Next field | Form view |
| `Shift+Tab` | Previous field | Form view |
| `Ctrl+S` | Save | Form view |
| `PgUp/PgDn` | Page navigation | List view |
| `Home/End` | First/last record | List view |

#### FR-2.2: Navigation State
- Maintain navigation history (breadcrumb trail)
- Preserve scroll position when returning to list
- Remember last viewed entity across sessions
- Support deep linking (e.g., `--entity contacts --id abc-123`)

### 4.3 Search and Filtering

#### FR-3.1: Text Search
- Search across all text, email, url, and phone fields
- Case-insensitive matching
- Highlight matches in results (if terminal supports)
- Show match count and current match position

#### FR-3.2: Field Filters
- Support basic field filters: `field:value`
- Support operators: `field>value`, `field<value`, `field:!value`
- Support multiple filters: `status:active type:premium`
- Show active filters in header
- Allow clearing individual filters or all at once

#### FR-3.3: Saved Filters
- Save commonly used filters with names
- List saved filters with `f` key
- Apply saved filter with quick select
- Store in local config file (`~/.sync-patterns/filters.json`)

### 4.4 Field Rendering

#### FR-4.1: Renderer Selection
- Use UIType from metadata or infer from TypeScript type
- Apply formatters from frontend-patterns (reuse logic)
- Fall back to `toString()` for unknown types
- Support custom renderers via config file

#### FR-4.2: Terminal Formatting
- Use ANSI color codes for status/badge/color fields
- Use Unicode symbols for boolean, rating, entity icons
- Apply text formatting (bold, italic, underline) where appropriate
- Detect terminal capabilities and degrade gracefully

#### FR-4.3: Responsive Rendering
- Adjust rendering based on terminal width
- Show compact mode (icon-only) for narrow terminals (<80 cols)
- Show full mode for wide terminals (>120 cols)
- Allow manual toggle between modes

### 4.5 CRUD Operations

#### FR-5.1: Create
- Generate form from Zod schema
- Validate input on blur and on submit
- Show validation errors with field context
- Support default values from schema
- Handle nested objects (flatten or show as JSON input)

#### FR-5.2: Read
- Fetch single record by ID
- Fetch related records (follow entity references)
- Cache fetched records for fast re-display
- Support refresh (re-fetch from server)

#### FR-5.3: Update
- Generate form pre-populated with current values
- Validate changes with Zod schema
- Show diff before submitting
- Support partial updates (only changed fields)
- Handle optimistic vs confirmed mode

#### FR-5.4: Delete
- Require confirmation (type 'DELETE')
- Show record summary in confirmation
- Handle soft delete vs hard delete (if backend supports)
- Show success/error message

### 4.6 Sync Mode Handling

#### FR-6.1: Mode Detection
- Read sync configuration from `src/generated/config.ts`
- Display mode indicator in UI (● Optimistic or ○ Confirmed)
- Support runtime override with `--mode confirmed` flag

#### FR-6.2: Optimistic Mode
- Show immediate UI updates on mutation
- Display sync status (pending/synced/error) next to record
- Show conflict resolution UI if sync fails
- Auto-retry failed syncs with exponential backoff

#### FR-6.3: Confirmed Mode
- Show loading state during mutation
- Block UI interactions until confirmation
- Show error immediately on failure
- Support retry on transient errors

---

## 5. Technical Requirements

### 5.1 Core Technology Stack

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| **Runtime** | Node.js | 18+ | Modern async/await, ESM support |
| **Language** | TypeScript | 5.0+ | Type safety, matches sync-patterns |
| **TUI Framework** | Ink | 4.x | React for terminals, component-based |
| **UI Components** | ink-ui | Latest | Pre-built components (select, input, table) |
| **CLI Framework** | Commander | 11.x | Robust CLI argument parsing |
| **Data Fetching** | TanStack Query | 5.x | Reuse generated hooks |
| **Validation** | Zod | 3.x | Runtime validation, reuse generated schemas |
| **Terminal Rendering** | chalk | 5.x | ANSI colors |
| **Terminal Utilities** | ora, boxen | Latest | Spinners, boxes |

### 5.2 Architecture

```
sync-patterns/
├── src/
│   ├── cli/
│   │   └── commands/
│   │       └── explore.ts          # Main explore command
│   ├── tui/
│   │   ├── App.tsx                 # Root Ink component
│   │   ├── components/
│   │   │   ├── EntityList.tsx      # Entity selection
│   │   │   ├── DataTable.tsx       # Record table
│   │   │   ├── DetailView.tsx      # Single record
│   │   │   ├── FormView.tsx        # Create/edit form
│   │   │   ├── SearchBar.tsx       # Search input
│   │   │   ├── Inspector.tsx       # Query inspector
│   │   │   └── StatusBar.tsx       # Footer status
│   │   ├── renderers/
│   │   │   ├── index.ts            # Field renderer registry
│   │   │   ├── text.ts             # Text-based renderers
│   │   │   ├── numeric.ts          # Number/money/percent
│   │   │   ├── temporal.ts         # Date/datetime
│   │   │   ├── visual.ts           # Badge/status/color
│   │   │   └── reference.ts        # Entity/user
│   │   ├── hooks/
│   │   │   ├── useNavigation.ts    # Navigation state
│   │   │   ├── useSearch.ts        # Search state
│   │   │   └── useTerminal.ts      # Terminal capabilities
│   │   └── utils/
│   │       ├── formatting.ts       # Reuse from frontend-patterns
│   │       └── terminal.ts         # Terminal detection
│   └── generated/                  # Generated by sync-patterns
│       ├── entities/               # Consumed by TUI
│       ├── schemas/                # Used for validation
│       └── config.ts               # Sync configuration
└── package.json
```

### 5.3 Integration Requirements

#### TR-3.1: Generated Code Integration
- Import entity hooks from `src/generated/entities/`
- Import Zod schemas from `src/generated/schemas/`
- Import sync config from `src/generated/config.ts`
- Handle both optimistic (TanStack DB) and confirmed (TanStack Query) hooks
- Gracefully handle missing or invalid generated code

#### TR-3.2: Frontend-Patterns Compatibility
- Reuse formatters from `frontend-patterns/src/atoms/utils/ui-mapping.tsx`
- Adapt React renderers to terminal output (remove JSX, use ANSI)
- Support same UIType enum (19 types)
- Use same `ColumnMetadata` interface

#### TR-3.3: Backend Communication
- Use generated API client for requests
- Support custom backend URL via `--api-url` flag or env var
- Handle authentication (JWT tokens) via env var or config file
- Support API versioning (accept different OpenAPI spec versions)

### 5.4 Performance Requirements

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Startup time** | < 2s | Time from command to first render |
| **Entity list load** | < 500ms | Time to fetch and render entity list |
| **Table render** | < 1s | 100 records with 10 columns |
| **Search response** | < 100ms | Filter 1000 records locally |
| **Page navigation** | < 50ms | Switch pages in table view |
| **Detail view load** | < 300ms | Fetch and render single record |
| **Memory usage** | < 100MB | RSS with 1000 cached records |

### 5.5 Error Handling

#### TR-5.1: Error Categories
- **Network errors**: Show retry button, gracefully degrade to cached data
- **Validation errors**: Show inline field errors, highlight problematic fields
- **TypeScript errors**: Show helpful message suggesting re-generation
- **API errors**: Display error message, HTTP status, and response body
- **Terminal errors**: Detect unsupported terminals, suggest alternatives

#### TR-5.2: Error Recovery
- Auto-retry transient errors (3 attempts with exponential backoff)
- Cache last successful response for offline fallback
- Support force-quit with double Ctrl+C
- Save current state before crash (navigation history, unsaved edits)

### 5.6 Configuration

#### TR-6.1: Config File
Location: `~/.sync-patterns/config.json`

```json
{
  "defaultApiUrl": "http://localhost:8000/api/v1",
  "defaultEntity": "contacts",
  "theme": "dark",
  "pageSize": 25,
  "savedFilters": {
    "activeContacts": "status:active",
    "recentOrders": "created_at>7d"
  },
  "customRenderers": {
    "priority": "priority-renderer.js"
  }
}
```

#### TR-6.2: Environment Variables
- `SYNC_PATTERNS_API_URL`: Backend API URL
- `SYNC_PATTERNS_AUTH_TOKEN`: JWT token for authentication
- `SYNC_PATTERNS_LOG_LEVEL`: debug/info/warn/error
- `SYNC_PATTERNS_THEME`: light/dark/auto

#### TR-6.3: CLI Flags
```bash
sync-patterns explore [options]

Options:
  --entity <name>        Start with specific entity
  --id <id>              Open specific record detail
  --api-url <url>        Backend API URL
  --mode <mode>          Force sync mode (optimistic|confirmed)
  --no-cache             Disable caching
  --generate             Regenerate code before exploring
  --config <path>        Custom config file path
  --theme <theme>        Color theme (light|dark|auto)
  --page-size <n>        Records per page (default: 25)
  --debug                Enable debug logging
  -h, --help             Show help
```

---

## 6. CLI Interface Design

### 6.1 Command Structure

```bash
# Basic usage
sync-patterns explore

# Explore specific entity
sync-patterns explore --entity contacts

# Open specific record
sync-patterns explore --entity contacts --id abc-123

# Regenerate and explore
sync-patterns explore --generate

# Custom API URL
sync-patterns explore --api-url https://api.example.com/v1

# Force mode
sync-patterns explore --mode confirmed

# Debug mode
sync-patterns explore --debug
```

### 6.2 Typical Workflows

#### Workflow 1: Framework Developer (Validate Generator Changes)
```bash
# 1. Make changes to sync-patterns generators
vim src/generators/schema-generator.ts

# 2. Rebuild CLI
npm run build

# 3. Regenerate code and explore
sync-patterns generate openapi.json --output demo/generated
cd demo
sync-patterns explore --generate

# 4. Browse entities, verify no TypeScript errors
# 5. Test field rendering for all UITypes
# 6. Check query inspector for API format
```

#### Workflow 2: App Developer (Explore Before Building)
```bash
# 1. Start backend
cd backend-patterns
make services-up
uvicorn main:app --reload

# 2. Generate sync-patterns code
cd ../my-app
sync-patterns generate http://localhost:8000/openapi.json

# 3. Explore entities
sync-patterns explore

# 4. Browse contacts entity
# Press 'c' for contacts
# Press '/' to search
# Type "example.com" to find all @example.com emails

# 5. View contact detail
# Press Enter on a row
# View all fields with proper formatting
# Press 'e' to edit (if Phase 2 implemented)
```

#### Workflow 3: DevOps (Production Incident)
```bash
# 1. SSH into production server
ssh prod-server

# 2. Navigate to app directory
cd /opt/my-app

# 3. Explore with production API
SYNC_PATTERNS_API_URL=http://localhost:8000/api/v1 \
SYNC_PATTERNS_AUTH_TOKEN=$(cat /run/secrets/api-token) \
sync-patterns explore

# 4. Navigate to orders entity
# Press 'o' for orders

# 5. Filter by stuck state
# Press '/' to search
# Type "state:pending"

# 6. Review stuck orders
# Identify common pattern
# Export to JSON for analysis
# Press 'x' to export
```

---

## 7. UI/UX Specifications

### 7.1 Screen Layouts

#### Layout 1: Entity List View

```
┌─────────────────────────────────────────────────────────────────┐
│ sync-patterns Explorer                                    ○ Confirmed │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Entities                                                      │
│                                                                 │
│ > Contacts                                             (142)   │
│   Orders                                               (89)    │
│   Products                                             (56)    │
│   Companies                                            (23)    │
│   Users                                                (12)    │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ↑/↓: Navigate  Enter: Select  q: Quit  ?: Help                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Layout 2: Table View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Contacts (142 total, 12 matches)                          [search: example] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Name              Email                    Status    Company      Updated   │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Alice Johnson     alice@example.com        ● Active  Acme Inc    2d ago    │
│ Bob Smith         bob@example.com          ● Active  TechCorp    5d ago    │
│ Carol Williams    carol@oldmail.com        ○ Inactive StartupCo  23d ago   │
│ David Brown       david@example.com        ● Active  Acme Inc    1d ago    │
│ Eve Davis         eve@example.com          ⚠ Pending  BigCo      3h ago    │
│                                                                             │
│ > Frank Miller    frank@example.com        ● Active  Acme Inc    12h ago   │
│                                                                             │
│ Grace Lee         grace@example.com        ● Active  TechCorp    1d ago    │
│ Henry Wilson      henry@example.com        ○ Inactive MegaCorp   45d ago   │
│ Ivy Martinez      ivy@example.com          ● Active  StartupCo   2d ago    │
│                                                                             │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Page 1 of 5  ↑/↓: Navigate  /: Search  Esc: Clear  Enter: Detail  q: Quit │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Layout 3: Detail View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Contact: Frank Miller                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ╭─ Basic Information ────────────────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  Name              Frank Miller                                        │ │
│ │  Email             frank@example.com                                   │ │
│ │  Phone             +1 (555) 123-4567                                   │ │
│ │  Status            ● Active                                            │ │
│ │  Type              Premium                                             │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
│ ╭─ Company Information ──────────────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  Company           🏢 Acme Inc                                         │ │
│ │  Position          Senior Engineer                                     │ │
│ │  Since             Jan 15, 2023                                        │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
│ ╭─ Metadata ─────────────────────────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  Created           Jan 10, 2023 2:30 PM                                │ │
│ │  Updated           12 hours ago                                        │ │
│ │  ID                abc-123-def-456                                     │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ b: Back  e: Edit  d: Delete  i: Inspector  q: Quit                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Layout 4: Form View (Create/Edit)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Create Contact                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ╭─ Basic Information (Required) ─────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  Name *            [Jane Doe________________________]                  │ │
│ │  Email *           [jane.doe@example.com____________]                  │ │
│ │  Phone             [+1 (555) ________________________]                 │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
│ ╭─ Additional Information ───────────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  Status            > Active         ▼                                  │ │
│ │                    │ Inactive                                           │ │
│ │                    │ Pending                                            │ │
│ │                                                                         │ │
│ │  Type              > Standard       ▼                                  │ │
│ │                                                                         │ │
│ │  Company           [Search companies...________________]               │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
│ ╭─ Validation Errors ────────────────────────────────────────────────────╮ │
│ │ ✗ Email: Must be a valid email address                                │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Tab: Next  Shift+Tab: Previous  Ctrl+S: Save  Esc: Cancel                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Layout 5: Query Inspector

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Query Inspector                                                   [Ctrl+I] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ╭─ Request ──────────────────────────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  GET /api/v1/contacts?page=1&limit=25&search=example                  │ │
│ │                                                                         │ │
│ │  Headers:                                                              │ │
│ │    Authorization: Bearer eyJhbGc...                                    │ │
│ │    Content-Type: application/json                                      │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
│ ╭─ Response ─────────────────────────────────────────────────────────────╮ │
│ │                                                                         │ │
│ │  Status: 200 OK                                                        │ │
│ │  Time: 145ms                                                           │ │
│ │                                                                         │ │
│ │  {                                                                     │ │
│ │    "data": [                                                           │ │
│ │      {                                                                 │ │
│ │        "id": "abc-123",                                                │ │
│ │        "name": "Frank Miller",                                         │ │
│ │        "email": "frank@example.com",                                   │ │
│ │        "status": "active"                                              │ │
│ │      },                                                                │ │
│ │      ...                                                               │ │
│ │    ],                                                                  │ │
│ │    "total": 142,                                                       │ │
│ │    "page": 1                                                           │ │
│ │  }                                                                     │ │
│ │                                                                         │ │
│ ╰─────────────────────────────────────────────────────────────────────────╯ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ c: Copy as curl  i: Close Inspector                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Keyboard Shortcuts Reference

#### Global Shortcuts
| Key | Action | Context |
|-----|--------|---------|
| `q` | Quit application | All views |
| `?` | Show help/shortcuts | All views |
| `Esc` | Cancel/back | All views |
| `i` | Toggle inspector | All views |
| `Ctrl+C` | Force quit | All views |

#### Navigation Shortcuts
| Key | Action | Context |
|-----|--------|---------|
| `↑/k` | Move up | List/table/detail |
| `↓/j` | Move down | List/table/detail |
| `←/h` | Move left/previous | Table/form |
| `→/l` | Move right/next | Table/form |
| `Enter` | Select/open | List/table |
| `b` | Back | Detail/form |
| `Home` | First item | List/table |
| `End` | Last item | List/table |
| `PgUp` | Previous page | Table |
| `PgDn` | Next page | Table |

#### Action Shortcuts
| Key | Action | Context |
|-----|--------|---------|
| `/` | Search | List/table |
| `f` | Filter | List/table |
| `n` | New record | List |
| `e` | Edit record | Detail |
| `d` | Delete record | Detail |
| `r` | Refresh | All views |
| `x` | Export | List/table/detail |
| `Space` | Select row | Table (multi-select) |
| `a` | Select all | Table |
| `Shift+A` | Deselect all | Table |

#### Form Shortcuts
| Key | Action | Context |
|-----|--------|---------|
| `Tab` | Next field | Form |
| `Shift+Tab` | Previous field | Form |
| `Ctrl+S` | Save | Form |
| `Esc` | Cancel | Form |

### 7.3 Color Scheme

#### Dark Theme (Default)
| Element | Color | ANSI Code | Use Case |
|---------|-------|-----------|----------|
| **Primary** | Blue | `\x1b[34m` | Selected row, active element |
| **Success** | Green | `\x1b[32m` | Active status, success messages |
| **Warning** | Yellow | `\x1b[33m` | Pending status, warnings |
| **Error** | Red | `\x1b[31m` | Error status, validation errors |
| **Info** | Cyan | `\x1b[36m` | Info status, metadata |
| **Neutral** | Gray | `\x1b[90m` | Inactive status, help text |
| **Text** | White | `\x1b[37m` | Default text |
| **Muted** | Dark Gray | `\x1b[90m` | Timestamps, IDs, secondary text |
| **Background** | Black | `\x1b[40m` | Default background |
| **Highlight** | Blue BG | `\x1b[44m` | Selected row background |

#### Light Theme
| Element | Color | ANSI Code | Use Case |
|---------|-------|-----------|----------|
| **Primary** | Blue | `\x1b[94m` | Bright blue for visibility |
| **Success** | Green | `\x1b[92m` | Bright green |
| **Warning** | Yellow | `\x1b[93m` | Bright yellow |
| **Error** | Red | `\x1b[91m` | Bright red |
| **Info** | Cyan | `\x1b[96m` | Bright cyan |
| **Neutral** | Gray | `\x1b[37m` | Light gray |
| **Text** | Black | `\x1b[30m` | Default text |
| **Muted** | Gray | `\x1b[90m` | Dark gray for contrast |
| **Background** | White | `\x1b[47m` | Default background |
| **Highlight** | Blue BG | `\x1b[104m` | Bright blue background |

### 7.4 Responsive Behavior

#### Narrow Terminal (< 80 columns)
- Switch to compact mode automatically
- Show only 3-4 most important columns
- Truncate cell content more aggressively
- Show field labels above values in detail view
- Hide group boxes, use simple spacing

#### Standard Terminal (80-120 columns)
- Show 5-7 columns in table view
- Use standard truncation (30 chars per cell)
- Show group boxes in detail view
- Display full keyboard shortcuts in footer

#### Wide Terminal (> 120 columns)
- Show all visible columns (up to 10)
- Less aggressive truncation (50 chars per cell)
- Side-by-side inspector panel (optional)
- Show extended help text in footer

#### Height Adaptation
- **< 20 lines**: Minimal UI, no help footer
- **20-40 lines**: Standard UI with help
- **> 40 lines**: Show more context (breadcrumbs, extended help)

---

## 8. Architecture

### 8.1 Component Hierarchy

```
<App>
├── <Navigation>                      # Route state management
│   ├── <EntityList>                  # Phase 1
│   ├── <DataTable>                   # Phase 1
│   ├── <DetailView>                  # Phase 1
│   ├── <FormView>                    # Phase 2
│   └── <Inspector>                   # Phase 3
├── <Header>                          # App title, sync mode indicator
├── <StatusBar>                       # Footer with shortcuts
└── <ErrorBoundary>                   # Global error handler
```

### 8.2 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      TUI Components                         │
│  (EntityList, DataTable, DetailView, FormView)             │
└──────────────────┬──────────────────────────────────────────┘
                   │ Uses hooks
                   ▼
┌─────────────────────────────────────────────────────────────┐
│               Generated Entity Wrappers                     │
│        (useContacts, useCreateContact, etc.)                │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴─────────────┐
        │                        │
        ▼                        ▼
┌──────────────────┐    ┌────────────────────┐
│  TanStack DB     │    │  TanStack Query    │
│  Collections     │    │  Hooks             │
│  (optimistic)    │    │  (confirmed)       │
└────────┬─────────┘    └─────────┬──────────┘
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Generated API Client                     │
│                    (axios-based)                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Pattern Stack Backend API                      │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 Field Rendering Flow

```
1. Component receives data with ColumnMetadata
   └─> { field: "price", type: "money", format: { currency: "USD" } }

2. Renderer registry selects renderer by UIType
   └─> renderers['money']

3. Renderer formats value using frontend-patterns logic
   └─> formatMoney(29.99, "USD") → "$29.99"

4. Renderer applies terminal formatting
   └─> chalk.bold.green("$29.99")

5. Ink renders to terminal
   └─> ANSI escape codes → terminal display
```

### 8.4 Sync Mode Abstraction

```typescript
// Generated entity wrapper (src/generated/entities/contacts.ts)
import { config } from '../config'
import { useContactsCollection } from '../collections/contacts'
import { useContactsQuery } from '../hooks/queries'

export function useContacts() {
  const isOptimistic = config.entities.contacts?.local_first ?? false

  if (isOptimistic) {
    // Use TanStack DB collection (optimistic)
    return useContactsCollection()
  } else {
    // Use TanStack Query hook (confirmed)
    return useContactsQuery()
  }
}

// TUI component (agnostic to sync mode)
function ContactList() {
  const { data, isLoading } = useContacts()  // Works for both modes!

  return <DataTable data={data} loading={isLoading} />
}
```

### 8.5 Integration with sync-patterns

```
┌───────────────────────────────────────────────────────────────┐
│                    OpenAPI Spec                               │
│              (with x-sync extensions)                         │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────────┐
│               sync-patterns generate                          │
│  (reads spec, emits TypeScript code)                          │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────────┐
│                src/generated/                                 │
│  ├── entities/          ← TUI imports these                   │
│  ├── schemas/           ← Used for form validation            │
│  └── config.ts          ← Sync mode configuration             │
└─────────────────────┬─────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────────┐
│              sync-patterns explore                            │
│         (TUI consumes generated code)                         │
└───────────────────────────────────────────────────────────────┘
```

**Key Integration Points:**

1. **Generation Phase** (`sync-patterns generate`)
   - Parses OpenAPI spec
   - Generates entity hooks, schemas, config
   - Outputs to `src/generated/`

2. **Exploration Phase** (`sync-patterns explore`)
   - Imports generated code dynamically
   - Reads `src/generated/config.ts` for sync modes
   - Uses entity hooks for data access
   - Validates with Zod schemas from `src/generated/schemas/`

3. **Optional Re-generation** (`sync-patterns explore --generate`)
   - Fetches latest OpenAPI spec from backend
   - Regenerates code
   - Restarts TUI with new code

---

## 9. Success Metrics

### 9.1 Developer Velocity Metrics

| Metric | Baseline (Before) | Target (After) | Measurement Method |
|--------|-------------------|----------------|-------------------|
| **Validation cycle time** | 5-10 min | 10-30 sec | Time from code change to validation |
| **Generator iteration speed** | 3-5 iterations/hour | 20-30 iterations/hour | Developer self-report |
| **Bug discovery time** | Post-integration | Pre-integration | When bugs are found in pipeline |
| **Context switches** | 5-10 per validation | 1-2 per validation | Terminal window count |

### 9.2 Adoption Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Weekly active developers** | 80% of team | CLI usage analytics (opt-in) |
| **Average sessions per developer** | 5-10 per week | CLI usage analytics |
| **Session duration** | 3-8 minutes | CLI usage analytics |
| **Entities explored** | All entities explored at least once per week | CLI usage analytics |

### 9.3 Quality Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Type errors caught pre-integration** | 90% | Bug tracker analysis |
| **Field rendering bugs caught** | 95% | Bug tracker analysis |
| **Integration test failures** | Reduced by 50% | CI/CD metrics |
| **Frontend build failures** | Reduced by 70% | CI/CD metrics |

### 9.4 User Satisfaction Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Developer NPS** | > 8/10 | Quarterly survey |
| **"Would recommend" rate** | > 90% | Quarterly survey |
| **Support tickets related to validation** | Reduced by 80% | Support ticket analysis |
| **Time saved per week (self-reported)** | 2-4 hours | Quarterly survey |

### 9.5 Technical Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **CLI startup time** | < 2s | Automated performance tests |
| **Table render time (100 records)** | < 1s | Automated performance tests |
| **Memory usage** | < 100MB | Automated performance tests |
| **Crash rate** | < 1% of sessions | Error tracking (Sentry) |

---

## 10. Risks and Mitigations

### 10.1 Technical Risks

#### Risk 1: Terminal Compatibility Issues
**Severity**: High
**Probability**: Medium

**Description**: Not all terminals support the same features (colors, Unicode, links). TUI may render poorly or crash on unsupported terminals.

**Impact**:
- Poor user experience on Windows Command Prompt, older terminals
- Unicode symbols (●, ★, ✓) may render as boxes or question marks
- ANSI colors may not display or display incorrectly

**Mitigation**:
1. **Terminal capability detection**:
   - Use `supports-color` and `is-unicode-supported` packages
   - Detect terminal type and gracefully degrade features
   - Provide `--no-color` and `--no-unicode` flags

2. **Fallback rendering**:
   - Replace Unicode symbols with ASCII equivalents (● → *, ★ → *, ✓ → +)
   - Use text-only formatting when colors unavailable
   - Test on Windows Command Prompt, PowerShell, WSL, macOS Terminal, iTerm2, Linux terminals

3. **Documentation**:
   - Document supported terminals in README
   - Provide troubleshooting guide for rendering issues
   - Recommend modern terminals (Windows Terminal, iTerm2, Alacritty)

#### Risk 2: Performance with Large Datasets
**Severity**: Medium
**Probability**: Medium

**Description**: Rendering 1000+ records in terminal may be slow or cause memory issues.

**Impact**:
- TUI becomes sluggish or unresponsive
- High memory usage (> 500MB)
- Poor user experience with large entities

**Mitigation**:
1. **Pagination by default**:
   - Default page size: 25 records
   - Lazy load pages on demand
   - Cache rendered pages for fast back/forward navigation

2. **Virtual scrolling** (Phase 2):
   - Only render visible rows + small buffer
   - Use `ink-virtual-list` or custom implementation
   - Tested with 10,000+ records

3. **Performance monitoring**:
   - Add performance metrics to CLI (`--debug` mode)
   - Monitor render times and memory usage
   - Set performance budgets and alert on regression

#### Risk 3: TypeScript Import Errors
**Severity**: High
**Probability**: High

**Description**: TUI dynamically imports generated code. If code has TypeScript errors or missing dependencies, TUI crashes.

**Impact**:
- TUI fails to start
- Unhelpful error messages
- Developer frustration

**Mitigation**:
1. **Validation before import**:
   - Run `tsc --noEmit` on `src/generated/` before importing
   - Show clear error message if TypeScript errors found
   - Suggest re-running `sync-patterns generate`

2. **Graceful error handling**:
   - Wrap imports in try-catch
   - Display TypeScript error with file and line number
   - Provide actionable next steps ("Run: sync-patterns generate")

3. **Validation command**:
   - Add `sync-patterns validate` command to check generated code
   - Run automatically before `sync-patterns explore` (optional)

### 10.2 Adoption Risks

#### Risk 4: Low Developer Adoption
**Severity**: High
**Probability**: Medium

**Description**: Developers don't use TUI because they prefer familiar tools (Postman, browser DevTools) or don't see the value.

**Impact**:
- Low ROI on development effort
- Continued slow validation cycles
- Technical debt in validation workflows

**Mitigation**:
1. **Make it obviously better**:
   - Demonstrate 10x speed improvement in demos
   - Show side-by-side comparison (old vs new workflow)
   - Highlight unique features (field rendering validation, sync mode testing)

2. **Reduce friction**:
   - Zero configuration required
   - Works out-of-the-box after `sync-patterns generate`
   - Include in default developer setup docs

3. **Developer education**:
   - Create video tutorial (2-3 minutes)
   - Add to onboarding docs
   - Present at team meetings / demos

4. **Integrate into workflows**:
   - Suggest running after `sync-patterns generate` in CLI output
   - Add to CI/CD as validation step (read-only mode)
   - Include in `.github/CONTRIBUTING.md`

#### Risk 5: Feature Bloat
**Severity**: Medium
**Probability**: High

**Description**: TUI accumulates too many features, becomes complex and hard to maintain.

**Impact**:
- Bloated codebase
- Slow performance
- Confusing UX

**Mitigation**:
1. **Stick to core use case**:
   - Primary: Validate generated code
   - Secondary: Quick data exploration
   - Out of scope: Full admin panel, complex workflows

2. **Phased rollout**:
   - Phase 1: Read-only (MVP)
   - Phase 2: CRUD (if validated by usage)
   - Phase 3: Advanced features (only if Phase 2 successful)

3. **Feature gating**:
   - Advanced features behind flags (e.g., `--enable-bulk-ops`)
   - Measure usage before promoting to default
   - Deprecate unused features

### 10.3 Maintenance Risks

#### Risk 6: Divergence from frontend-patterns
**Severity**: Medium
**Probability**: Medium

**Description**: TUI field renderers diverge from frontend-patterns renderers, causing inconsistencies.

**Impact**:
- TUI shows different formatting than frontend
- Confusion and mistrust
- Double maintenance burden

**Mitigation**:
1. **Shared formatting logic**:
   - Extract formatters to shared package (`@pattern-stack/formatters`)
   - Import same logic in TUI and frontend-patterns
   - Only adapt output layer (JSX vs ANSI)

2. **Automated tests**:
   - Unit tests comparing TUI output to frontend output
   - Snapshot tests for field rendering
   - Fail CI if outputs diverge

3. **Documentation**:
   - Document which code is shared vs TUI-specific
   - Update both simultaneously when changing formatters

---

## 11. Implementation Phases

### 11.1 Phase 1: MVP (Read-Only Exploration)

**Goal**: Enable developers to validate generated code and explore entities without CRUD operations.

**Timeline**: 3-4 weeks
**Team Size**: 2 developers

#### Deliverables

1. **Core CLI Framework**
   - `sync-patterns explore` command
   - CLI argument parsing (Commander)
   - Config file support (`~/.sync-patterns/config.json`)
   - Environment variable support

2. **Basic TUI Components**
   - `<App>` - Root component with routing
   - `<EntityList>` - Scrollable entity list with counts
   - `<DataTable>` - Table view with pagination
   - `<DetailView>` - Single record detail view
   - `<Header>` - App title, sync mode indicator
   - `<StatusBar>` - Footer with keyboard shortcuts

3. **Field Rendering**
   - Terminal renderer registry for all 19 UITypes
   - Adapt formatters from frontend-patterns
   - ANSI color support with graceful degradation
   - Unicode symbol support with ASCII fallback

4. **Data Integration**
   - Import generated entity hooks
   - Support both optimistic and confirmed modes
   - Handle loading states and errors
   - Cache fetched data for fast navigation

5. **Navigation**
   - Arrow key navigation (up/down/left/right)
   - Enter to select, Esc to go back
   - Pagination (PgUp/PgDn, Home/End)
   - Quit with 'q'

6. **Search**
   - Text search with '/' key
   - Filter across all text fields
   - Highlight matches (if terminal supports)
   - Clear search with Esc

7. **Testing**
   - Unit tests for field renderers
   - Integration tests with mock generated code
   - Manual testing on 5+ terminals (Windows, macOS, Linux)

8. **Documentation**
   - README with installation and usage
   - Keyboard shortcuts reference
   - Troubleshooting guide for terminal issues

#### Success Criteria

- [ ] CLI starts in < 2 seconds
- [ ] All 19 UITypes render correctly in at least 3 terminals
- [ ] Can browse, search, and view details for all entities
- [ ] No crashes with valid generated code
- [ ] Clear error messages for invalid generated code
- [ ] 80%+ test coverage
- [ ] Positive feedback from 3+ early adopter developers

---

### 11.2 Phase 2: CRUD Operations

**Goal**: Enable full data management through the TUI for debugging and operations.

**Timeline**: 3-4 weeks
**Team Size**: 2 developers

**Prerequisites**: Phase 1 complete and validated by team usage

#### Deliverables

1. **Form Component**
   - `<FormView>` - Create/edit form
   - Dynamic field generation from Zod schemas
   - Input widgets by UIType (text, select, date, number, etc.)
   - Tab navigation between fields
   - Validation with inline error messages

2. **Create Operation**
   - Press 'n' on entity list to create record
   - Required field indicators
   - Default values from schema
   - Submit with Ctrl+S, cancel with Esc
   - Success/error messages

3. **Update Operation**
   - Press 'e' on detail view to edit record
   - Pre-populate form with current values
   - Show diff before submitting
   - Partial updates (only changed fields)
   - Handle optimistic vs confirmed mode

4. **Delete Operation**
   - Press 'd' on detail view to delete record
   - Confirmation dialog (type 'DELETE')
   - Show record summary in confirmation
   - Handle soft/hard delete
   - Success/error messages

5. **Sync Mode Handling**
   - Show sync status indicators (pending/synced/error)
   - Optimistic: immediate UI update + background sync
   - Confirmed: loading state + wait for server
   - Conflict resolution UI (if optimistic sync fails)

6. **Relationship Navigation**
   - Detect entity/user fields
   - Press Enter to navigate to related record
   - Breadcrumb trail (e.g., "Orders > #1234 > Customer")
   - Press 'b' to go back

7. **Testing**
   - Unit tests for form validation
   - Integration tests for CRUD operations
   - Test optimistic vs confirmed mode behavior
   - Manual testing with real backend

8. **Documentation**
   - CRUD usage guide
   - Sync mode explanation
   - Form field type mapping

#### Success Criteria

- [ ] Can create, update, delete records for all entities
- [ ] Zod validation works correctly for all field types
- [ ] Optimistic mode shows immediate updates + sync status
- [ ] Confirmed mode shows loading states + errors
- [ ] Relationship navigation works with 3+ levels deep
- [ ] No data corruption or loss
- [ ] 80%+ test coverage for CRUD logic
- [ ] Used by 50%+ of team within 2 weeks

---

### 11.3 Phase 3: Advanced Features

**Goal**: Add power-user features for complex workflows and debugging.

**Timeline**: 4-6 weeks
**Team Size**: 2 developers

**Prerequisites**: Phase 2 complete and heavily used by team

#### Deliverables

1. **Query Inspector**
   - Press 'i' to toggle inspector panel
   - Show HTTP request (method, URL, headers, body)
   - Show HTTP response (status, headers, body)
   - Pretty-print JSON with syntax highlighting
   - Copy request as curl command
   - Show TanStack Query cache status

2. **Bulk Operations**
   - Press Space to select/deselect rows
   - Press 'a' to select all
   - Show selection count in footer
   - Bulk delete with confirmation
   - Bulk update (single field) with form
   - Progress bar for bulk operations
   - Handle partial failures

3. **Export Data**
   - Press 'x' to open export dialog
   - Choose format: JSON, CSV, JSON Lines
   - Export current view (filtered) or all records
   - Choose export location
   - Show progress for large exports
   - Include metadata (timestamp, filters)

4. **Advanced Filtering**
   - Field filters: `field:value`, `field>value`, `field<value`
   - Multiple filters: `status:active type:premium`
   - Saved filters (name and reuse)
   - Filter presets in config file

5. **Performance Optimizations**
   - Virtual scrolling for 1000+ records
   - Incremental rendering
   - Background data prefetching
   - Aggressive caching

6. **Customization**
   - Custom field renderers (JavaScript plugins)
   - Theming (custom color schemes)
   - Configurable keyboard shortcuts
   - Per-entity config (default sort, filters)

7. **Testing**
   - Unit tests for all features
   - Integration tests with large datasets (1000+ records)
   - Performance benchmarks
   - Manual testing with power users

8. **Documentation**
   - Advanced features guide
   - Plugin development guide
   - Customization reference

#### Success Criteria

- [ ] Query inspector shows all request/response details
- [ ] Bulk operations work on 100+ records without issues
- [ ] Export generates valid JSON/CSV files
- [ ] Virtual scrolling handles 10,000+ records smoothly
- [ ] Custom renderers can be loaded from config
- [ ] Positive feedback from 5+ power users
- [ ] Used as primary admin tool by DevOps team

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| **Atomic Architecture** | Layered architecture pattern: Atoms → Features → Molecules → Organisms |
| **Backend-patterns** | Python/FastAPI framework implementing Pattern Stack |
| **ColumnMetadata** | Backend-provided metadata describing field properties (type, label, format, etc.) |
| **Confirmed Mode** | Sync mode where mutations wait for server confirmation before UI updates (`local_first: false`) |
| **ElectricSQL** | Postgres-to-client sync engine for real-time data synchronization |
| **Frontend-patterns** | React component library with Atomic Architecture and semantic components |
| **Ink** | React renderer for CLIs - write terminal UIs using React components |
| **local_first** | Backend configuration flag controlling sync mode (true = optimistic, false = confirmed) |
| **OpenAPI** | API specification format (YAML/JSON) describing REST APIs |
| **Optimistic Mode** | Sync mode where mutations update UI immediately, sync in background (`local_first: true`) |
| **Pattern** | Reusable model behavior (BasePattern, CatalogPattern, EventPattern, etc.) |
| **sync-patterns** | CLI that generates TypeScript clients from OpenAPI specs |
| **TanStack DB** | Client-side reactive database for optimistic mutations and offline data |
| **TanStack Query** | React library for server state management (data fetching, caching, mutations) |
| **TUI** | Terminal User Interface - text-based UI in a terminal |
| **UIType** | Canonical type for field rendering (19 types: text, money, date, status, etc.) |
| **Unified Wrapper** | Generated hook that abstracts optimistic vs confirmed mode |
| **Zod** | TypeScript-first schema validation library |

### 12.2 Related Documentation

#### Pattern Stack Documentation
- [Pattern Stack Workspace README](../../CLAUDE.md)
- [backend-patterns README](../../../backend-patterns/README.md)
- [frontend-patterns README](../../../frontend-patterns/README.md)

#### sync-patterns Documentation
- [sync-patterns PLAN](../../docs/PLAN.md)
- [TERMINOLOGY](../../docs/TERMINOLOGY.md) - Canonical sync terminology
- [SYNC-005 Frontend Integration](../../docs/specs/SYNC-005-frontend-patterns-integration.md)

#### Frontend-patterns Documentation
- [Domain-Driven UI](../../../frontend-patterns/docs/domain-driven-ui.md)
- [Sync Integration Guide](../../../frontend-patterns/docs/guides/SYNC_INTEGRATION.md)

#### Technical References
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [TanStack Query](https://tanstack.com/query/latest)
- [TanStack DB](https://tanstack.com/db/latest) (unreleased, experimental)
- [Commander.js](https://github.com/tj/commander.js)
- [Zod](https://zod.dev/)

### 12.3 Comparison with Alternatives

#### Why Not Postman?
| Consideration | Postman | TUI Explorer |
|---------------|---------|--------------|
| **Field rendering** | Raw JSON | UIType-aware formatting |
| **Validation** | Manual inspection | Automatic TypeScript/Zod validation |
| **Sync modes** | N/A | Tests optimistic vs confirmed |
| **Speed** | Setup per endpoint | Auto-configured from OpenAPI |
| **Local data** | API only | Can explore TanStack DB collections |
| **Workflow** | External tool | Integrated into dev workflow |

**Verdict**: Postman is great for API testing, but doesn't validate generated code or field rendering.

#### Why Not curl?
| Consideration | curl | TUI Explorer |
|---------------|------|--------------|
| **UX** | Command-line per request | Interactive browsing |
| **Formatting** | Raw JSON | Pretty-printed with field rendering |
| **Learning curve** | Steep (memorize endpoints) | Gentle (discoverable UI) |
| **Auth** | Manual headers | Auto-configured from env |
| **Relationships** | Manual ID lookups | Click-through navigation |

**Verdict**: curl is powerful but low-level. TUI provides better UX for exploration.

#### Why Not Database GUI (DBeaver, TablePlus)?
| Consideration | Database GUI | TUI Explorer |
|---------------|--------------|--------------|
| **Abstraction** | SQL schema | Business entities |
| **Field rendering** | Raw values | UIType-aware formatting |
| **Relationships** | Manual JOINs | Click-through navigation |
| **Validation** | Schema constraints only | Zod + business logic |
| **Permissions** | DB-level | API-level (respects RBAC) |
| **Portability** | Requires DB access | Works with API only |

**Verdict**: DB GUIs are great for schema work, but don't validate application-level logic.

#### Why Not Admin Panel (Django Admin, Retool)?
| Consideration | Admin Panel | TUI Explorer |
|---------------|-------------|--------------|
| **Build time** | Hours to days | Zero (auto-generated) |
| **Maintenance** | Manual updates | Auto-updates with OpenAPI |
| **Access** | Web browser required | Terminal only (SSH-friendly) |
| **Validation** | Application logic only | Also validates generated code |
| **Purpose** | Production admin | Development validation + admin |

**Verdict**: Admin panels are for production use. TUI is for development validation + ops.

#### Why Not Browser DevTools?
| Consideration | DevTools | TUI Explorer |
|---------------|----------|--------------|
| **Speed** | Requires frontend build | Instant (no build) |
| **Scope** | Tests frontend + sync | Tests sync-patterns only |
| **Context** | Full app | Entity-focused |
| **SSH** | Not possible | Works over SSH |
| **Memory** | 300-500MB (browser + app) | < 100MB |

**Verdict**: DevTools are essential for frontend debugging, but too heavy for sync-patterns validation.

---

## 13. Open Questions

**To be resolved before implementation:**

1. **Plugin System**: Should custom renderers be JavaScript files loaded at runtime, or TypeScript compiled in advance?
   - **Recommendation**: Start with TypeScript (safer), add JS runtime loading in Phase 3 if needed.

2. **Config Location**: Where should config file live? `~/.sync-patterns/config.json` (global) or `./.sync-patterns/config.json` (per-project)?
   - **Recommendation**: Support both, project-specific takes precedence.

3. **Entity Discovery**: Should TUI discover entities from TypeScript exports or from OpenAPI spec?
   - **Recommendation**: TypeScript exports (works offline, respects generated code).

4. **Authentication**: How should TUI handle JWT tokens for authenticated APIs?
   - **Recommendation**: Environment variable (`SYNC_PATTERNS_AUTH_TOKEN`) or config file (encrypted?).

5. **Offline Mode**: Should TUI work without backend connection (read from TanStack DB only)?
   - **Recommendation**: Yes for optimistic entities, no for confirmed (requires API).

6. **Multi-Backend**: Should TUI support multiple backend URLs (dev/staging/prod)?
   - **Recommendation**: Phase 3 feature, use config file to switch between environments.

---

**Document End**

*For questions or feedback, contact the Pattern Stack team or open an issue in the sync-patterns repository.*