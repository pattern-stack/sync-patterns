/**
 * StatusBar Component
 *
 * Context-sensitive footer showing keyboard shortcuts and pagination info
 */

import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from './ThemeProvider.js'

export interface StatusBarProps {
  /** Current view type */
  view: 'entity-list' | 'table' | 'detail'
  /** Current page number (1-indexed, for table view) */
  currentPage?: number
  /** Total number of pages (for table view) */
  totalPages?: number
  /** Whether data is currently loading */
  isLoading?: boolean
}

/**
 * Get keyboard shortcuts for current view
 */
function getShortcutsForView(view: 'entity-list' | 'table' | 'detail'): string {
  switch (view) {
    case 'entity-list':
      return '↑/↓: Navigate  •  Enter: Select  •  ?: Help  •  q: Quit'

    case 'table':
      return '↑/↓: Navigate  •  PgUp/PgDn: Page  •  Enter: Detail  •  /: Search  •  Esc: Back  •  q: Quit'

    case 'detail':
      return '↑/↓: Scroll  •  Esc: Back to Table  •  ?: Help  •  q: Quit'

    default:
      return '?: Help  •  q: Quit'
  }
}

/**
 * StatusBar component
 */
export default function StatusBar({
  view,
  currentPage,
  totalPages,
  isLoading = false,
}: StatusBarProps) {
  const theme = useTheme()
  const shortcuts = getShortcutsForView(view)

  // Show loading indicator if data is being fetched
  if (isLoading) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Box justifyContent="space-between" width="100%">
          <Text>{theme.muted('Loading...')}</Text>
          <Text>{theme.mutedForeground(shortcuts)}</Text>
        </Box>
      </Box>
    )
  }

  // Table view with pagination
  if (view === 'table' && currentPage !== undefined && totalPages !== undefined) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Box justifyContent="space-between" width="100%">
          <Text>{theme.muted(`Page ${currentPage} of ${totalPages}`)}</Text>
          <Text>{theme.mutedForeground(shortcuts)}</Text>
        </Box>
      </Box>
    )
  }

  // Default: just show shortcuts
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>{theme.mutedForeground(shortcuts)}</Text>
    </Box>
  )
}
