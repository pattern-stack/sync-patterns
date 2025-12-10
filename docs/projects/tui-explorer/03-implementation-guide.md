# TUI Explorer - Implementation Readiness Analysis

**Version**: 1.0
**Created**: 2025-12-10
**Purpose**: Immediate implementation guide for Phase 1 (Read-Only MVP)
**Target**: Get a working TUI in first 2 hours, full MVP in 3-4 weeks

---

## 1. What Already Exists (Reusable)

### ✅ Formatting Functions (frontend-patterns)

**Location**: `/Users/dug/pattern-stack-workspace/frontend-patterns/src/atoms/utils/ui-mapping.tsx`

**Can be reused as-is** (just need terminal adaptation):

```typescript
// Lines 31-110 - All formatting functions work without React
formatMoney(value, currency, decimals, locale)       // → "$29.99"
formatPercent(value, decimals, locale)               // → "45.0%"
formatNumber(value, decimals, locale)                // → "1,234.56"
formatDate(value, includeTime, locale)               // → "Jan 15, 2024"
```

**Adaptation needed**: Import these, replace JSX with ANSI:
```typescript
// Before (React):
<span className="font-mono">{formatMoney(29.99)}</span>

// After (Terminal):
chalk.bold.green(formatMoney(29.99))
```

### ✅ UIType Definitions (frontend-patterns)

**Location**: `/Users/dug/pattern-stack-workspace/frontend-patterns/src/atoms/types/ui-config.ts`

**Can be imported directly**:
```typescript
// All 19 UITypes are defined (lines 17-45)
export type UIType = "text" | "password" | "number" | "money" | ...
```

**Use for**: Type-safe renderer registry in TUI

### ✅ Default Renderer Logic (frontend-patterns)

**Location**: `/Users/dug/pattern-stack-workspace/frontend-patterns/src/atoms/utils/ui-mapping.tsx` (lines 179-407)

**Reusable patterns**:
- Status color mapping (lines 152-174) - copy for terminal colors
- Renderer selection logic (lines 421-432) - adapt for TUI
- Field format handling (lines 212-247) - import directly

### ✅ CLI Command Pattern (sync-patterns)

**Location**: `/Users/dug/pattern-stack-workspace/sync-patterns/src/cli/commands/generate.ts`

**Reusable structure**:
```typescript
// Lines 53-344 - Follow this pattern:
export async function exploreCommand(options: ExploreOptions): Promise<void> {
  try {
    console.log('sync-patterns explore')
    // Load generated code
    // Parse entity info
    // Launch TUI
  } catch (error) {
    console.error('❌ Exploration failed:')
    process.exit(1)
  }
}
```

### ✅ Entity Discovery Pattern (sync-patterns)

**Location**: `/Users/dug/pattern-stack-workspace/sync-patterns/src/generators/entity-generator.ts`

**Reusable logic**:
- `extractEntityName()` (lines 1469-1476) - parse entity from path
- `getSyncMode()` (lines 1481-1492) - detect optimistic vs confirmed
- `getEntityInfo()` (lines 118-181) - extract entity metadata

### ✅ Generated Code Examples (sales-patterns)

**Location**: `/Users/dug/pattern-stack-workspace/sales-patterns/application/frontend/src/generated/`

**Reference structure** (working example):
```
generated/
├── entities/
│   └── accounts.ts         # Lines 1-100: Perfect example of hook usage
├── schemas/
│   └── index.ts            # Type exports
├── hooks/
│   └── queries.ts          # TanStack Query hooks
└── config.ts               # Sync mode detection
```

**Key import pattern** (accounts.ts, lines 70-82):
```typescript
import { getSyncMode } from '../config'
import { useLiveQuery } from '@tanstack/react-db'
import * as hooks from '../hooks/index'
```

---

## 2. What Needs to Be Built (Gap Analysis)

### 🔨 Phase 1 Components (Must Build)

#### 2.1 Entity Discovery (NEW)
**File**: `src/tui/utils/entity-discovery.ts` (~80 lines)

**Purpose**: Parse `src/generated/entities/` to find available entities

**Imports**:
- `fs.promises` (Node.js built-in)
- `path` (Node.js built-in)

