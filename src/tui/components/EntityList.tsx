/**
 * EntityList Component
 *
 * Displays a scrollable list of entities with record counts and sync mode indicators
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import chalk from 'chalk'
import type { EntityMetadata, SyncMode } from '../utils/entity-discovery'
import { discoverEntities } from '../utils/entity-discovery'
import LoadingView from './LoadingView'
import ErrorView from './ErrorView'

export interface EntityListProps {
  /** Callback when an entity is selected */
  onSelect: (entityName: string) => void
  /** Callback when escape is pressed */
  onBack: () => void
  /** Path to generated code directory */
  generatedDir?: string
}

/**
 * Get sync mode indicator symbol
 */
function getSyncModeIndicator(mode: SyncMode): string {
  switch (mode) {
    case 'realtime':
      return chalk.green('● realtime')
    case 'offline':
      return chalk.yellow('◐ offline')
    case 'api':
    default:
      return chalk.gray('○ api')
  }
}

export function EntityList({ onSelect, onBack, generatedDir }: EntityListProps) {
  const [entities, setEntities] = useState<EntityMetadata[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Discover entities on mount
  const loadEntities = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const discovered = await discoverEntities(generatedDir)
      setEntities(discovered)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadEntities()
  }, [])

  // Handle keyboard input
  useInput((input, key) => {
    // Allow retry on error
    if (error && input === 'r') {
      loadEntities()
      return
    }

    if (isLoading || entities.length === 0) return

    // Up arrow
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1))
    }

    // Down arrow
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(entities.length - 1, prev + 1))
    }

    // Enter - select entity
    if (key.return) {
      const selected = entities[selectedIndex]
      if (selected) {
        onSelect(selected.name)
      }
    }

    // Escape - go back
    if (key.escape) {
      onBack()
    }
  })

  // Loading state
  if (isLoading) {
    return <LoadingView message="Discovering entities" />
  }

  // Error state
  if (error) {
    return <ErrorView error={error} context="discovering entities" showRetry={true} />
  }

  // Empty state
  if (entities.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">No entities found</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>No entity modules found in src/generated/entities/</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Make sure you've run:</Text>
          <Box marginLeft={2}>
            <Text dimColor>sync-patterns generate {chalk.cyan('<openapi-spec>')}</Text>
          </Box>
        </Box>
        <Box>
          <Text dimColor>Press Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  // Entity list
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Entities</Text>
        <Text dimColor> ({entities.length} found)</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {entities.map((entity, index) => {
          const isSelected = index === selectedIndex
          const syncIndicator = getSyncModeIndicator(entity.syncMode)

          return (
            <Box key={entity.name} paddingY={0}>
              <Box width={2}>
                <Text>{isSelected ? chalk.cyan('>') : ' '}</Text>
              </Box>
              <Box width={25}>
                <Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>
                  {entity.displayName}
                </Text>
              </Box>
              <Box width={20}>
                <Text dimColor>{syncIndicator}</Text>
              </Box>
              <Box>
                <Text dimColor>
                  {entity.hooks.length} hook{entity.hooks.length !== 1 ? 's' : ''}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑/↓: Navigate  •  Enter: Select  •  Esc: Back
        </Text>
      </Box>
    </Box>
  )
}
