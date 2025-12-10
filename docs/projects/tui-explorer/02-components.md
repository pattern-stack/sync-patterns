# TUI Explorer - Component Design

**Last Updated**: 2025-12-10
**Status**: Approved

---

## Component Library Ecosystem

### Dependencies

```json
{
  "dependencies": {
    "ink": "^5.0.1",
    "@inkjs/ui": "^2.0.0",
    "ink-table": "^3.1.0",
    "chalk": "^5.3.0"
  }
}
```

### Library Overview

| Library | Purpose | Components We Use |
|---------|---------|-------------------|
| **ink** | Core React for CLI | Box, Text, useInput, useApp, useFocus |
| **@inkjs/ui** | Official UI components | TextInput, Select, Spinner, Badge, Alert, ConfirmInput |
| **ink-table** | Table rendering | Table (base for DataTable) |
| **chalk** | ANSI colors | All field renderers |

---

## Component Mapping

### What We Get FREE from Libraries

| Our Need | Library Component | Package |
|----------|-------------------|---------|
| Text input | `<TextInput>` | @inkjs/ui |
| Password input | `<PasswordInput>` | @inkjs/ui |
| Search input | `<TextInput>` with filtering | @inkjs/ui |
| Select dropdown | `<Select>` | @inkjs/ui |
| Multi-select | `<MultiSelect>` | @inkjs/ui |
| Loading spinner | `<Spinner>` | @inkjs/ui |
| Progress bar | `<ProgressBar>` | @inkjs/ui |
| Status badges | `<Badge>` | @inkjs/ui |
| Alerts | `<Alert>` | @inkjs/ui |
| Status messages | `<StatusMessage>` | @inkjs/ui |
| Confirmation | `<ConfirmInput>` | @inkjs/ui |
| Basic table | `<Table>` | ink-table |
| Layout | `<Box>` | ink |
| Text styling | `<Text>` | ink |
| Keyboard | `useInput()` | ink |

### What We Build (Custom)

| Component | Lines | Why Custom |
|-----------|-------|------------|
| **EntityList.tsx** | ~50 | Simple list with our selection logic |
| **DataTable.tsx** | ~100 | Wrap ink-table + pagination + row selection |
| **DetailView.tsx** | ~80 | Grouped field display with our layout |
| **FormView.tsx** | ~150 | Compose ink-ui inputs with our validation |
| **Header.tsx** | ~30 | App header with sync indicator |
| **StatusBar.tsx** | ~40 | Context-sensitive shortcuts |
| **HelpOverlay.tsx** | ~60 | Keyboard reference modal |
| **Breadcrumb.tsx** | ~30 | Navigation trail |
| **renderers/index.ts** | ~200 | Terminal field formatting (our value-add) |

**Total Custom Code**: ~740 lines (down from ~1200 estimate)

---

## Component Specifications

### EntityList.tsx

**Purpose**: Scrollable list of available entities with selection

**Uses**: `Box`, `Text`, `useInput` from ink

```tsx
interface EntityListProps {
  entities: EntityInfo[]
  selected: number
  onSelect: (entity: EntityInfo) => void
  onBack: () => void
}
```

**Keyboard**:
- ↑/↓: Navigate
- Enter: Select entity
- q: Quit

**Display**:
```
Entities

> Accounts (47)                    ◐ Offline
  Contacts (142)                   ○ API
  Orders (89)                      ● Realtime
```

---

### DataTable.tsx

**Purpose**: Paginated table view with row selection

**Uses**: `Table` from ink-table (wrapped), `Box`, `Text`, `useInput`

```tsx
interface DataTableProps<T> {
  data: T[]
  columns: ColumnMetadata[]
  page: number
  pageSize: number
  selectedRow: number
  onRowSelect: (row: T) => void
  onPageChange: (page: number) => void
  onBack: () => void
  onSearch: () => void
}
```

**Keyboard**:
- ↑/↓: Navigate rows
- PgUp/PgDn: Change page
- Enter: Open detail view
- /: Search
- Esc: Back to entity list

**Display**:
```
Accounts (47 total)                              Page 1 of 2

Name              Status        Value         Close Date
────────────────────────────────────────────────────────────
> Acme Corp       ● closing     $150,000      Dec 20
  TechStart       ○ prospect    $25,000       Feb 01
  BigCo Inc       ● qualifying  $75,000       Jan 15
```

