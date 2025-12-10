/**
 * Entity Wrapper Types
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */

import type { ColumnMetadata } from '@pattern-stack/frontend-patterns'

/**
 * Shared types for unified entity wrappers
 */

export interface UnifiedQueryResult<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  /** Refetch data. No-op in realtime mode (data auto-updates). */
  refetch?: () => void
}

export interface UnifiedMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => void
  mutateAsync: (variables: TVariables) => Promise<TData>
  isPending: boolean
  error: Error | null
}

/**
 * Extended query result that includes column metadata.
 * Used by use{Entity}WithMeta() hooks to provide both data and metadata.
 */
export interface UnifiedQueryResultWithMeta<T> extends UnifiedQueryResult<T> {
  /** Column metadata for rendering tables/forms */
  columns: ColumnMetadata[]
  /** Whether metadata is still loading */
  isLoadingMetadata: boolean
  /** Metadata-specific error (if data succeeded but metadata failed) */
  metadataError: Error | null
  /** True when both data AND metadata are loaded */
  isReady: boolean
}
