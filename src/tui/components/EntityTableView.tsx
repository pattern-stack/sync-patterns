/**
 * EntityTableView Component
 *
 * Fetches entity data via direct API calls and renders in a DataTable.
 * Uses the generated API client for data fetching.
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import DataTable from './DataTable.js'

export interface EntityTableViewProps {
  entityName: string
  apiUrl: string
  authToken?: string
  pageSize: number
  onSelect: (row: Record<string, unknown>) => void
  onBack: () => void
}

interface FetchState {
  data: Record<string, unknown>[]
  columns: { key: string; label: string }[]
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
        let columns: { key: string; label: string }[] = []
        if (metaRes?.ok) {
          const metaJson = await metaRes.json()
          // Metadata uses 'field' not 'key' - filter to primary/secondary importance for list view
          const allColumns = metaJson.columns ?? []
          const listColumns = allColumns.filter((col: { importance?: string }) =>
            col.importance === 'primary' || col.importance === 'secondary'
          ).slice(0, 6) // Limit to 6 columns for TUI
          columns = listColumns.map((col: { field?: string; key?: string; label?: string }) => ({
            key: col.field ?? col.key ?? '',
            label: col.label ?? col.field ?? col.key ?? '',
          }))
        } else if (Array.isArray(data) && data.length > 0) {
          // Fallback: derive columns from first row
          columns = Object.keys(data[0]).map(key => ({ key, label: key }))
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
  }, [apiUrl, entityName])

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

export default EntityTableView
