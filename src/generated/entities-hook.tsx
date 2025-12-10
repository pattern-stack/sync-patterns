/**
 * Entity API Hook
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 *
 * Provides useEntities() for type-safe, entity-agnostic access to all entities.
 */

import type { ColumnMetadata } from '@pattern-stack/frontend-patterns'
import { useEntityData } from '@pattern-stack/frontend-patterns'

import type { UnifiedQueryResult, UnifiedMutationResult, UnifiedQueryResultWithMeta } from './entities/types'

import { useHousehold, useCreateHousehold } from './entities/households'

export interface MetadataResult {
  columns: ColumnMetadata[]
  isLoading: boolean
}

/**
 * Generic entity API shape for entity-agnostic access.
 *
 * For full type safety, import hooks directly from entity modules:
 * import { useAccounts, useCreateAccount } from './entities/accounts'
 *
 * Queries are hook references (consumer calls them).
 * Mutations are results (already called inside useEntities).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EntityApi {
  /** Fetch all entities - hook reference, consumer calls */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useList: () => UnifiedQueryResult<any[]>
  /** Fetch single entity by ID - hook reference, consumer calls */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useOne: (id: string) => UnifiedQueryResult<any>
  /** Fetch column metadata - hook reference, consumer calls */
  useMetadata: (view?: 'list' | 'detail' | 'form') => MetadataResult
  /** Fetch all entities with metadata - hook reference, consumer calls */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useListWithMeta: (options?: { view?: 'list' | 'detail' | 'form' }) => UnifiedQueryResultWithMeta<any[]>
  /** Create mutation - result, already initialized */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create?: UnifiedMutationResult<any, any>
  /** Update mutation - result, already initialized */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update?: UnifiedMutationResult<any, any>
  /** Delete mutation - result, already initialized */
  delete?: UnifiedMutationResult<void, string>
}

/**
 * Complete entities interface with typed access and dynamic lookup.
 * For full type safety, import hooks directly from entity modules.
 */
export interface Entities {
  households: EntityApi
  /** Dynamic entity lookup by name */
  get: (name: string) => EntityApi | undefined
}

function createMetadataHook(entityName: string) {
  return function useMetadata(view: 'list' | 'detail' | 'form' = 'list'): MetadataResult {
    const { columns, isLoadingMetadata } = useEntityData(entityName, { view })
    return {
      columns,
      isLoading: isLoadingMetadata,
    }
  }
}

/**
 * Access all entity APIs with full TypeScript support.
 *
 * Mutations are called INSIDE this hook and returned as results.
 * Queries stay as hook references - consumer must call them.
 *
 * @example
 * const { accounts } = useEntities()
 * const { data } = accounts.useList()        // Query - call it
 * const { columns } = accounts.useMetadata() // Metadata - call it
 * await accounts.create?.mutateAsync(data)   // Mutation - use directly
 */
export function useEntities(): Entities {
  // Call ALL mutation hooks unconditionally (React rules of hooks)
  const householdsCreate = useCreateHousehold()

  // Build entity APIs with full type safety
  const householdsApi: EntityApi = {
    useList: useHouseholds,
    useOne: useHousehold,
    useMetadata: createMetadataHook('households'),
    create: householdsCreate,
  }

  const registry: Record<string, EntityApi> = {
    households: householdsApi,
  }

  return {
    households: householdsApi,
    get: (name: string) => registry[name],
  }
}

const ENTITY_NAMES = ['households'] as const

export function hasEntity(name: string): boolean {
  return ENTITY_NAMES.includes(name as typeof ENTITY_NAMES[number])
}

export function getEntityNames(): readonly string[] {
  return ENTITY_NAMES
}