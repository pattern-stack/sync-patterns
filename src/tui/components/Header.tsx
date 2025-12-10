/**
 * Header Component
 *
 * Persistent header showing app title, current entity, sync mode, and API URL
 */

import React from 'react'
import { Box, Text } from 'ink'
import chalk from 'chalk'

export interface HeaderProps {
  /** Current entity name (if viewing entity) */
  entityName?: string
  /** Sync mode indicator */
  mode?: 'optimistic' | 'confirmed' | 'auto'
  /** API URL to display */
  apiUrl: string
  /** Current view type */
  view: 'entity-list' | 'table' | 'detail'
}

/**
 * Get sync mode indicator with symbol and label
 */
function getSyncModeIndicator(mode?: 'optimistic' | 'confirmed' | 'auto'): string {
  switch (mode) {
    case 'optimistic':
      return chalk.green('● Realtime')
    case 'confirmed':
      return chalk.yellow('○ API')
    case 'auto':
    default:
      return chalk.cyan('◐ Auto')
  }
}

/**
 * Truncate URL to fit in header (max 60 chars)
 */
function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url

  // Try to keep protocol and domain
  const match = url.match(/^(https?:\/\/[^/]+)(.*)$/)
  if (match) {
    const [, domain, path] = match
    if (domain.length < maxLength - 3) {
      const remainingLength = maxLength - domain.length - 3
      if (path.length > remainingLength) {
        return `${domain}/...${path.slice(-remainingLength)}`
      }
    }
  }

  // Fallback: truncate from middle
  const start = url.slice(0, maxLength / 2 - 2)
  const end = url.slice(-(maxLength / 2 - 2))
  return `${start}...${end}`
}

/**
 * Header component
 */
export default function Header({ entityName, mode, apiUrl, view }: HeaderProps) {
  const syncIndicator = getSyncModeIndicator(mode)
  const truncatedUrl = truncateUrl(apiUrl)

  return (
    <Box borderStyle="round" borderColor="cyan" padding={1} marginBottom={1}>
      <Box flexDirection="column" width="100%">
        {/* Title row */}
        <Box justifyContent="space-between">
          <Box>
            <Text bold color="cyan">sync-patterns Explorer</Text>
            {entityName && view !== 'entity-list' && (
              <Text color="cyan"> / {entityName}</Text>
            )}
          </Box>
          <Text>{syncIndicator}</Text>
        </Box>

        {/* API URL row */}
        <Box marginTop={1}>
          <Text dimColor>API: {truncatedUrl}</Text>
        </Box>
      </Box>
    </Box>
  )
}
