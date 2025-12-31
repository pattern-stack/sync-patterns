/**
 * HelpOverlay Component
 *
 * Modal overlay showing full keyboard shortcut reference
 * Activated by pressing '?' and dismissed with any key
 */

import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useTheme } from './ThemeProvider.js'

export interface HelpOverlayProps {
  /** Callback when help overlay should close */
  onClose: () => void
}

interface ShortcutGroup {
  title: string
  shortcuts: Array<{
    key: string
    description: string
  }>
}

/**
 * Keyboard shortcut groups
 */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { key: '↑/↓', description: 'Navigate up/down' },
      { key: 'PgUp/PgDn', description: 'Previous/next page (table view)' },
      { key: 'Enter', description: 'Select item / Open detail' },
      { key: 'Esc', description: 'Go back to previous view' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { key: '?', description: 'Show this help screen' },
      { key: 'q', description: 'Quit application' },
      { key: 'Ctrl+C', description: 'Force quit' },
    ],
  },
  {
    title: 'Views',
    shortcuts: [
      { key: 'Entity List', description: 'Browse available entities' },
      { key: 'Table View', description: 'View records in table format' },
      { key: 'Detail View', description: 'View single record details' },
    ],
  },
  {
    title: 'Sync Modes',
    shortcuts: [
      { key: '● Realtime', description: 'Optimistic mode (local-first)' },
      { key: '○ API', description: 'Confirmed mode (wait for server)' },
      { key: '◐ Auto', description: 'Automatic mode detection' },
    ],
  },
]

/**
 * HelpOverlay component
 */
export default function HelpOverlay({ onClose }: HelpOverlayProps) {
  const theme = useTheme()

  // Close on any key press
  useInput(() => {
    onClose()
  })

  return (
    <Box
      flexDirection="column"
      padding={2}
      borderStyle="double"
      borderColor="cyan"
      width={80}
    >
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold>{theme.primary('sync-patterns Explorer - Keyboard Shortcuts')}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{theme.mutedForeground('Press any key to close')}</Text>
      </Box>

      {/* Separator */}
      <Box marginBottom={1}>
        <Text>{theme.border('─'.repeat(76))}</Text>
      </Box>

      {/* Shortcut groups */}
      <Box flexDirection="column">
        {SHORTCUT_GROUPS.map((group, groupIndex) => (
          <Box key={group.title} flexDirection="column" marginBottom={1}>
            {/* Group title */}
            <Box marginBottom={0}>
              <Text bold>{theme.accent(group.title)}</Text>
            </Box>

            {/* Shortcuts in this group */}
            {group.shortcuts.map((shortcut, index) => (
              <Box key={`${group.title}-${index}`} marginLeft={2}>
                <Box width={20}>
                  <Text>{theme.primary(shortcut.key)}</Text>
                </Box>
                <Text>{theme.mutedForeground(shortcut.description)}</Text>
              </Box>
            ))}

            {/* Add spacing between groups except last */}
            {groupIndex < SHORTCUT_GROUPS.length - 1 && (
              <Box marginTop={0}>
                <Text> </Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text>{theme.border('─'.repeat(76))}</Text>
      </Box>

      <Box justifyContent="center" marginTop={1}>
        <Text>
          {theme.mutedForeground('For more info: ')}{theme.info('https://github.com/pattern-stack/sync-patterns')}
        </Text>
      </Box>
    </Box>
  )
}
