/**
 * ConfirmDialog Component
 *
 * Reusable confirmation modal for destructive actions
 * Features:
 * - Warning message with record identifier
 * - Danger-styled confirm button
 * - Keyboard shortcuts: Enter (confirm), Escape (cancel), y/n
 */

import React from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'

export interface ConfirmDialogProps {
  /** Action being confirmed (e.g., "Delete", "Remove") */
  action: string
  /** Type of item being acted on (e.g., "Contact", "Deal") */
  itemType: string
  /** Item identifier (name, title, or ID) */
  itemIdentifier: string
  /** Warning message (optional, defaults to generic warning) */
  warningMessage?: string
  /** Callback when confirmed */
  onConfirm: () => void
  /** Callback when cancelled */
  onCancel: () => void
  /** Loading state (disables input) */
  loading?: boolean
}

/**
 * ConfirmDialog component
 */
export default function ConfirmDialog({
  action,
  itemType,
  itemIdentifier,
  warningMessage,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const defaultWarning = `This action cannot be undone. The ${itemType.toLowerCase()} will be permanently deleted.`
  const message = warningMessage || defaultWarning

  // Keyboard input handling
  useInput((input, key) => {
    if (loading) return

    // Confirm on Enter or 'y'
    if (key.return || input === 'y' || input === 'Y') {
      onConfirm()
    }

    // Cancel on Escape or 'n'
    if (key.escape || input === 'n' || input === 'N') {
      onCancel()
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="red"
      padding={1}
      width={60}
    >
      {/* Header */}
      <Box marginBottom={1} justifyContent="center">
        <Text bold color="red">
          {action} {itemType}
        </Text>
      </Box>

      {/* Item identifier */}
      <Box marginBottom={1} paddingX={2}>
        <Text>
          <Text dimColor>Item: </Text>
          <Text bold>{itemIdentifier}</Text>
        </Text>
      </Box>

      {/* Warning message */}
      <Box
        flexDirection="column"
        marginBottom={1}
        paddingX={2}
        borderStyle="single"
        borderColor="yellow"
        padding={1}
      >
        <Text color="yellow">Warning</Text>
        <Text wrap="wrap">{message}</Text>
      </Box>

      {/* Actions */}
      {loading ? (
        <Box justifyContent="center" marginTop={1}>
          <Text color="cyan">Processing...</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box justifyContent="center" marginBottom={1}>
            <Text>
              <Text backgroundColor="red" color="white" bold>
                {' '}[Enter] {action} {' '}
              </Text>
              {'  '}
              <Text dimColor>[Esc] Cancel</Text>
            </Text>
          </Box>
          <Box justifyContent="center">
            <Text dimColor>
              Shortcuts: <Text color="red">y</Text> = {action.toLowerCase()}, <Text color="cyan">n</Text> = cancel
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
