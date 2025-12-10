/**
 * DetailView Component
 *
 * Displays a single record with all fields organized by metadata groups:
 * - Vertical layout with label: value pairs
 * - Fields grouped by ui_group (identification, financial, etc.)
 * - Boxed sections with group headers
 * - Field-aware rendering using UIType renderers
 * - Keyboard navigation (↑/↓ scroll, b/Esc back, e edit, d delete)
 * - Metadata section (created_at, updated_at, id)
 */

import { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'
import { renderField, type UIType, type FieldFormat } from '../renderers/index.js'

/**
 * Field definition
 */
export interface DetailField {
  /** Field key in the data object */
  key: string
  /** Display label */
  label: string
  /** UIType for rendering */
  uiType?: UIType
  /** Format options */
  format?: FieldFormat
  /** Group this field belongs to */
  uiGroup?: string
  /** Field importance/order within group */
  importance?: number
}

/**
 * DetailView props
 */
export interface DetailViewProps {
  /** Record data to display */
  data: Record<string, unknown>
  /** Field definitions (if not provided, inferred from data) */
  fields?: DetailField[]
  /** Record title (shown in header) */
  title?: string
  /** Entity name (for header) */
  entityName?: string
  /** Loading state */
  loading?: boolean
  /** Error state */
  error?: Error | null
  /** Callback when back is pressed (b or Esc) */
  onBack?: () => void
  /** Callback when edit is pressed (e) */
  onEdit?: () => void
  /** Callback when delete is pressed (d) */
  onDelete?: () => void
}

/**
 * Group order (controls display order of groups)
 */
const GROUP_ORDER = [
  'identification',
  'basic',
  'contact',
  'financial',
  'sales_process',
  'general',
  'metadata',
]

/**
 * Metadata field keys (shown in separate metadata section)
 */
const METADATA_KEYS = ['id', 'created_at', 'updated_at', 'created_by', 'updated_by']

/**
 * DetailView component
 */
export default function DetailView({
  data,
  fields: providedFields,
  title,
  entityName = 'Record',
  loading = false,
  error = null,
  onBack,
  onEdit,
  onDelete,
}: DetailViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0)

  // Infer fields from data if not provided
  const fields = useMemo(() => {
    if (providedFields && providedFields.length > 0) {
      return providedFields
    }

    // Infer from data
    return Object.keys(data).map((key) => ({
      key,
      label: formatLabel(key),
      uiType: inferUIType(data[key]),
      uiGroup: METADATA_KEYS.includes(key) ? 'metadata' : 'general',
      importance: 0,
    }))
  }, [providedFields, data])

  // Separate fields into groups
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, DetailField[]>()

    for (const field of fields) {
      const group = field.uiGroup || 'general'
      if (!groups.has(group)) {
        groups.set(group, [])
      }
      groups.get(group)!.push(field)
    }

    // Sort fields within each group by importance
    for (const [, groupFields] of groups) {
      groupFields.sort((a, b) => (b.importance || 0) - (a.importance || 0))
    }

    // Sort groups by GROUP_ORDER
    const sortedGroups = new Map<string, DetailField[]>()
    for (const groupName of GROUP_ORDER) {
      if (groups.has(groupName)) {
        sortedGroups.set(groupName, groups.get(groupName)!)
        groups.delete(groupName)
      }
    }

    // Add remaining groups not in ORDER
    for (const [groupName, groupFields] of groups) {
      sortedGroups.set(groupName, groupFields)
    }

    return sortedGroups
  }, [fields])

  // Keyboard navigation
  useInput((input, key) => {
    if (loading) return

    // Scroll up
    if (key.upArrow) {
      setScrollOffset(Math.max(0, scrollOffset - 1))
    }

    // Scroll down
    if (key.downArrow) {
      const maxScroll = Math.max(0, fieldGroups.size * 5 - 10) // Rough estimate
      setScrollOffset(Math.min(maxScroll, scrollOffset + 1))
    }

    // Back (b or Esc)
    if ((input === 'b' && !key.meta && !key.ctrl) || key.escape) {
      if (onBack) {
        onBack()
      }
    }

    // Edit (e)
    if (input === 'e' && !key.meta && !key.ctrl) {
      if (onEdit) {
        onEdit()
      } else {
        // Show "coming soon" message for now
        console.log(chalk.yellow('Edit functionality coming soon (Issue 10)'))
      }
    }

    // Delete (d)
    if (input === 'd' && !key.meta && !key.ctrl) {
      if (onDelete) {
        onDelete()
      } else {
        // Show "coming soon" message for now
        console.log(chalk.yellow('Delete functionality coming soon (Issue 11)'))
      }
    }
  })

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="cyan">Loading {entityName}...</Text>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={2}>
        <Box marginBottom={1}>
          <Text color="red" bold>
            Error loading {entityName}
          </Text>
        </Box>
        <Text color="red">{error.message}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press b or Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  // Record title (use provided title or try to infer from name/title field)
  const recordTitle = title || (data.name as string) || (data.title as string) || `${entityName} Detail`

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text>
          <Text bold color="cyan">
            {entityName}:{' '}
          </Text>
          <Text>{recordTitle}</Text>
        </Text>
      </Box>

      {/* Content - Scrollable groups */}
      <Box flexDirection="column">
        {Array.from(fieldGroups.entries()).map(([groupName, groupFields]) => (
          <Box key={groupName} flexDirection="column" marginBottom={1}>
            {renderGroup(groupName, groupFields, data)}
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text dimColor>
          b: Back  •  e: Edit  •  d: Delete  •  q: Quit
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Render a field group with boxed section
 */
function renderGroup(groupName: string, groupFields: DetailField[], data: Record<string, unknown>) {
  const groupTitle = formatGroupTitle(groupName)

  // Calculate max label width for alignment
  const maxLabelWidth = Math.max(...groupFields.map((f) => f.label.length), 12)

  return (
    <Box flexDirection="column">
      {/* Group header with box drawing characters */}
      <Box>
        <Text dimColor>╭─ </Text>
        <Text bold>{groupTitle}</Text>
        <Text dimColor> {'─'.repeat(Math.max(0, 60 - groupTitle.length))}╮</Text>
      </Box>

      {/* Group fields */}
      <Box flexDirection="column">
        {groupFields.map((field) => {
          const value = data[field.key]
          const rendered = renderField(value, field.uiType || 'text', field.format)
          const label = field.label.padEnd(maxLabelWidth)

          return (
            <Box key={field.key}>
              <Text dimColor>│  </Text>
              <Text dimColor>{label}</Text>
              <Text>  {rendered}</Text>
            </Box>
          )
        })}
      </Box>

      {/* Group footer */}
      <Box>
        <Text dimColor>╰{'─'.repeat(68)}╯</Text>
      </Box>
    </Box>
  )
}

/**
 * Format group name as title
 */
function formatGroupTitle(groupName: string): string {
  const titleMap: Record<string, string> = {
    identification: 'Identification',
    basic: 'Basic Information',
    contact: 'Contact Information',
    financial: 'Financial',
    sales_process: 'Sales Process',
    general: 'General',
    metadata: 'Metadata',
  }

  return (
    titleMap[groupName] ||
    groupName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

/**
 * Format field key as label
 */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

/**
 * Infer UIType from value
 */
function inferUIType(value: unknown): UIType {
  if (value === null || value === undefined) return 'text'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    // Basic inference
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return 'email'
    if (/^https?:\/\//.test(value)) return 'url'
    if (/status|state/i.test(String(value))) return 'status'
  }
  if (typeof value === 'object' && value !== null) return 'json'
  return 'text'
}
