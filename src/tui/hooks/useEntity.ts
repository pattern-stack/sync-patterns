/**
 * Dynamic Entity Hook Loader
 *
 * Dynamically imports and wraps hooks from src/generated/entities/
 * Provides a unified interface for both TanStack Query and TanStack DB hooks
 */

import { useState, useEffect, useMemo } from 'react'
import type { SyncMode } from '../utils/entity-discovery'

/**
 * Unified query result interface (matches generated entity types)
 */
export interface UnifiedQueryResult<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  refetch?: () => void
}

/**
 * Hook metadata result
 */
export interface EntityHooks {
  /** List hook: use{Entity}s() */
  useList?: () => UnifiedQueryResult<unknown[]>
  /** Get hook: use{Entity}(id) */
  useOne?: (id: string) => UnifiedQueryResult<unknown>
  /** Create hook: useCreate{Entity}() */
  useCreate?: () => {
    mutate: (data: unknown) => void
    mutateAsync: (data: unknown) => Promise<unknown>
    isPending: boolean
    error: Error | null
  }
  /** Update hook: useUpdate{Entity}() */
  useUpdate?: () => {
    mutate: (params: { id: string; data: unknown }) => void
    mutateAsync: (params: { id: string; data: unknown }) => Promise<unknown>
    isPending: boolean
    error: Error | null
  }
  /** Delete hook: useDelete{Entity}() */
  useDelete?: () => {
    mutate: (id: string) => void
    mutateAsync: (id: string) => Promise<void>
    isPending: boolean
    error: Error | null
  }
  /** WithMeta hook: use{Entity}sWithMeta() - includes column metadata */
  useListWithMeta?: () => UnifiedQueryResult<unknown[]> & {
    columns: unknown[]
    isLoadingMetadata: boolean
    metadataError: Error | null
    isReady: boolean
  }
}

/**
 * Entity module loading state
 */
interface UseEntityResult {
  /** Loaded hooks (undefined if loading or error) */
  hooks?: EntityHooks
  /** Whether hooks are still loading */
  isLoading: boolean
  /** Error if hook loading failed */
  error: Error | null
  /** Detected sync mode */
  syncMode: SyncMode
  /** Display name (singular PascalCase) */
  displayName: string
}

/**
 * Dynamically load hooks for an entity
 *
 * @param entityName - Plural entity name (e.g., "accounts", "contacts")
 * @returns Loaded hooks and metadata
 */
export function useEntity(entityName: string): UseEntityResult {
  const [state, setState] = useState<{
    hooks?: EntityHooks
    isLoading: boolean
    error: Error | null
  }>({
    isLoading: true,
    error: null,
  })

  // Derive display name from entity name
  const displayName = useMemo(() => toDisplayName(entityName), [entityName])

  useEffect(() => {
    let cancelled = false

    async function loadHooks() {
      try {
        // Dynamic import of entity module
        // Path: src/generated/entities/{entityName}.ts
        const modulePath = `../../generated/entities/${entityName}.js`

        const module = await import(modulePath)

        if (cancelled) return

        // Extract hooks from module
        const hooks: EntityHooks = {}

        // List hook: use{Entity}s
        const listHookName = `use${displayName}s`
        if (typeof module[listHookName] === 'function') {
          hooks.useList = module[listHookName] as () => UnifiedQueryResult<unknown[]>
        }

        // List with metadata hook: use{Entity}sWithMeta
        const listWithMetaHookName = `use${displayName}sWithMeta`
        if (typeof module[listWithMetaHookName] === 'function') {
          hooks.useListWithMeta = module[listWithMetaHookName]
        }

        // Get hook: use{Entity}
        const getHookName = `use${displayName}`
        if (typeof module[getHookName] === 'function') {
          hooks.useOne = module[getHookName] as (id: string) => UnifiedQueryResult<unknown>
        }

        // Create hook: useCreate{Entity}
        const createHookName = `useCreate${displayName}`
        if (typeof module[createHookName] === 'function') {
          hooks.useCreate = module[createHookName]
        }

        // Update hook: useUpdate{Entity}
        const updateHookName = `useUpdate${displayName}`
        if (typeof module[updateHookName] === 'function') {
          hooks.useUpdate = module[updateHookName]
        }

        // Delete hook: useDelete{Entity}
        const deleteHookName = `useDelete${displayName}`
        if (typeof module[deleteHookName] === 'function') {
          hooks.useDelete = module[deleteHookName]
        }

        setState({
          hooks,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        if (cancelled) return

        setState({
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    }

    loadHooks()

    return () => {
      cancelled = true
    }
  }, [entityName, displayName])

  // For now, return 'api' as default sync mode
  // In the future, this could be read from config or detected from imports
  const syncMode: SyncMode = 'api'

  return {
    hooks: state.hooks,
    isLoading: state.isLoading,
    error: state.error,
    syncMode,
    displayName,
  }
}

/**
 * Convert entity name to display name (singular PascalCase)
 */
function toDisplayName(entityName: string): string {
  // Remove trailing 's' for plurals (simple heuristic)
  let singular = entityName
  if (singular.endsWith('ies')) {
    singular = singular.slice(0, -3) + 'y'
  } else if (singular.endsWith('ses') || singular.endsWith('shes') || singular.endsWith('ches') || singular.endsWith('xes')) {
    singular = singular.slice(0, -2)
  } else if (singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1)
  }

  // Convert to PascalCase
  return singular
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