**Implementation Notes**:
- Wrap ink-table for base rendering
- Add row highlight (> indicator)
- Add pagination controls
- Limit to 5-6 visible columns (by ui_importance)
- Truncate long values with ellipsis

---

### DetailView.tsx

**Purpose**: Single record with all fields grouped by category

**Uses**: `Box`, `Text` from ink, `Badge` from @inkjs/ui

```tsx
interface DetailViewProps {
  record: Record<string, unknown>
  columns: ColumnMetadata[]
  entityName: string
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}
```

**Keyboard**:
- ↑/↓: Scroll fields
- b/Esc: Back to table
- e: Edit (Phase 2)
- d: Delete (Phase 2)

**Display**:
```
Account: Acme Corp

╭─ Identification ─────────────────────────────────────╮
│  Name              Acme Corp                         │
│  Reference         ACC-00123                         │
│  Status            ● closing                         │
╰──────────────────────────────────────────────────────╯

╭─ Financial ──────────────────────────────────────────╮
│  Deal Value        $150,000.00                       │
│  ACV               $45,000.00                        │
╰──────────────────────────────────────────────────────╯

╭─ Metadata ───────────────────────────────────────────╮
│  Created           Dec 1, 2024 9:30 AM               │
│  Updated           2 hours ago                       │
│  ID                abc-123-def-456                   │
╰──────────────────────────────────────────────────────╯
```

**Group Order**: identification, financial, sales_process, contact, classification, metadata

---

### FormView.tsx (Phase 2)

**Purpose**: Create/edit forms with validation

**Uses**: `TextInput`, `Select`, `ConfirmInput` from @inkjs/ui

```tsx
interface FormViewProps {
  schema: ZodSchema
  initialValues?: Record<string, unknown>
  columns: ColumnMetadata[]
  mode: 'create' | 'edit'
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}
```

**Keyboard**:
- Tab/Shift+Tab: Navigate fields
- Ctrl+S: Submit
- Esc: Cancel (confirm if dirty)

**Field Type Mapping**:

| UIType | ink-ui Component |
|--------|------------------|
| text, email, url, phone | `<TextInput>` |
| password | `<PasswordInput>` |
| number, money, percent | `<TextInput type="number">` |
| boolean | `<ConfirmInput>` (yes/no) |
| date, datetime | `<TextInput>` with validation |
| status, badge | `<Select>` with options |

---

### SearchBar.tsx

**Purpose**: Search input with filter syntax

**Uses**: `TextInput` from @inkjs/ui

```tsx
interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  placeholder?: string
}
```

**Display**:
```
Search: example.com_                    [Enter: Search | Esc: Cancel]
```

**Filter Syntax**:
- `term` - Search all text fields
- `field:value` - Exact field match
- `field:>value` - Greater than
- `field:!value` - Not equal

---

### Header.tsx

**Purpose**: App title, entity name, sync mode indicator

**Uses**: `Box`, `Text` from ink

```tsx
interface HeaderProps {
  entityName?: string
  recordCount?: number
  syncMode?: 'api' | 'realtime' | 'offline'
  apiUrl?: string
}
```

**Display**:
```
sync-patterns Explorer                                    ◐ Offline
accounts (47 records)                      http://localhost:8000
```

**Sync Mode Indicators**:
- `● Realtime` - Green, ElectricSQL
- `◐ Offline` - Yellow, IndexedDB
- `○ API` - Gray, TanStack Query

---

### StatusBar.tsx

**Purpose**: Context-sensitive keyboard shortcuts

**Uses**: `Box`, `Text` from ink

```tsx
interface StatusBarProps {
  view: 'entities' | 'table' | 'detail' | 'form' | 'search'
  page?: number
  totalPages?: number
  dirty?: boolean
}
```

**Display by View**:

| View | Status Bar |
|------|------------|
| entities | `↑↓: Navigate  Enter: Select  q: Quit  ?: Help` |
| table | `↑↓: Navigate  PgUp/Dn: Page  /: Search  Enter: Detail  Esc: Back` |
| detail | `b: Back  e: Edit  d: Delete  ?: Help` |
| form | `Tab: Next  Shift+Tab: Prev  Ctrl+S: Save  Esc: Cancel` |
| search | `Enter: Search  Esc: Cancel` |

