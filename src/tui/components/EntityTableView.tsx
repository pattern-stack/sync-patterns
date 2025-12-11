/**
 * EntityTableView Component
 *
 * Fetches entity data via direct API calls and renders in a DataTable.
 * Uses the generated API client for data fetching.
 * Extracts UIType from metadata for proper rendering and column sizing.
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import DataTable, { type Column } from './DataTable.js'
import type { UIType } from '../renderers/index.js'
import { inferUIType } from '../utils/column-sizing.js'

export interface EntityTableViewProps {
  entityName: string
  apiUrl: string
  authToken?: string
  pageSize: number
  onSelect: (row: Record<string, unknown>) => void
  onBack: () => void
}

/** Raw metadata column from API */
interface MetadataColumn {
  field?: string
  key?: string
  label?: string
  type?: string  // UIType from backend
  importance?: string
  format?: Record<string, unknown>
}

interface FetchState {
  data: Record<string, unknown>[]
  columns: Column[]
  isLoading: boolean
  error: Error | null
}

export function EntityTableView({
  entityName,
  apiUrl,
  authToken,
  pageSize,
  onSelect,
  onBack,
}: EntityTableViewProps) {
  const [state, setState] = useState<FetchState>({
    data: [],
    columns: [],
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    async function fetchData() {
      try {
        setState(s => ({ ...s, isLoading: true, error: null }))

        // Build headers with optional auth
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`
        }

        // Fetch data and metadata in parallel
        const [dataRes, metaRes] = await Promise.all([
          fetch(`${apiUrl}/${entityName}`, { headers }),
          fetch(`${apiUrl}/${entityName}/fields/metadata?view=list`, { headers }).catch(() => null),
        ])

        if (!dataRes.ok) {
          throw new Error(`Failed to fetch ${entityName}: ${dataRes.status}`)
        }

        const dataJson = await dataRes.json()
        const data = dataJson.items ?? dataJson.data ?? dataJson

        // Parse metadata if available
        let columns: Column[] = []
        if (metaRes?.ok) {
          const metaJson = await metaRes.json()
          // Metadata uses 'field' not 'key' - filter to primary/secondary importance for list view
          const allColumns: MetadataColumn[] = metaJson.columns ?? []
          const listColumns = allColumns.filter((col) =>
            col.importance === 'primary' || col.importance === 'secondary'
          ).slice(0, 6) // Limit to 6 columns for TUI

          // Get sample row for value-based type inference
          const sampleRow = Array.isArray(data) && data.length > 0 ? data[0] : {}

          columns = listColumns.map((col) => {
            const fieldKey = col.field ?? col.key ?? ''
            const sampleValue = sampleRow[fieldKey]

            // Use metadata type if provided, otherwise infer from field name + value
            const uiType: UIType = (col.type as UIType) ?? inferUIType(fieldKey, sampleValue)

            return {
              key: fieldKey,
              label: col.label ?? fieldKey,
              uiType,
              format: col.format,
              importance: mapImportance(col.importance),
            }
          })
        } else if (Array.isArray(data) && data.length > 0) {
          // Fallback: derive columns from first row with smart type inference
          const firstRow = data[0]
          const keys = Object.keys(firstRow).slice(0, 6)

          columns = keys.map((key) => ({
            key,
            label: formatLabel(key),
            uiType: inferUIType(key, firstRow[key]),
            importance: 0,
          }))
        }

        setState({ data, columns, isLoading: false, error: null })
      } catch (err) {
        setState(s => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }))
      }
    }

    fetchData()
  }, [apiUrl, entityName, authToken])

  if (state.error) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="red">Error loading {entityName}:</Text>
        <Text color="red">{state.error.message}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  return (
    <DataTable
      entityName={entityName}
      data={state.data}
      columns={state.columns}
      loading={state.isLoading}
      pageSize={pageSize}
      onSelect={onSelect}
      onBack={onBack}
    />
  )
}

/**
 * Map importance string to numeric value for sorting
 */
function mapImportance(importance?: string): number {
  switch (importance) {
    case 'primary':
    case 'critical':
    case 'high':
      return 3
    case 'secondary':
    case 'medium':
      return 2
    case 'tertiary':
    case 'low':
    case 'minimal':
      return 1
    default:
      return 0
  }
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

export default EntityTableView
