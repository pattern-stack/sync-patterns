/**
 * DetailView Component
 *
 * Displays a single record with all fields organized by metadata groups:
 * - Vertical layout with label: value pairs
 * - Fields grouped by ui_group (identification, financial, etc.)
 * - Boxed sections with group headers
 * - Field-aware rendering using UIType renderers
 * - Keyboard navigation (↑/↓ scroll, b/Esc back, e edit, d delete, Enter on linked records)
 * - Metadata section (created_at, updated_at, id)
 * - Linked record display for foreign keys
 */

import { useState, useMemo, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { renderField, type UIType, type FieldFormat } from '../renderers/index.js'
import EditModal, { type EditField } from './EditModal.js'
import { detectForeignKey } from '../hooks/useLinkedRecord.js'
import { useTheme } from './ThemeProvider.js'

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
  /** Record ID (required for edit) */
  recordId?: string
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
  /** Callback when record is updated */
  onUpdate?: (updatedData: Record<string, unknown>) => void
  /** Callback when navigating to a linked record (Enter on foreign key field) */
  onNavigateToLinkedRecord?: (entityType: string, recordId: string) => void
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
  recordId,
  loading = false,
  error = null,
  onBack,
  onEdit,
  onDelete,
  onUpdate,
  onNavigateToLinkedRecord,
}: DetailViewProps) {
  const theme = useTheme()
  const [scrollOffset, setScrollOffset] = useState(0)
  const [showEditModal, setShowEditModal] = useState(false)
  const [currentData, setCurrentData] = useState(data)
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0)

  // Sync currentData with data prop changes
  // This is needed because useState only uses initial value on mount,
  // so prop updates wouldn't otherwise update currentData
  useEffect(() => {
    setCurrentData(data)
  }, [data])

  // Infer fields from data if not provided
  const fields = useMemo(() => {
    if (providedFields && providedFields.length > 0) {
      return providedFields
    }

    // Infer from currentData
    return Object.keys(currentData).map((key) => ({
      key,
      label: formatLabel(key),
      uiType: inferUIType(currentData[key]),
      uiGroup: METADATA_KEYS.includes(key) ? 'metadata' : 'general',
      importance: 0,
    }))
  }, [providedFields, currentData])

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

  // Create flat list of all fields for navigation
  const allFields = useMemo(() => {
    const flat: DetailField[] = []
    for (const groupFields of fieldGroups.values()) {
      flat.push(...groupFields)
    }
    return flat
  }, [fieldGroups])

  // Keyboard navigation
  useInput((input, key) => {
    // Don't handle input when modal is open
    if (showEditModal) return

    if (loading) return

    // Navigate between fields (up/down arrows)
    if (key.upArrow) {
      setSelectedFieldIndex((prev) => Math.max(0, prev - 1))
    }

    if (key.downArrow) {
      setSelectedFieldIndex((prev) => Math.min(allFields.length - 1, prev + 1))
    }

    // Navigate to linked record (Enter on foreign key field)
    if (key.return && onNavigateToLinkedRecord) {
      const selectedField = allFields[selectedFieldIndex]
      if (selectedField) {
        const fieldValue = currentData[selectedField.key]

        // Check if this is a foreign key field
        const foreignEntityType = detectForeignKey(selectedField.key)

        if (foreignEntityType && typeof fieldValue === 'string') {
          onNavigateToLinkedRecord(foreignEntityType, fieldValue)
        } else if (selectedField.uiType === 'entity' && typeof fieldValue === 'string') {
          // Also support explicit entity UIType
          // Try to infer entity type from field name
          const entityType = detectForeignKey(selectedField.key)
          if (entityType) {
            onNavigateToLinkedRecord(entityType, fieldValue)
          }
        }
      }
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
        // Open edit modal if recordId is available
        if (recordId) {
          setShowEditModal(true)
        }
      }
    }

    // Delete (d)
    if (input === 'd' && !key.meta && !key.ctrl) {
      if (onDelete) {
        onDelete()
      }
    }
  }, [loading, showEditModal, selectedFieldIndex, allFields, currentData, onNavigateToLinkedRecord, onBack, onEdit, onDelete, recordId])

  // Loading state
  if (loading) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text>{theme.info(`Loading ${entityName}...`)}</Text>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={2}>
        <Box marginBottom={1}>
          <Text bold>{theme.error(`Error loading ${entityName}`)}</Text>
        </Box>
        <Text>{theme.error(error.message)}</Text>
        <Box marginTop={1}>
          <Text>{theme.mutedForeground('Press b or Esc to go back')}</Text>
        </Box>
      </Box>
    )
  }

  // Convert fields to EditFields format
  const editFields: EditField[] = fields.map((field) => ({
    key: field.key,
    label: field.label,
    uiType: field.uiType,
    format: field.format,
    required: false, // Could be derived from field metadata in the future
    readOnly: METADATA_KEYS.includes(field.key),
  }))

  // Handle successful edit
  const handleEditSuccess = (updatedData: Record<string, unknown>) => {
    setCurrentData(updatedData)
    setShowEditModal(false)
    if (onUpdate) {
      onUpdate(updatedData)
    }
  }

  // Record title (use provided title or try to infer from name/title field)
  const recordTitle =
    title || (currentData.name as string) || (currentData.title as string) || `${entityName} Detail`

  return (
    <Box flexDirection="column">
      {/* Show edit modal if open */}
      {showEditModal && recordId && (
        <EditModal
          data={currentData}
          fields={editFields}
          entityName={entityName}
          recordId={recordId}
          onSuccess={handleEditSuccess}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {/* Only show detail view when modal is not open */}
      {!showEditModal && (
        <>
          {/* Header */}
          <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
            <Text>
              <Text bold>{theme.primary(`${entityName}: `)}</Text>
              <Text>{theme.foreground(recordTitle)}</Text>
            </Text>
          </Box>

          {/* Content - Scrollable groups */}
          <Box flexDirection="column">
            {Array.from(fieldGroups.entries()).map(([groupName, groupFields]) => (
              <Box key={groupName} flexDirection="column" marginBottom={1}>
                {renderGroup(groupName, groupFields, currentData, theme)}
              </Box>
            ))}
          </Box>

          {/* Footer */}
          <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
            <Text>{theme.mutedForeground('b: Back  •  e: Edit  •  d: Delete  •  q: Quit')}</Text>
          </Box>
        </>
      )}
    </Box>
  )
}

/**
 * Render a field group with boxed section
 */
function renderGroup(groupName: string, groupFields: DetailField[], data: Record<string, unknown>, theme: ReturnType<typeof useTheme>) {
  const groupTitle = formatGroupTitle(groupName)

  // Calculate max label width for alignment
  const maxLabelWidth = Math.max(...groupFields.map((f) => f.label.length), 12)

  return (
    <Box flexDirection="column">
      {/* Group header with box drawing characters */}
      <Box>
        <Text>{theme.border('╭─ ')}</Text>
        <Text bold>{theme.primary(groupTitle)}</Text>
        <Text>{theme.border(` ${'─'.repeat(Math.max(0, 60 - groupTitle.length))}╮`)}</Text>
      </Box>

      {/* Group fields */}
      <Box flexDirection="column">
        {groupFields.map((field) => {
          const value = data[field.key]
          const rendered = renderField(value, field.uiType || 'text', field.format)
          const label = field.label.padEnd(maxLabelWidth)

          return (
            <Box key={field.key}>
              <Text>{theme.border('│  ')}</Text>
              <Text>{theme.muted(label)}</Text>
              <Text>  {rendered}</Text>
            </Box>
          )
        })}
      </Box>

      {/* Group footer */}
      <Box>
        <Text>{theme.border(`╰${'─'.repeat(68)}╯`)}</Text>
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
