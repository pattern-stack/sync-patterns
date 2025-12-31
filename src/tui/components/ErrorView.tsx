/**
 * ErrorView Component
 *
 * Displays error messages with context and retry option
 * Handles different error types (network, import, validation)
 */

import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from './ThemeProvider.js'

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

  // HTTP error with status code (matches "API Error 401:" or "status code 401")
  const statusMatch = errorMessage.match(/(?:API Error|status code)\s*(\d+)/i)
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10)
    const statusMessages: Record<number, string> = {
      400: 'Bad request - check your input',
      401: 'Authentication required',
      403: 'Access denied - check your permissions',
      404: 'Resource not found',
      422: 'Validation error',
      500: 'Internal server error',
      502: 'Bad gateway',
      503: 'Service unavailable',
    }
    return {
      type: 'network',
      message: statusMessages[statusCode] || `Server returned error ${statusCode}`,
      details: errorMessage,
      statusCode,
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
  const theme = useTheme()
  const parsed = parseError(error)
  const icon = getErrorIcon(parsed.type)

  return (
    <Box flexDirection="column" padding={2}>
      {/* Error header */}
      <Box marginBottom={1}>
        <Text bold>{theme.error(`${icon} Error ${context}`)}</Text>
        {entityName && (
          <Text> {theme.error(`(${entityName})`)}</Text>
        )}
      </Box>

      {/* Main error message */}
      <Box marginBottom={1} paddingLeft={2}>
        <Text>{theme.error(parsed.message)}</Text>
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
          <Text>{theme.muted('Details:')}</Text>
          <Text wrap="wrap">{theme.mutedForeground(parsed.details)}</Text>
        </Box>
      )}

      {/* HTTP status code specific help */}
      {parsed.statusCode && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text>{theme.mutedForeground(
            parsed.statusCode === 404 ? 'The requested resource was not found.' :
            parsed.statusCode === 401 ? 'Authentication required or invalid credentials.' :
            parsed.statusCode === 403 ? 'Access denied. Check your permissions.' :
            parsed.statusCode === 500 ? 'Server error. Please try again later.' :
            parsed.statusCode >= 500 && parsed.statusCode < 600 ? 'Server is experiencing issues.' : ''
          )}</Text>
        </Box>
      )}

      {/* Import error specific help */}
      {parsed.type === 'import' && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text>
            {theme.mutedForeground('Run ')}{theme.info('sync-patterns generate <openapi-spec>')}{theme.mutedForeground(' to generate the required files.')}
          </Text>
        </Box>
      )}

      {/* Actions */}
      <Box marginTop={1}>
        <Text>
          {showRetry && theme.mutedForeground('Press ')}
          {showRetry && theme.primary('r')}
          {showRetry && theme.mutedForeground(' to retry  •  ')}
          {theme.mutedForeground('Press ')}{theme.primary('Esc')}{theme.mutedForeground(' to go back  •  Press ')}{theme.primary('q')}{theme.mutedForeground(' to quit')}
        </Text>
      </Box>
    </Box>
  )
}
