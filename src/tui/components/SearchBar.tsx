/**
 * SearchBar Component
 *
 * Interactive search input for filtering DataTable
 * Features:
 * - Press '/' to activate search mode
 * - Text input for search query
 * - Live filtering as you type
 * - Press Esc to clear and exit search
 * - Shows active filters and match count
 */

import { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'
import type { SearchFilter } from '../hooks/useSearch.js'

/**
 * SearchBar props
 */
export interface SearchBarProps {
  /** Current search query */
  query: string
  /** Callback when query changes */
  onQueryChange: (query: string) => void
  /** Whether search mode is active */
  active: boolean
  /** Callback when search mode is toggled */
  onActiveChange: (active: boolean) => void
  /** Match count */
  matchCount?: number
  /** Total count */
  totalCount?: number
  /** Parsed filters for display */
  filters?: SearchFilter[]
  /** Placeholder text */
  placeholder?: string
}

/**
 * SearchBar component
 */
export default function SearchBar({
  query,
  onQueryChange,
  active,
  onActiveChange,
  matchCount,
  totalCount,
  filters = [],
  placeholder = 'Search...',
}: SearchBarProps) {
  const [cursorPosition, setCursorPosition] = useState(query.length)

  // Sync cursor position when query changes externally
  useEffect(() => {
    if (!active) {
      setCursorPosition(query.length)
    }
  }, [query, active])

  // Handle keyboard input when search is active
  useInput(
    (input, key) => {
      if (!active) return

      // Exit search on Escape
      if (key.escape) {
        onQueryChange('')
        onActiveChange(false)
        return
      }

      // Handle backspace
      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          const newQuery = query.slice(0, cursorPosition - 1) + query.slice(cursorPosition)
          onQueryChange(newQuery)
          setCursorPosition(cursorPosition - 1)
        }
        return
      }

      // Handle left arrow
      if (key.leftArrow) {
        if (cursorPosition > 0) {
          setCursorPosition(cursorPosition - 1)
        }
        return
      }

      // Handle right arrow
      if (key.rightArrow) {
        if (cursorPosition < query.length) {
          setCursorPosition(cursorPosition + 1)
        }
        return
      }

      // Handle Home key
      if (key.home) {
        setCursorPosition(0)
        return
      }

      // Handle End key
      if (key.end) {
        setCursorPosition(query.length)
        return
      }

      // Handle Return (just deactivate, keep query)
      if (key.return) {
        onActiveChange(false)
        return
      }

      // Handle regular character input
      if (input && !key.ctrl && !key.meta) {
        const newQuery = query.slice(0, cursorPosition) + input + query.slice(cursorPosition)
        onQueryChange(newQuery)
        setCursorPosition(cursorPosition + 1)
      }
    },
    { isActive: active }
  )

  // Don't render if search is not active and query is empty
  if (!active && !query) {
    return null
  }

  // Render cursor in input
  const renderInput = () => {
    if (!active) {
      // Just show the query when not active
      return <Text color="yellow">{query || placeholder}</Text>
    }

    // Show cursor when active
    if (query.length === 0) {
      return (
        <Text>
          <Text backgroundColor="white" color="black">
            {' '}
          </Text>
          <Text dimColor>{placeholder}</Text>
        </Text>
      )
    }

    const before = query.slice(0, cursorPosition)
    const cursor = query[cursorPosition] || ' '
    const after = query.slice(cursorPosition + 1)

    return (
      <Text>
        {before}
        <Text backgroundColor="white" color="black">
          {cursor}
        </Text>
        {after}
      </Text>
    )
  }

  // Render active filters
  const renderFilters = () => {
    if (filters.length === 0) return null

    const fieldFilters = filters.filter((f) => f.field)
    if (fieldFilters.length === 0) return null

    return (
      <Box marginLeft={2}>
        <Text dimColor>Filters: </Text>
        {fieldFilters.map((filter, idx) => (
          <Box key={idx} marginLeft={1}>
            <Text color="cyan">
              {filter.operator === '!' && '!'}
              {filter.field}
              {filter.operator && filter.operator !== '!' ? filter.operator : ':'}
              {filter.value}
            </Text>
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={active ? 'yellow' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between" width="100%">
        <Box>
          <Text color={active ? 'yellow' : 'gray'}>{active ? '/' : 'Search: '}</Text>
          {renderInput()}
        </Box>

        {matchCount !== undefined && totalCount !== undefined && (
          <Box marginLeft={2}>
            <Text>
              <Text color="green" bold>
                {matchCount}
              </Text>
              <Text dimColor> of </Text>
              <Text dimColor bold>
                {totalCount}
              </Text>
            </Text>
          </Box>
        )}
      </Box>

      {renderFilters()}

      {active && (
        <Box marginTop={1}>
          <Text dimColor>
            Esc: Clear • Enter: Apply • Syntax: field:value, field:&gt;100, !field:value
          </Text>
        </Box>
      )}
    </Box>
  )
}
