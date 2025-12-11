/**
 * EntityTableView Component
 *
 * Dynamically loads generated hooks and renders data in a DataTable.
 * Uses jiti to load TypeScript modules from the user's project.
 */

import React from 'react'
import { Box, Text } from 'ink'
import { loadEntityModule } from '../utils/generated-loader.js'
import DataTable from './DataTable.js'

export interface EntityTableViewProps {
  entityName: string
  generatedDir: string
  pageSize: number
  onSelect: (row: Record<string, unknown>) => void
  onBack: () => void
}

/**
 * Convert entity name to PascalCase singular
 * accounts -> Account
 */
function toPascalSingular(name: string): string {
  let singular = name
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('ses') || singular.endsWith('shes') || singular.endsWith('ches') || singular.endsWith('xes')) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1)
  }
  return singular
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function EntityTableView({
  entityName,
  generatedDir,
  pageSize,
  onSelect,
  onBack,
}: EntityTableViewProps) {
  // Load the entity module dynamically
  const entityModule = loadEntityModule(generatedDir, entityName)

  if (!entityModule) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="red">Failed to load entity module: {entityName}</Text>
        <Text dimColor>
          Make sure you have run: sync-patterns generate {'<spec>'} --output {generatedDir}
        </Text>
      </Box>
    )
  }

  // Find the WithMeta hook (e.g., useAccountsWithMeta)
  const pascalName = toPascalSingular(entityName)
  const hookName = `use${pascalName}sWithMeta`
  const useListWithMeta = entityModule[hookName]

  if (!useListWithMeta) {
    // Fallback to regular list hook
    const fallbackHookName = `use${pascalName}s`
    const useList = entityModule[fallbackHookName]

    if (!useList) {
      return (
        <Box flexDirection="column" padding={2}>
          <Text color="red">No list hook found for {entityName}</Text>
          <Text dimColor>Expected: {hookName} or {fallbackHookName}</Text>
        </Box>
      )
    }

    // Use the fallback hook without metadata
    return <EntityTableWithHook
      entityName={entityName}
      useListHook={useList}
      hasMetadata={false}
      pageSize={pageSize}
      onSelect={onSelect}
      onBack={onBack}
    />
  }

  return <EntityTableWithHook
    entityName={entityName}
    useListHook={useListWithMeta}
    hasMetadata={true}
    pageSize={pageSize}
    onSelect={onSelect}
    onBack={onBack}
  />
}

interface EntityTableWithHookProps {
  entityName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useListHook: () => any
  hasMetadata: boolean
  pageSize: number
  onSelect: (row: Record<string, unknown>) => void
  onBack: () => void
}

/**
 * Inner component that actually calls the hook.
 * Separated so the hook call is at the top level of a component.
 */
function EntityTableWithHook({
  entityName,
  useListHook,
  hasMetadata,
  pageSize,
  onSelect,
  onBack,
}: EntityTableWithHookProps) {
  // Call the hook
  const result = useListHook()

  const data = result.data ?? []
  const columns = hasMetadata ? (result.columns ?? []) : []
  const isLoading = hasMetadata ? !result.isReady : result.isLoading

  return (
    <DataTable
      entityName={entityName}
      data={data}
      columns={columns}
      loading={isLoading}
      pageSize={pageSize}
      onSelect={onSelect}
      onBack={onBack}
    />
  )
}

export default EntityTableView