---

### HelpOverlay.tsx

**Purpose**: Full keyboard shortcut reference

**Uses**: `Box`, `Text` from ink

**Triggered by**: `?` key from any view

**Display**:
```
╭─ Keyboard Shortcuts ─────────────────────────────────╮
│                                                      │
│  Navigation                                          │
│  ↑/↓         Move up/down                           │
│  PgUp/PgDn   Previous/next page                     │
│  Enter       Select / open                          │
│  Esc         Back / cancel                          │
│  b           Back (in detail view)                  │
│                                                      │
│  Actions                                             │
│  /           Search                                  │
│  n           New record                             │
│  e           Edit record                            │
│  d           Delete record                          │
│  i           Toggle inspector                       │
│                                                      │
│  General                                             │
│  q           Quit                                    │
│  ?           Show this help                         │
│                                                      │
│              Press any key to close                  │
╰──────────────────────────────────────────────────────╯
```

---

### Breadcrumb.tsx

**Purpose**: Navigation trail for relationship navigation

**Uses**: `Box`, `Text` from ink

```tsx
interface BreadcrumbProps {
  path: { label: string; entity: string; id?: string }[]
  onNavigate: (index: number) => void
}
```

**Display**:
```
Accounts > Acme Corp > Contacts > John Doe
```

---

## Field Renderers

**Location**: `src/tui/renderers/index.ts`

### Renderer Interface

```typescript
import chalk from 'chalk'
import type { UIType, FieldFormat } from '@pattern-stack/frontend-patterns'

type TerminalRenderer = (
  value: unknown,
  format?: FieldFormat
) => string

export const terminalRenderers: Record<UIType, TerminalRenderer>
```

### Renderer Implementations

| UIType | Output Example | Implementation |
|--------|----------------|----------------|
| text | `Hello World` | `String(value)` |
| password | `●●●●●●●●` | `'●'.repeat(8)` |
| number | `1,234` | `formatNumber(value) ` |
| money | `$1,234.56` | `chalk.green(formatMoney(value))` |
| percent | `45.0%` | `formatPercent(value)` |
| date | `Dec 10, 2024` | `chalk.gray(formatDate(value))` |
| datetime | `Dec 10, 2024 2:30 PM` | `chalk.gray(formatDate(value, true))` |
| email | `user@example.com` | `chalk.cyan(value)` |
| url | `example.com` | `chalk.cyan(extractDomain(value))` |
| phone | `+1 (555) 123-4567` | `chalk.cyan(value)` |
| boolean | `✓` / `✗` | `value ? chalk.green('✓') : chalk.red('✗')` |
| badge | `Premium` | `chalk.bgBlue.white(` ${value} `)` |
| status | `● Active` | `chalk[statusColor](● ${value})` |
| entity | `🏢 Acme` | `chalk.bold(value)` |
| user | `👤 John` | `value` |
| json | `{"k":"v"}` | Syntax highlighted JSON |
| image | `[image.png]` | `chalk.dim([${filename}])` |
| rating | `★★★★☆` | `'★'.repeat(n) + '☆'.repeat(max-n)` |
| color | `■ #FF5733` | `chalk.hex(value)('■') + ' ' + value` |
| file | `📄 doc.pdf` | `📄 ${filename}` |

### Status Color Mapping

```typescript
const statusColors: Record<string, keyof typeof chalk> = {
  // Success (green)
  active: 'green',
  completed: 'green',
  approved: 'green',
  closed_won: 'green',

  // Warning (yellow)
  pending: 'yellow',
  processing: 'yellow',
  qualifying: 'yellow',
  presenting: 'yellow',

  // Error (red)
  failed: 'red',
  rejected: 'red',
  closed_lost: 'red',

  // Info (cyan)
  prospect: 'cyan',

  // Neutral (gray)
  inactive: 'gray',
  archived: 'gray',
}
```

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-10 | Initial component design | Claude |
| 2025-12-10 | Added ink-ui library mapping | Claude |
