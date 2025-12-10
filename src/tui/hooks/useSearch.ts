/**
 * Search Hook
 *
 * Provides search and filtering logic for DataTable
 * Supports:
 * - Simple text search across searchable fields
 * - Field-specific filters: field:value
 * - Operators: >, <, ! (not)
 * - Multiple filters combined
 */

import { useMemo } from 'react'
import type { UIType } from '../renderers/index.js'

/**
 * Search filter configuration
 */
export interface SearchFilter {
  /** Field to filter on (undefined = search all text fields) */
  field?: string
  /** Operator (undefined = equals/contains) */
  operator?: '>' | '<' | '!' | '='
  /** Value to filter by */
  value: string
}

/**
 * Field metadata for searching
 */
export interface SearchableField {
  key: string
  uiType?: UIType
}

/**
 * Parse search query into structured filters
 *
 * Examples:
 * - "john" => [{ value: "john" }]
 * - "status:active" => [{ field: "status", value: "active" }]
 * - "price:>100" => [{ field: "price", operator: ">", value: "100" }]
 * - "!status:inactive" => [{ field: "status", operator: "!", value: "inactive" }]
 * - "status:active type:premium" => [{ field: "status", value: "active" }, { field: "type", value: "premium" }]
 */
export function parseSearchQuery(query: string): SearchFilter[] {
  if (!query.trim()) {
    return []
  }

  const filters: SearchFilter[] = []

  // Split by spaces (but preserve quoted strings - future enhancement)
  const parts = query.trim().split(/\s+/)

  for (const part of parts) {
    // Check for field:value syntax
    const fieldMatch = part.match(/^(!)?([a-zA-Z_][a-zA-Z0-9_]*):([><])?(.+)$/)

    if (fieldMatch) {
      const [, notOperator, field, compOperator, value] = fieldMatch
      filters.push({
        field,
        operator: notOperator ? '!' : compOperator as ('>' | '<' | undefined),
        value,
      })
    } else {
      // Plain text search (search all text fields)
      filters.push({ value: part })
    }
  }

  return filters
}

/**
 * Check if a value matches a filter
 */
function matchesFilter(
  value: unknown,
  filter: SearchFilter,
  uiType?: UIType
): boolean {
  const { operator, value: filterValue } = filter

  // Handle null/undefined
  if (value === null || value === undefined) {
    return operator === '!' // Only match if we're looking for NOT
  }

  const strValue = String(value).toLowerCase()
  const strFilter = filterValue.toLowerCase()

  // Numeric comparisons for number types
  if (uiType === 'number' || uiType === 'money' || uiType === 'percent') {
    const numValue = Number(value)
    const numFilter = Number(filterValue)

    if (!isNaN(numValue) && !isNaN(numFilter)) {
      if (operator === '>') return numValue > numFilter
      if (operator === '<') return numValue < numFilter
      if (operator === '!') return numValue !== numFilter
      return numValue === numFilter
    }
  }

  // String comparisons
  if (operator === '!') {
    return !strValue.includes(strFilter)
  }

  if (operator === '>' || operator === '<') {
    // Lexicographic comparison for strings
    if (operator === '>') return strValue > strFilter
    if (operator === '<') return strValue < strFilter
  }

  // Default: case-insensitive contains
  return strValue.includes(strFilter)
}

/**
 * Check if a record matches all filters
 */
function matchesAllFilters(
  record: Record<string, unknown>,
  filters: SearchFilter[],
  fields: SearchableField[]
): boolean {
  return filters.every((filter) => {
    // Field-specific filter
    if (filter.field) {
      const fieldMeta = fields.find((f) => f.key === filter.field)
      const value = record[filter.field]
      return matchesFilter(value, filter, fieldMeta?.uiType)
    }

    // Global text search - match any text-like field
    return fields.some((field) => {
      if (!isSearchableType(field.uiType)) {
        return false
      }
      const value = record[field.key]
      return matchesFilter(value, filter, field.uiType)
    })
  })
}

/**
 * Check if a UIType is searchable
 */
function isSearchableType(uiType?: UIType): boolean {
  if (!uiType) return true // Default to searchable

  const searchableTypes: UIType[] = [
    'text',
    'email',
    'url',
    'phone',
    'badge',
    'status',
    'entity',
    'user',
  ]

  return searchableTypes.includes(uiType)
}

/**
 * Hook to filter data based on search query
 */
export function useSearch<T extends Record<string, unknown>>(
  data: T[],
  searchQuery: string,
  fields: SearchableField[]
): {
  filteredData: T[]
  matchCount: number
  totalCount: number
  filters: SearchFilter[]
} {
  const filters = useMemo(() => parseSearchQuery(searchQuery), [searchQuery])

  const filteredData = useMemo(() => {
    if (filters.length === 0) {
      return data
    }

    return data.filter((record) => matchesAllFilters(record, filters, fields))
  }, [data, filters, fields])

  return {
    filteredData,
    matchCount: filteredData.length,
    totalCount: data.length,
    filters,
  }
}
