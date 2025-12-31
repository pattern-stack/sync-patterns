/**
 * EntityTableView Component
 *
 * Fetches entity data using the API client and renders in a DataTable.
 * Uses a configurable API client for data fetching with proper auth handling.
 * Extracts UIType from metadata for proper rendering and column sizing.
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import DataTable, { type Column } from './DataTable.js'
import SearchBar from './SearchBar.js'
import type { UIType } from '../renderers/index.js'
import { inferUIType } from '../utils/column-sizing.js'
import { apiClient, configureApi } from '../utils/api-client.js'
import { parseSearchQuery } from '../hooks/useSearch.js'

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
  totalCount: number
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
    totalCount: 0,
    isLoading: true,
    error: null,
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActive, setSearchActive] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        setState(s => ({ ...s, isLoading: true, error: null }))

        // Configure the API client with baseUrl and auth token
        configureApi({
          baseUrl: apiUrl,
          authToken: authToken,
        })

        // Build query params for search
        const queryParams: Record<string, string> = {}
        if (searchQuery.trim()) {
          // Use 'search' param for simple text queries or 'q' as fallback
          queryParams.search = searchQuery.trim()
        }

        // Fetch data and metadata in parallel using the generated API client
        const [dataJson, metaJson] = await Promise.all([
          apiClient.get<any>(`/${entityName}`, queryParams),
          apiClient.get<any>(`/${entityName}/fields/metadata`, { view: 'list' }).catch(() => null),
        ])

        // Extract data from response (handle different response shapes)
        const data = dataJson.items ?? dataJson.data ?? dataJson
        const totalCount = dataJson.total ?? dataJson.count ?? (Array.isArray(data) ? data.length : 0)

        // Parse metadata if available
        let columns: Column[] = []
        if (metaJson) {
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
          const allKeys = Object.keys(firstRow)

          // Prioritize columns based on field name importance
          const prioritizedKeys = prioritizeColumns(allKeys).slice(0, 6)

          columns = prioritizedKeys.map((key) => ({
            key,
            label: formatLabel(key),
            uiType: inferUIType(key, firstRow[key]),
            importance: getFieldPriority(key),
          }))
        }

        setState({ data, columns, totalCount, isLoading: false, error: null })
      } catch (err) {
        setState(s => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }))
      }
    }

    fetchData()
  }, [apiUrl, entityName, authToken, searchQuery])

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

  // Parse search query for display
  const filters = parseSearchQuery(searchQuery)

  return (
    <Box flexDirection="column">
      <SearchBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        active={searchActive}
        onActiveChange={setSearchActive}
        matchCount={state.data.length}
        totalCount={state.totalCount}
        filters={filters}
        placeholder={`Search ${entityName.toLowerCase()}...`}
      />
      <DataTable
        entityName={entityName}
        data={state.data}
        columns={state.columns}
        loading={state.isLoading}
        pageSize={pageSize}
        onSelect={onSelect}
        onBack={onBack}
        searchQuery={searchQuery}
        totalCount={state.totalCount}
        onSearchActivate={() => setSearchActive(true)}
      />
    </Box>
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
 * Field priority categories for fallback column ordering
 * Higher numbers = more important = shown first
 */
const FIELD_PRIORITY: Record<string, number> = {
  // Primary identifiers (highest priority)
  name: 100,
  title: 100,
  label: 95,
  display_name: 95,
  displayName: 95,

  // Key business fields
  status: 90,
  state: 90,
  type: 85,
  category: 85,

  // Money/amounts
  amount: 80,
  total: 80,
  price: 80,
  balance: 80,
  value: 75,

  // Dates (moderately important)
  date: 70,
  due_date: 70,
  dueDate: 70,
  start_date: 65,
  end_date: 65,

  // Descriptions (less important for list view)
  description: 50,
  notes: 45,
  memo: 45,

  // Foreign keys (show but not first)
  account_id: 40,
  category_id: 40,
  user_id: 40,
  owner_id: 40,

  // System timestamps (low priority for list view)
  created_at: 20,
  createdAt: 20,
  updated_at: 15,
  updatedAt: 15,

  // ID field (usually not useful to show)
  id: 10,
}

/**
 * Get priority score for a field name (higher = more important)
 */
function getFieldPriority(fieldName: string): number {
  const lowerName = fieldName.toLowerCase()

  // Check exact match
  if (FIELD_PRIORITY[fieldName] !== undefined) {
    return FIELD_PRIORITY[fieldName]
  }

  // Check lowercase match
  for (const [key, priority] of Object.entries(FIELD_PRIORITY)) {
    if (key.toLowerCase() === lowerName) {
      return priority
    }
  }

  // Pattern-based scoring
  if (lowerName.includes('name')) return 90
  if (lowerName.includes('title')) return 90
  if (lowerName.includes('status')) return 85
  if (lowerName.includes('amount') || lowerName.includes('price')) return 75
  if (lowerName.endsWith('_id')) return 35  // Foreign keys
  if (lowerName.endsWith('_at')) return 15  // Timestamps
  if (lowerName === 'id') return 10

  // Default for unknown fields
  return 50
}

/**
 * Sort field names by importance for display
 */
function prioritizeColumns(keys: string[]): string[] {
  return [...keys].sort((a, b) => getFieldPriority(b) - getFieldPriority(a))
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