**Functions**:
```typescript
interface EntityInfo {
  name: string              // "accounts"
  displayName: string       // "Accounts"
  syncMode: 'api' | 'realtime' | 'offline'
  hasMetadata: boolean      // true if metadata endpoint exists
  operations: ('list' | 'get' | 'create' | 'update' | 'delete')[]
}

async function discoverEntities(generatedDir: string): Promise<EntityInfo[]>
// 1. Read generated/entities/ directory
// 2. Parse each .ts file to find exported hooks (regex: /export function use/)
// 3. Detect sync mode by checking imports (getSyncMode = realtime/offline, else api)
// 4. Return EntityInfo array
```

**Pattern**: Similar to entity-generator.ts `getEntityInfo()` but reads TypeScript files instead of OpenAPI

**Lines**: ~80 (30 for file reading, 30 for parsing, 20 for type mapping)

#### 2.2 Field Renderers (NEW)
**File**: `src/tui/renderers/index.ts` (~250 lines)

**Purpose**: Terminal equivalents of frontend field renderers

**Imports**:
```typescript
import chalk from 'chalk'
import { formatMoney, formatPercent, formatNumber, formatDate } from '@pattern-stack/frontend-patterns'
import type { UIType } from '@pattern-stack/frontend-patterns'
```

**Structure** (follow defaultFieldRenderers pattern):
```typescript
type TerminalRenderer = (value: unknown, format?: FieldFormat) => string

export const terminalRenderers: Record<UIType, TerminalRenderer> = {
  status: (value, format) => {
    const color = format?.statusColors?.[String(value)] ?? 'info'
    const colorMap = { success: 'green', warning: 'yellow', error: 'red', info: 'cyan' }
    return chalk[colorMap[color]](`● ${value}`)
  },
  money: (value, format) => chalk.bold.green(formatMoney(value, format?.currency)),
  date: (value, format) => chalk.gray(formatDate(value, false, format?.locale)),
  // ... 16 more
}
```

