/**
 * useLinkedRecord Hook
 *
 * Fetches and caches linked records for foreign key fields.
 * Provides a unified interface for accessing related records across entities.
 */

import { useState, useEffect } from 'react'
import { apiClient } from '../utils/api-client.js'
import {
  getCachedRecord,
  setCachedRecord,
  setLoadingRecord,
  setErrorRecord,
  type LinkedRecord,
} from '../utils/linked-record-cache.js'

export interface LinkedRecordResult {
  /** Linked record display name */
  displayName?: string
  /** Full record data */
  data?: Record<string, unknown>
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error?: Error
  /** Whether the record was found */
  exists: boolean
}

/**
 * Fields to try for display name (in order of preference)
 */
const DISPLAY_NAME_FIELDS = ['name', 'title', 'full_name', 'display_name', 'label', 'email', 'username']

/**
 * Extract display name from a record
 */
function extractDisplayName(record: Record<string, unknown>): string {
  // Try common display name fields
  for (const field of DISPLAY_NAME_FIELDS) {
    const value = record[field]
    if (value && typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  // Fallback to ID if available
  if (record.id) {
    return `Record ${record.id}`
  }

  return 'Unknown'
}

/**
 * Hook to fetch and cache a linked record
 *
 * @param entityType - Plural entity name (e.g., "accounts", "contacts")
 * @param recordId - ID of the record to fetch
 * @returns Linked record result with display name and loading/error states
 */
export function useLinkedRecord(
  entityType: string | undefined,
  recordId: string | undefined
): LinkedRecordResult {
  const [result, setResult] = useState<LinkedRecordResult>({
    isLoading: false,
    exists: false,
  })

  useEffect(() => {
    // Don't fetch if entity type or record ID is missing
    if (!entityType || !recordId) {
      setResult({ isLoading: false, exists: false })
      return
    }

    // Check cache first
    const cached = getCachedRecord(entityType, recordId)

    if (cached) {
      if (cached.loading) {
        setResult({ isLoading: true, exists: false })
        return
      }

      if (cached.error) {
        setResult({
          isLoading: false,
          error: cached.error,
          exists: false,
        })
        return
      }

      if (cached.record) {
        setResult({
          displayName: cached.record.displayName,
          data: cached.record.data,
          isLoading: false,
          exists: true,
        })
        return
      }
    }

    // Not in cache, fetch it
    let cancelled = false

    async function fetchRecord() {
      if (!entityType || !recordId) return

      try {
        // Set loading state in cache
        setLoadingRecord(entityType, recordId)
        setResult({ isLoading: true, exists: false })

        // Fetch the record from API
        const data = await apiClient.get<Record<string, unknown>>(`/${entityType}/${recordId}`)

        if (cancelled) return

        // Extract display name
        const displayName = extractDisplayName(data)

        // Create linked record
        const linkedRecord: LinkedRecord = {
          entityType,
          id: recordId,
          displayName,
          data,
          cachedAt: Date.now(),
        }

        // Cache it
        setCachedRecord(entityType, recordId, linkedRecord)

        // Update state
        setResult({
          displayName,
          data,
          isLoading: false,
          exists: true,
        })
      } catch (error) {
        if (cancelled) return

        const err = error instanceof Error ? error : new Error(String(error))

        // Check if it's a 404 (record doesn't exist)
        const is404 = err.message.includes('404')

        // Cache the error
        setErrorRecord(entityType, recordId, err)

        // Update state
        setResult({
          isLoading: false,
          error: is404 ? undefined : err, // Don't show error for deleted records
          exists: false,
        })
      }
    }

    fetchRecord()

    return () => {
      cancelled = true
    }
  }, [entityType, recordId])

  return result
}

/**
 * Detect if a field is a foreign key based on field name
 *
 * @param fieldKey - Field name to check
 * @returns Entity type if it's a foreign key, undefined otherwise
 */
export function detectForeignKey(fieldKey: string): string | undefined {
  // Pattern: ends with _id (e.g., account_id, contact_id, user_id)
  if (fieldKey.endsWith('_id')) {
    // Extract entity type (e.g., account_id -> accounts)
    const entityName = fieldKey.slice(0, -3) // Remove '_id'

    // Convert to plural (simple heuristic)
    return pluralize(entityName)
  }

  return undefined
}

/**
 * Simple pluralization (matches entity discovery logic)
 */
function pluralize(singular: string): string {
  // Special cases
  const specials: Record<string, string> = {
    person: 'people',
    child: 'children',
    category: 'categories',
  }

  if (specials[singular]) {
    return specials[singular]
  }

  // General rules
  if (singular.endsWith('y') && !singular.endsWith('ay') && !singular.endsWith('ey') && !singular.endsWith('oy') && !singular.endsWith('uy')) {
    return singular.slice(0, -1) + 'ies'
  }

  if (singular.endsWith('s') || singular.endsWith('sh') || singular.endsWith('ch') || singular.endsWith('x') || singular.endsWith('z')) {
    return singular + 'es'
  }

  return singular + 's'
}
