/**
 * ErrorView Component
 *
 * Displays error messages with context and retry option
 * Handles different error types (network, import, validation)
 */

import React from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'

export interface ErrorViewProps {
  /** Error object or message */
  error: Error | string
  /** Context about what failed (e.g., "loading entities", "fetching records") */
  context?: string
  /** Whether to show retry option */
  showRetry?: boolean
  /** Entity name (optional, for context) */
  entityName?: string
}

/**
 * Parse error to extract useful information
 */
function parseError(error: Error | string): {
  type: 'network' | 'import' | 'validation' | 'unknown'
  message: string
  details?: string
  statusCode?: number
} {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorStack = typeof error === 'string' ? undefined : error.stack

  // Network error (axios)
  if (errorMessage.includes('Network Error') || errorMessage.includes('ECONNREFUSED')) {
    return {
      type: 'network',
      message: 'Unable to connect to API server',
      details: errorMessage,
    }
  }

  // HTTP error with status code
  const statusMatch = errorMessage.match(/status code (\d+)/)
  if (statusMatch) {
    return {
      type: 'network',
      message: `Server returned error ${statusMatch[1]}`,
      details: errorMessage,
      statusCode: parseInt(statusMatch[1], 10),
    }
  }

  // TypeScript import error
  if (errorMessage.includes('Cannot find module') || errorMessage.includes('import')) {
    // Try to extract file path
    const fileMatch = errorMessage.match(/'([^']+)'/)
    return {
      type: 'import',
      message: 'Failed to load generated code',
      details: fileMatch ? `Module not found: ${fileMatch[1]}` : errorMessage,
    }
  }

  // Validation error (Zod)
  if (errorMessage.includes('validation') || errorMessage.includes('Invalid')) {
    return {
      type: 'validation',
      message: 'Data validation failed',
      details: errorMessage,
    }
  }

  // Unknown error
  return {
    type: 'unknown',
    message: errorMessage,
    details: errorStack,
  }
}

/**
 * Get error icon based on error type
 */
function getErrorIcon(type: string): string {
  switch (type) {
    case 'network':
      return '⚠'
    case 'import':
      return '📁'
    case 'validation':
      return '✗'
    default:
      return '⚠'
  }
}

/**
 * ErrorView component
 */
export default function ErrorView({
  error,
  context = 'performing operation',
  showRetry = true,
  entityName,
}: ErrorViewProps) {
  const parsed = parseError(error)
  const icon = getErrorIcon(parsed.type)

  return (
    <Box flexDirection="column" padding={2}>
      {/* Error header */}
      <Box marginBottom={1}>
        <Text color="red" bold>
          {icon} Error {context}
        </Text>
        {entityName && (
          <Text color="red"> ({entityName})</Text>
        )}
      </Box>

      {/* Main error message */}
      <Box marginBottom={1} paddingLeft={2}>
        <Text color="red">{parsed.message}</Text>
      </Box>

      {/* Error details */}
      {parsed.details && (
        <Box
          flexDirection="column"
          marginBottom={1}
          paddingLeft={2}
          borderStyle="single"
          borderColor="red"
          padding={1}
        >
          <Text dimColor>Details:</Text>
          <Text dimColor wrap="wrap">{parsed.details}</Text>
        </Box>
      )}

      {/* HTTP status code specific help */}
      {parsed.statusCode && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text dimColor>
            {parsed.statusCode === 404 && 'The requested resource was not found.'}
            {parsed.statusCode === 401 && 'Authentication required or invalid credentials.'}
            {parsed.statusCode === 403 && 'Access denied. Check your permissions.'}
            {parsed.statusCode === 500 && 'Server error. Please try again later.'}
            {parsed.statusCode >= 500 && parsed.statusCode < 600 && 'Server is experiencing issues.'}
          </Text>
        </Box>
      )}

      {/* Import error specific help */}
      {parsed.type === 'import' && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text dimColor>
            Run {chalk.cyan('sync-patterns generate <openapi-spec>')} to generate the required files.
          </Text>
        </Box>
      )}

      {/* Actions */}
      <Box marginTop={1}>
        <Text dimColor>
          {showRetry && 'Press '}
          {showRetry && <Text color="cyan">r</Text>}
          {showRetry && ' to retry  •  '}
          Press <Text color="cyan">Esc</Text> to go back  •  Press <Text color="cyan">q</Text> to quit
        </Text>
      </Box>
    </Box>
  )
}