**Lines by renderer**:
- Status/badge: ~15 lines each (color mapping)
- Money/percent/number: ~5 lines each (reuse formatters)
- Date/datetime: ~5 lines each (reuse formatters)
- Boolean: ~3 lines (✓/✗ symbols)
- Email/url/phone: ~5 lines each (show as text, can't click in terminal)
- User/entity: ~10 lines each (initials + name)
- Json: ~10 lines (pretty-print with colors)
- Others: ~5 lines each

**Total**: ~250 lines (19 renderers × ~13 avg lines)

#### 2.3 Entity List View (NEW)
**File**: `src/tui/components/EntityList.tsx` (~100 lines)

**Purpose**: Ink component showing scrollable entity list

**Imports**:
```typescript
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { EntityInfo } from '../utils/entity-discovery'
```

**Component**:
```tsx
interface Props {
  entities: EntityInfo[]
  onSelect: (entity: EntityInfo) => void
}

export function EntityList({ entities, onSelect }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) setSelectedIndex(i => i - 1)
    if (key.downArrow && selectedIndex < entities.length - 1) setSelectedIndex(i => i + 1)
    if (key.return) onSelect(entities[selectedIndex])
  })

  return (
    <Box flexDirection="column">
      <Text bold>Entities</Text>
      {entities.map((entity, i) => (
        <Text key={entity.name} color={i === selectedIndex ? 'blue' : undefined}>
          {i === selectedIndex ? '> ' : '  '}{entity.displayName} ({entity.syncMode})
        </Text>
      ))}
    </Box>
  )
}
```

**Lines**: ~100 (50 for component logic, 30 for keyboard handling, 20 for rendering)

#### 2.4 Data Table View (NEW)
**File**: `src/tui/components/DataTable.tsx` (~200 lines)

**Purpose**: Ink component showing data in table format

**Imports**:
```typescript
import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { terminalRenderers } from '../renderers'
import type { ColumnMetadata } from '@pattern-stack/frontend-patterns'
```

**Component** (simplified):
```tsx
interface Props {
  data: unknown[]
  columns: ColumnMetadata[]
  onBack: () => void
}

export function DataTable({ data, columns, onBack }: Props) {
  const [selectedRow, setSelectedRow] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 25

  const visibleColumns = columns.filter(c => c.visible !== false).slice(0, 5) // Max 5 cols
  const pageData = data.slice(page * pageSize, (page + 1) * pageSize)

  useInput((input, key) => {
    // Up/down navigation, page up/down, ESC to go back
  })

  return (
    <Box flexDirection="column">
      <Text bold>{/* Column headers */}</Text>
      {pageData.map((row, i) => (
        <Box key={i}>
          {visibleColumns.map(col => (
            <Text key={col.field}>
              {terminalRenderers[col.type](row[col.field], col.format)}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
```

**Lines**: ~200 (80 for table logic, 60 for keyboard nav, 40 for pagination, 20 for rendering)

#### 2.5 Detail View (NEW)
**File**: `src/tui/components/DetailView.tsx` (~150 lines)

**Purpose**: Show single record with all fields

**Similar to DataTable** but vertical layout, grouped by metadata.group

**Lines**: ~150

#### 2.6 Main App (NEW)
**File**: `src/tui/App.tsx` (~100 lines)

**Purpose**: Root Ink component with routing state

```tsx
export function App({ generatedDir }: { generatedDir: string }) {
  const [entities, setEntities] = useState<EntityInfo[]>([])
  const [view, setView] = useState<'list' | 'table' | 'detail'>('list')
  const [selectedEntity, setSelectedEntity] = useState<EntityInfo | null>(null)

  useEffect(() => {
    discoverEntities(generatedDir).then(setEntities)
  }, [])

  switch (view) {
    case 'list': return <EntityList entities={entities} onSelect={...} />
    case 'table': return <DataTable ... />
    case 'detail': return <DetailView ... />
  }
}
```

**Lines**: ~100

#### 2.7 Explore Command (NEW)
**File**: `src/cli/commands/explore.ts` (~120 lines)

**Purpose**: CLI entry point

**Pattern**: Copy from generate.ts (lines 53-344), simplify

```typescript
export async function exploreCommand(options: ExploreOptions): Promise<void> {
  const generatedDir = join(process.cwd(), 'src/generated')

  // Validate generated dir exists
  if (!existsSync(generatedDir)) {
    console.error('No generated/ directory found. Run sync-patterns generate first.')
    process.exit(1)
  }

  // Launch Ink TUI
  const { render } = await import('ink')
  const { App } = await import('../../tui/App.js')

  render(<App generatedDir={generatedDir} />)
}
```

**Lines**: ~120 (30 validation, 40 CLI setup, 50 Ink launch)

---

## 3. File-by-File Implementation Plan

### Day 1 (2 hours) - Hello World TUI

```
[ ] Install dependencies
    npm install ink chalk --save
    npm install @types/node --save-dev

[ ] src/tui/App.tsx (~50 lines - simplified)
    - Hardcoded entity list (skip discovery)
    - Single entity view
    - Pattern: Basic Ink Box + Text components

[ ] src/tui/renderers/index.ts (~60 lines - 5 renderers only)
    - text, money, date, status, boolean
    - Import formatMoney, formatDate from frontend-patterns
    - Pattern: Follow defaultFieldRenderers structure

[ ] src/cli/commands/explore.ts (~80 lines)
    - Basic CLI arg parsing
    - Launch Ink TUI
    - Pattern: Copy from generate.ts lines 53-90

[ ] Test it works
    cd sync-patterns
    npm run build
    node dist/cli/index.js explore
```

**Expected output**: TUI showing hardcoded "Accounts (3)" list

### Week 1 (Days 2-5) - Core Components

```
[ ] src/tui/utils/entity-discovery.ts (~80 lines)
    - Import: fs.promises, path
    - Discover entities from src/generated/entities/
    - Pattern: Similar to entity-generator.ts getEntityInfo()

[ ] src/tui/components/EntityList.tsx (~100 lines)
    - Import: ink (Box, Text, useInput)
    - Arrow key navigation
    - Pattern: ink-select-input examples

[ ] src/tui/components/DataTable.tsx (~200 lines)
    - Import: ink, terminalRenderers
    - Table rendering with column truncation
    - Pagination (PgUp/PgDn)
    - Pattern: ink-table examples + frontend DataTable logic

[ ] Complete all 19 renderers in src/tui/renderers/index.ts
    - Remaining 14 UITypes
    - Reference: ui-mapping.tsx lines 179-407

[ ] Integration with generated hooks
    - Import hooks from src/generated/entities/
    - Use useAccounts(), useContacts(), etc.
    - Handle loading/error states
```

### Week 2 (Days 6-10) - Polish & Features

```
[ ] src/tui/components/DetailView.tsx (~150 lines)
    - Vertical field list
    - Grouped by metadata.group
    - Scrollable

[ ] Search functionality
    - "/" key to enter search mode
    - Filter data locally
    - Highlight matches

[ ] Error handling
    - Loading spinners (use ora)
    - Error boundaries
    - Network error recovery

[ ] Status bar component
    - Footer with keyboard shortcuts
    - Sync mode indicator
    - Pattern: ink status bars
```

### Week 3-4 (Days 11-20) - Testing & Deployment

```
[ ] Unit tests for renderers
    - Test each UIType renderer
    - Snapshot tests for formatted output

[ ] Integration tests
    - Mock generated hooks
    - Test navigation flows

[ ] Documentation
    - README with usage examples
    - Keyboard shortcuts reference
    - Troubleshooting guide

[ ] Terminal compatibility testing
    - macOS Terminal
    - iTerm2
    - Windows Terminal
    - WSL
    - Linux terminals

[ ] CLI integration
    - Add explore command to main CLI
    - Help text
    - Examples in README
```

---

## 4. Integration Points

### 4.1 TUI ↔ Generated Code

**Pattern** (from sales-patterns/generated/entities/accounts.ts):

```typescript
// TUI imports generated hooks directly
import { useAccounts, useAccount } from '@/generated/entities/accounts'
import type { AccountOwner } from '@/generated/schemas'

// In Ink component:
function AccountTable() {
  const { data, isLoading, error } = useAccounts()

  if (isLoading) return <Text>Loading...</Text>
  if (error) return <Text color="red">Error: {error.message}</Text>

  return <DataTable data={data} ... />
}
```

**Key**: Generated hooks work same in TUI as in React web app

### 4.2 TUI ↔ Frontend Formatters

**Adaptation needed**:

```typescript
// frontend-patterns/src/atoms/utils/ui-mapping.tsx (works as-is)
import { formatMoney, formatDate } from '@pattern-stack/frontend-patterns'

// TUI wrapper adds terminal formatting
export const terminalRenderers = {
  money: (value, format) => chalk.bold.green(formatMoney(value, format?.currency)),
  date: (value, format) => chalk.gray(formatDate(value, false, format?.locale)),
}
```

**No changes needed** to frontend-patterns - just import and wrap

### 4.3 CLI Integration

**Location**: `src/cli/index.ts` (add explore command)

```typescript
import { exploreCommand } from './commands/explore.js'

program
  .command('explore')
  .description('Explore entities with TUI')
  .option('--entity <name>', 'Start with specific entity')
  .option('--api-url <url>', 'Backend API URL')
  .action(exploreCommand)
```

### 4.4 Sync Mode Detection

**Use existing config** (from generated/config.ts):

```typescript
import { getSyncMode, isLocalFirst } from '@/generated/config'

// In TUI:
const mode = getSyncMode('accounts')  // 'api' | 'realtime' | 'offline'
const indicator = mode === 'realtime' ? '● Realtime' : '○ API'
```

---

## 5. Quick Start Commands

### Install Dependencies

```bash
cd /Users/dug/pattern-stack-workspace/sync-patterns

# Core TUI dependencies
npm install ink chalk ora boxen --save

# Type definitions
npm install @types/node --save-dev

# Already have these (no action needed):
# - @tanstack/react-query (used by generated hooks)
# - commander (CLI framework)
```

### Create File Structure

```bash
mkdir -p src/tui/components
mkdir -p src/tui/renderers
mkdir -p src/tui/utils

touch src/tui/App.tsx
touch src/tui/components/EntityList.tsx
touch src/tui/components/DataTable.tsx
touch src/tui/components/DetailView.tsx
touch src/tui/renderers/index.ts
touch src/tui/utils/entity-discovery.ts
touch src/cli/commands/explore.ts
```

### Build & Test

```bash
# Build CLI
npm run build

# Test with sales-patterns generated code
cd /Users/dug/pattern-stack-workspace/sales-patterns/application/frontend
sync-patterns explore

# Or specify entity
sync-patterns explore --entity accounts
```

---

## 6. First 2-Hour Sprint

### Goal
Working TUI that lists entities and shows hardcoded data

### File 1: `src/tui/App.tsx` (30 min)

```tsx
import React, { useState } from 'react'
import { Box, Text } from 'ink'

const MOCK_ENTITIES = [
  { name: 'accounts', displayName: 'Accounts', count: 47 },
  { name: 'contacts', displayName: 'Contacts', count: 142 },
]

export function App() {
  const [selectedIndex, setSelectedIndex] = useState(0)

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="blue">sync-patterns Explorer</Text>
      <Text> </Text>
      <Text>Entities:</Text>
      {MOCK_ENTITIES.map((entity, i) => (
        <Text key={entity.name}>
          {i === selectedIndex ? '> ' : '  '}{entity.displayName} ({entity.count})
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>↑/↓: Navigate  q: Quit</Text>
    </Box>
  )
}
```

### File 2: `src/cli/commands/explore.ts` (30 min)

```typescript
import React from 'react'
import { render } from 'ink'
import { App } from '../../tui/App.js'

export interface ExploreOptions {
  entity?: string
  apiUrl?: string
}

export async function exploreCommand(options: ExploreOptions): Promise<void> {
  console.log('sync-patterns explore')
  console.log('======================\n')

  render(React.createElement(App))
}
```

### File 3: Wire to CLI (20 min)

**Edit**: `src/cli/index.ts`

```typescript
import { exploreCommand } from './commands/explore.js'

program
  .command('explore')
  .description('Explore entities with TUI')
  .option('--entity <name>', 'Start with specific entity')
  .option('--api-url <url>', 'Backend API URL')
  .action(exploreCommand)
```

### File 4: Basic Renderers (30 min)

**Create**: `src/tui/renderers/index.ts`

```typescript
import chalk from 'chalk'

export const terminalRenderers = {
  text: (value: unknown) => String(value),
  money: (value: unknown) => chalk.bold.green(`$${Number(value).toFixed(2)}`),
  date: (value: unknown) => chalk.gray(new Date(String(value)).toLocaleDateString()),
  status: (value: unknown) => chalk.green(`● ${value}`),
  boolean: (value: unknown) => value ? '✓' : '✗',
}
```

### Test (10 min)

```bash
npm run build
node dist/cli/index.js explore
```

**Expected**: Terminal UI showing "Accounts (47)" and "Contacts (142)" with navigation hint

---

## 7. Dependencies Summary

### Must Install

```json
{
  "dependencies": {
    "ink": "^4.4.1",           // React for terminals
    "chalk": "^5.3.0",         // ANSI colors
    "ora": "^8.0.1",           // Loading spinners
    "boxen": "^7.1.1"          // Boxes around content
  },
  "devDependencies": {
    "@types/node": "^20.10.0"  // Node.js type definitions
  }
}
```

### Already Have (No Action)

```json
{
  "dependencies": {
    "commander": "^11.1.0",         // CLI framework (used by generate)
    "@tanstack/react-query": "^5.x" // Used by generated hooks
  }
}
```

### Import from Existing Packages

```typescript
// From frontend-patterns (already linked as dependency)
import { formatMoney, formatDate } from '@pattern-stack/frontend-patterns'
import type { UIType, ColumnMetadata } from '@pattern-stack/frontend-patterns'
```

---

## 8. Critical Path Items

### Must Have for Phase 1

1. ✅ **Ink TUI framework** - Core rendering
2. ✅ **Entity discovery** - Find available entities dynamically
3. ✅ **5 core renderers** - text, money, date, status, boolean
4. ✅ **EntityList component** - Browsable entity list
5. ✅ **DataTable component** - Show records in table
6. ✅ **Generated hook integration** - Import useAccounts() etc.
7. ✅ **Error handling** - Loading/error states

### Nice to Have for Phase 1

8. 🔵 All 19 renderers (14 remaining)
9. 🔵 Search functionality
10. 🔵 DetailView component
11. 🔵 Pagination controls
12. 🔵 Keyboard shortcuts help

### Deferred to Phase 2

- CRUD operations (create/update/delete)
- Form views
- Relationship navigation
- Bulk operations

---

## 9. Testing Strategy

### Unit Tests (Day 3-4)

**File**: `tests/tui/renderers.test.ts`

```typescript
import { terminalRenderers } from '../../src/tui/renderers'

describe('Terminal Renderers', () => {
  it('renders money with currency symbol', () => {
    expect(terminalRenderers.money(29.99)).toContain('$29.99')
  })

  it('renders status with color', () => {
    const result = terminalRenderers.status('active')
    expect(result).toContain('●')
    expect(result).toContain('active')
  })

  // ... 17 more tests
})
```

### Integration Tests (Week 2)

**File**: `tests/tui/navigation.test.tsx`

Mock generated hooks, test navigation flows

### Manual Testing (Ongoing)

Test matrix:
- ✅ macOS Terminal
- ✅ iTerm2
- ✅ Windows Terminal
- ✅ WSL
- ✅ Linux terminals (Ubuntu, Debian)

---

## 10. Success Criteria

### 2-Hour Milestone
- [ ] TUI launches without errors
- [ ] Shows hardcoded entity list
- [ ] Can navigate with arrow keys
- [ ] Renders 5 basic field types

### Week 1 Milestone
- [ ] Discovers entities from generated/
- [ ] Lists all entities with counts
- [ ] Shows data table for selected entity
- [ ] All 19 UITypes render correctly
- [ ] Pagination works (PgUp/PgDn)

### Phase 1 Complete (Week 3-4)
- [ ] Entity list, table, and detail views work
- [ ] Search filters data locally
- [ ] Supports both optimistic and confirmed modes
- [ ] Error handling with retries
- [ ] Works on 5+ terminal types
- [ ] Documentation complete
- [ ] 80%+ test coverage

---

## 11. Reference Architecture

### TUI Component Hierarchy

```
<App generatedDir="...">
  └─ <Navigation>
      ├─ <EntityList entities={...} onSelect={...} />
      ├─ <DataTable data={...} columns={...} onBack={...} />
      └─ <DetailView record={...} columns={...} onBack={...} />
```

### Data Flow

```
CLI Command
  ↓
Discover Entities (entity-discovery.ts)
  ↓
Load Entity Hook (import from generated/entities/)
  ↓
Fetch Data (useAccounts, useContacts, etc.)
  ↓
Render Table (DataTable.tsx)
  ↓
Apply Renderers (terminalRenderers[col.type])
  ↓
Output ANSI (chalk colors)
  ↓
Terminal Display
```

---

## 12. Key Design Decisions

### Why Ink?
- React-based (familiar mental model)
- Component composition
- Built-in state management
- Keyboard input handling
- Active community

### Why Reuse Frontend Formatters?
- Consistent rendering across web + TUI
- Battle-tested logic
- Single source of truth
- Only adapt output layer (JSX → ANSI)

### Why Terminal Renderers?
- Can't render React components in terminal
- Need ANSI color codes instead of CSS
- Different interaction model (keyboard only)
- Terminal width constraints

### Why Generated Code Integration?
- Zero duplication
- Automatically sync with backend changes
- Same hooks in TUI as web app
- Type safety from OpenAPI spec

---

## 13. Anti-Patterns to Avoid

### ❌ DON'T: Duplicate Formatting Logic
```typescript
// BAD
function formatMoneyInTUI(value: number) {
  return `$${value.toFixed(2)}`  // Duplicates frontend logic
}

// GOOD
import { formatMoney } from '@pattern-stack/frontend-patterns'
const formatted = chalk.green(formatMoney(value))
```

### ❌ DON'T: Hardcode Entity Names
```typescript
// BAD
const entities = ['accounts', 'contacts', 'orders']

// GOOD
const entities = await discoverEntities('src/generated/entities')
```

### ❌ DON'T: Create Custom Hooks
```typescript
// BAD
async function fetchAccounts() { ... }

// GOOD
import { useAccounts } from '@/generated/entities/accounts'
const { data } = useAccounts()
```

### ❌ DON'T: Reinvent Field Rendering
```typescript
// BAD
if (col.type === 'money') return `$${value}`
if (col.type === 'date') return new Date(value).toString()

// GOOD
return terminalRenderers[col.type](value, col.format)
```

---

## 14. Next Steps After Phase 1

### Phase 2: CRUD Operations (Weeks 5-8)
- Form component (with Zod validation)
- Create/update/delete operations
- Diff view before save
- Optimistic vs confirmed handling

### Phase 3: Advanced Features (Weeks 9-12)
- Query inspector (show API requests)
- Bulk operations (select multiple)
- Export to JSON/CSV
- Saved filters
- Custom renderers via config

---

**READY TO START**: All infrastructure exists, clear path to MVP in 2 hours

**File Count**: 7 new files for hello world, 14 files total for Phase 1

**Lines of Code**: ~1,200 total (excluding tests and docs)

**Time Estimate**: 2 hours (hello world) → 3-4 weeks (full Phase 1)
