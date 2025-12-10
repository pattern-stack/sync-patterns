/**
 * DataTable Component
 *
 * Displays entity records in a tabular format with:
 * - Column headers with field names
 * - Field-aware rendering using UIType renderers
 * - Smart column width calculation
 * - Pagination controls
 * - Keyboard navigation
 * - Loading and error states
 */

import { useState, useMemo, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'
import { renderField, type UIType, type FieldFormat } from '../renderers/index.js'
import { useSearch, type SearchableField } from '../hooks/useSearch.js'
import SearchBar from './SearchBar.js'

/**
 * Column definition
 */
export interface Column {
  /** Field key in the data object */
  key: string
  /** Display label for column header */
  label: string
  /** UIType for rendering (optional, defaults to 'text') */
  uiType?: UIType
  /** Format options for the renderer */
  format?: FieldFormat
  /** Column width (optional, auto-calculated if not provided) */
  width?: number
  /** Column importance (higher = more important, shown first) */
  importance?: number
}

/**
 * DataTable props
 */
export interface DataTableProps {
  /** Array of data records */
  data: Record<string, unknown>[]
  /** Column definitions (if not provided, inferred from first record) */
  columns?: Column[]
  /** Loading state */
  loading?: boolean
  /** Error state */
  error?: Error | null
  /** Records per page */
  pageSize?: number
  /** Callback when row is selected (Enter key) */
  onSelect?: (row: Record<string, unknown>, index: number) => void
  /** Callback when back is pressed (Esc key) */
  onBack?: () => void
  /** Search query to highlight */
  searchQuery?: string
  /** Total record count (for pagination display) */
  totalCount?: number
  /** Current entity name (for header) */
  entityName?: string
}

/**
 * DataTable component
 */
export default function DataTable({
  data = [],
  columns: providedColumns,
  loading = false,
  error = null,
  pageSize = 25,
  onSelect,
  onBack,
  searchQuery: externalSearchQuery = '',
  totalCount,
  entityName = 'Records',
}: DataTableProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedRow, setSelectedRow] = useState(0)
  const [internalSearchQuery, setInternalSearchQuery] = useState(externalSearchQuery)
  const [searchActive, setSearchActive] = useState(false)

  // Infer columns from data if not provided
  const columns = useMemo(() => {
    if (providedColumns && providedColumns.length > 0) {
      // Sort by importance (higher first)
      return [...providedColumns].sort((a, b) => (b.importance || 0) - (a.importance || 0))
    }

    if (data.length === 0) {
      return []
    }

    // Infer from first record
    const firstRecord = data[0]
    const keys = Object.keys(firstRecord).slice(0, 6) // Limit to 6 columns

    return keys.map((key) => ({
      key,
      label: formatLabel(key),
      uiType: inferUIType(firstRecord[key]),
      importance: 0,
    }))
  }, [providedColumns, data])

  // Limit to 5-6 most important columns
  const visibleColumns = columns.slice(0, 6)

  // Prepare searchable fields for useSearch hook
  const searchableFields: SearchableField[] = useMemo(
    () =>
      columns.map((col) => ({
        key: col.key,
        uiType: col.uiType,
      })),
    [columns]
  )

  // Use the current search query (internal or external)
  const currentSearchQuery = internalSearchQuery || externalSearchQuery

  // Apply search filtering
  const { filteredData, matchCount, totalCount: unfilteredCount, filters } = useSearch(
    data,
    currentSearchQuery,
    searchableFields
  )

  // Calculate total pages based on filtered data
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const startIdx = currentPage * pageSize
  const endIdx = Math.min(startIdx + pageSize, filteredData.length)
  const pageData = filteredData.slice(startIdx, endIdx)

  // Calculate column widths based on terminal width
  // Assuming 80+ column terminal, distribute width
  const columnWidths = useMemo(() => {
    const terminalWidth = process.stdout.columns || 80
    const totalBorders = visibleColumns.length + 1 // Border chars
    const totalSpacing = visibleColumns.length * 2 // Padding
    const availableWidth = terminalWidth - totalBorders - totalSpacing - 4 // Extra margin

    const baseWidth = Math.floor(availableWidth / visibleColumns.length)

    return visibleColumns.map((col) => col.width || baseWidth)
  }, [visibleColumns])

  // Reset selected row when page changes
  useEffect(() => {
    setSelectedRow(0)
  }, [currentPage])

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(0)
    setSelectedRow(0)
  }, [currentSearchQuery])

  // Keyboard navigation
  useInput((input, key) => {
    if (loading) return

    // Don't handle table navigation if search is active
    if (searchActive) return

    // Up arrow - previous row
    if (key.upArrow) {
      if (selectedRow > 0) {
        setSelectedRow(selectedRow - 1)
      } else if (currentPage > 0) {
        // Go to previous page, select last row
        setCurrentPage(currentPage - 1)
        setSelectedRow(pageSize - 1)
      }
    }

    // Down arrow - next row
    if (key.downArrow) {
      if (selectedRow < pageData.length - 1) {
        setSelectedRow(selectedRow + 1)
      } else if (currentPage < totalPages - 1) {
        // Go to next page, select first row
        setCurrentPage(currentPage + 1)
        setSelectedRow(0)
      }
    }

    // Page Up - previous page
    if (key.pageUp && currentPage > 0) {
      setCurrentPage(currentPage - 1)
      setSelectedRow(0)
    }

    // Page Down - next page
    if (key.pageDown && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1)
      setSelectedRow(0)
    }

    // Enter - select row
    if (key.return && onSelect && pageData[selectedRow]) {
      onSelect(pageData[selectedRow], startIdx + selectedRow)
    }

    // Escape - go back
    if (key.escape && onBack) {
      onBack()
    }

    // / - enter search mode
    if (input === '/' && !key.meta && !key.ctrl) {
      setSearchActive(true)
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
          <Text color="red" bold>Error loading {entityName}</Text>
        </Box>
        <Text color="red">{error.message}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text dimColor>No {entityName.toLowerCase()} found</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text>
          <Text bold color="cyan">{entityName}</Text>
          <Text dimColor> (</Text>
          {currentSearchQuery ? (
            <>
              <Text color="green" bold>{matchCount}</Text>
              <Text dimColor> of </Text>
              <Text dimColor bold>{unfilteredCount}</Text>
            </>
          ) : (
            <Text dimColor bold>{totalCount || data.length}</Text>
          )}
          <Text dimColor> total)</Text>
        </Text>
      </Box>

      {/* Search Bar */}
      <SearchBar
        query={internalSearchQuery}
        onQueryChange={setInternalSearchQuery}
        active={searchActive}
        onActiveChange={setSearchActive}
        matchCount={matchCount}
        totalCount={unfilteredCount}
        filters={filters}
        placeholder="Search or filter (field:value, field:>100, !field:value)"
      />

      {/* Table */}
      <Box flexDirection="column">
        {/* Column Headers */}
        <Box>
          {visibleColumns.map((col, idx) => (
            <Box key={col.key} width={columnWidths[idx]} paddingX={1}>
              <Text bold>{truncate(col.label, columnWidths[idx] - 2)}</Text>
            </Box>
          ))}
        </Box>

        {/* Separator */}
        <Box>
          {visibleColumns.map((col, idx) => (
            <Box key={`sep-${col.key}`} width={columnWidths[idx]} paddingX={1}>
              <Text dimColor>{'─'.repeat(columnWidths[idx] - 2)}</Text>
            </Box>
          ))}
        </Box>

        {/* Data Rows */}
        {pageData.map((row, rowIdx) => {
          const isSelected = rowIdx === selectedRow
          const bgColor = isSelected ? 'bgBlue' : undefined

          return (
            <Box key={`row-${rowIdx}`}>
              {visibleColumns.map((col, colIdx) => {
                const value = row[col.key]
                const rendered = renderField(value, col.uiType || 'text', col.format)
                const truncated = truncate(stripAnsi(rendered), columnWidths[colIdx] - 2)

                return (
                  <Box key={`cell-${rowIdx}-${col.key}`} width={columnWidths[colIdx]} paddingX={1}>
                    {isSelected ? (
                      <Text {...{ [bgColor as string]: true }}>{truncated}</Text>
                    ) : (
                      <Text>{truncated}</Text>
                    )}
                  </Box>
                )
              })}
            </Box>
          )
        })}
      </Box>

      {/* Footer / Pagination */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Box justifyContent="space-between" width="100%">
          <Text dimColor>
            Page {currentPage + 1} of {totalPages}
          </Text>
          <Text dimColor>
            ↑/↓: Navigate  •  PgUp/PgDn: Page  •  /: Search  •  Enter: Detail  •  Esc: Back  •  q: Quit
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Format a field key as a human-readable label
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
  }
  return 'text'
}

/**
 * Truncate string to max length with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

/**
 * Strip ANSI escape codes from string for length calculation
 */
function stripAnsi(str: string): string {
  // Simple ANSI stripper (from chalk's strip-ansi)
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
  return str.replace(ansiRegex, '')
}
