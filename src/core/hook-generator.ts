/**
 * Hook Generator
 *
 * Generates React hooks that wrap the API layer.
 * Uses TanStack Query for data fetching and caching.
 *
 * Phase 3 (SYNC-012): Adds optimistic mutation support with:
 * - onMutate: Optimistic cache update before API call
 * - onError: Rollback on failure
 * - onSettled: Invalidate to sync with server
 *
 * Query hooks integrate with useBroadcastInvalidation for real-time updates.
 *
 * For entities with syncMode: 'realtime' (local_first: true):
 * - Mutations emit broadcast events to notify other tabs/clients
 * - Query hooks subscribe to broadcasts and auto-invalidate
 *
 * Output structure:
 *   hooks/
 *     accounts.ts   - useAccounts(), useAccount(), useCreateAccount(), etc.
 *     keys.ts       - Query key factories
 *     index.ts      - Re-exports all
 */

import type {
  EntityModel,
  EntityDefinition,
} from './entity-model.js'

export interface GeneratedHooks {
  /** Entity hook files keyed by entity name */
  entities: Map<string, string>
  /** Query keys file */
  keys: string
  /** Index file with exports */
  index: string
}

export interface HookGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
  /** Enable optimistic mutations (default: true) */
  optimisticMutations?: boolean
  /** Enable broadcast integration for query hooks (default: true) */
  broadcastIntegration?: boolean
  /** Enable broadcast emission on mutations for realtime entities (default: true) */
  broadcastOnMutations?: boolean
  /**
   * Import path for runtime utilities (useBroadcastInvalidation, useBroadcast).
   * Default: '@pattern-stack/sync-patterns/runtime'
   * Set to relative path if copying runtime to generated output.
   */
  runtimeImportPath?: string
}

const DEFAULT_OPTIONS: Required<HookGeneratorOptions> = {
  includeJSDoc: true,
  optimisticMutations: true,
  broadcastIntegration: true,
  broadcastOnMutations: true,
  runtimeImportPath: '@pattern-stack/sync-patterns/runtime',
}

export class HookGenerator {
  private options: Required<HookGeneratorOptions>

  constructor(options: HookGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(model: EntityModel): GeneratedHooks {
    const entities = new Map<string, string>()

    for (const [name, entity] of model.entities) {
      const code = this.generateEntityHooks(entity)
      entities.set(name, code)
    }

    return {
      entities,
      keys: this.generateQueryKeys(model),
      index: this.generateIndex(model),
    }
  }

  /**
   * Generate hooks for a single entity
   */
  private generateEntityHooks(entity: EntityDefinition): string {
    const lines: string[] = []
    const { pascalName } = entity

    // File header
    lines.push(this.generateFileHeader(pascalName))
    lines.push('')

    // Imports
    lines.push(this.generateImports(entity))
    lines.push('')

    // Query hooks
    if (entity.operations.list) {
      lines.push(this.generateListHook(entity))
      lines.push('')
    }

    if (entity.operations.get) {
      lines.push(this.generateGetHook(entity))
      lines.push('')
    }

    // ListWithMeta hook
    if (entity.metadataOperation && entity.operations.list) {
      lines.push(this.generateListWithMetaHook(entity))
      lines.push('')
    }

    // Mutation hooks - only generate if schemas are available
    if (entity.operations.create && this.hasCreateSchemas(entity)) {
      lines.push(this.generateCreateMutation(entity))
      lines.push('')
    }

    if (entity.operations.update && this.hasUpdateSchemas(entity)) {
      lines.push(this.generateUpdateMutation(entity))
      lines.push('')
    }

    if (entity.operations.delete) {
      lines.push(this.generateDeleteMutation(entity))
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Generate file header
   */
  private generateFileHeader(entityName: string): string {
    return `/**
 * ${entityName} Hooks
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 */`
  }

  /**
   * Generate import statements
   */
  private generateImports(entity: EntityDefinition): string {
    const imports: string[] = []

    // Check if this entity needs broadcast for mutations (realtime/local_first mode)
    const needsBroadcastForMutations = this.options.broadcastOnMutations &&
      entity.syncMode === 'realtime' &&
      (entity.operations.create || entity.operations.update || entity.operations.delete)

    // TanStack Query imports
    const queryImports: string[] = ['useQueryClient']
    if (entity.operations.list || entity.operations.get) {
      queryImports.push('useQuery', 'type UseQueryResult')
    }
    if (entity.operations.create || entity.operations.update || entity.operations.delete) {
      queryImports.push('useMutation', 'type UseMutationResult')
    }

    imports.push(`import { ${queryImports.join(', ')} } from '@tanstack/react-query'`)

    // API layer import
    imports.push(`import { ${entity.name}Api } from '../api/${entity.name}.js'`)

    // Query keys import
    imports.push(`import { queryKeys } from './keys.js'`)

    // Broadcast invalidation hook import (when broadcast integration is enabled for queries)
    if (this.options.broadcastIntegration && (entity.operations.list || entity.operations.get)) {
      imports.push(`import { useBroadcastInvalidation } from '${this.options.runtimeImportPath}'`)
    }

    // Broadcast hook for emitting events on mutations (realtime mode entities)
    if (needsBroadcastForMutations) {
      imports.push(`import { useBroadcast } from '${this.options.runtimeImportPath}'`)
    }

    // Type imports
    const types: Set<string> = new Set()
    if (entity.schemas.item) types.add(entity.schemas.item)
    if (entity.schemas.listResponse) types.add(entity.schemas.listResponse)
    if (entity.schemas.createRequest) types.add(entity.schemas.createRequest)
    if (entity.schemas.updateRequest) types.add(entity.schemas.updateRequest)

    if (types.size > 0) {
      const typeList = Array.from(types).sort().join(', ')
      imports.push(`import type { ${typeList} } from '../schemas/index.js'`)
    }

    return imports.join('\n')
  }

  /**
   * Generate list query hook
   */
  private generateListHook(entity: EntityDefinition): string {
    const { pascalName, name, singular } = entity
    const pluralName = `${pascalName}s`
    const returnType = entity.schemas.listResponse || `${pascalName}[]`

    // Derive broadcast channel from entity singular name
    const broadcastChannel = singular

    if (this.options.broadcastIntegration) {
      const jsdoc = this.options.includeJSDoc
        ? `/**
 * Fetch all ${name} with broadcast auto-refresh
 *
 * @param options.autoRefresh - Enable auto-refresh on broadcast (default: true)
 *
 * @example
 * const { data, isLoading, error } = use${pluralName}()
 * // Disable auto-refresh while editing
 * const { data } = use${pluralName}({ autoRefresh: false })
 */
`
        : ''

      return `interface Use${pluralName}Options {
  /** Enable auto-refresh on broadcast (default: true) */
  autoRefresh?: boolean
}

${jsdoc}export function use${pluralName}(options: Use${pluralName}Options = {}): UseQueryResult<${returnType}> {
  const { autoRefresh = true } = options

  // Subscribe to broadcast for cache invalidation
  useBroadcastInvalidation({
    channel: '${broadcastChannel}',
    queryKeyPrefix: queryKeys.${name}.all,
    enabled: autoRefresh,
  })

  return useQuery({
    queryKey: queryKeys.${name}.all,
    queryFn: () => ${name}Api.list(),
  })
}`
    }

    // Non-broadcast version (backward compatible)
    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Fetch all ${name}
 *
 * @example
 * const { data, isLoading, error } = use${pluralName}()
 */
`
      : ''

    return `${jsdoc}export function use${pluralName}(): UseQueryResult<${returnType}> {
  return useQuery({
    queryKey: queryKeys.${name}.all,
    queryFn: () => ${name}Api.list(),
  })
}`
  }

  /**
   * Generate get query hook
   */
  private generateGetHook(entity: EntityDefinition): string {
    const { pascalName, name, singular } = entity
    const returnType = entity.schemas.item || pascalName

    // Derive broadcast channel from entity singular name
    const broadcastChannel = singular

    if (this.options.broadcastIntegration) {
      const jsdoc = this.options.includeJSDoc
        ? `/**
 * Fetch a single ${singular} by ID with broadcast auto-refresh
 *
 * @param id - The ${singular} ID
 * @param options.autoRefresh - Enable auto-refresh on broadcast (default: true)
 *
 * @example
 * const { data, isLoading, error } = use${pascalName}(id)
 * // Disable auto-refresh while editing
 * const { data } = use${pascalName}(id, { autoRefresh: false })
 */
`
        : ''

      return `interface Use${pascalName}Options {
  /** Enable auto-refresh on broadcast (default: true) */
  autoRefresh?: boolean
}

${jsdoc}export function use${pascalName}(id: string, options: Use${pascalName}Options = {}): UseQueryResult<${returnType}> {
  const { autoRefresh = true } = options

  // Subscribe to broadcast for cache invalidation
  useBroadcastInvalidation({
    channel: '${broadcastChannel}',
    queryKeyPrefix: queryKeys.${name}.detail(id),
    enabled: autoRefresh && !!id,
  })

  return useQuery({
    queryKey: queryKeys.${name}.detail(id),
    queryFn: () => ${name}Api.get(id),
    enabled: !!id,
  })
}`
    }

    // Non-broadcast version (backward compatible)
    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Fetch a single ${singular} by ID
 *
 * @param id - The ${singular} ID
 *
 * @example
 * const { data, isLoading, error } = use${pascalName}(id)
 */
`
      : ''

    return `${jsdoc}export function use${pascalName}(id: string): UseQueryResult<${returnType}> {
  return useQuery({
    queryKey: queryKeys.${name}.detail(id),
    queryFn: () => ${name}Api.get(id),
    enabled: !!id,
  })
}`
  }

  /**
   * Generate listWithMeta hook
   */
  private generateListWithMetaHook(entity: EntityDefinition): string {
    const { pascalName, name } = entity
    const pluralName = `${pascalName}s`

    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Fetch all ${name} with column metadata
 *
 * Combines data and metadata queries for table rendering.
 * Returns isReady when both are loaded.
 *
 * @example
 * const { data, columns, isReady } = use${pluralName}WithMeta()
 */
`
      : ''

    return `${jsdoc}export function use${pluralName}WithMeta(view: 'list' | 'detail' | 'form' = 'list') {
  const dataQuery = use${pluralName}()

  const metadataQuery = useQuery({
    queryKey: [...queryKeys.${name}.all, 'metadata', view],
    queryFn: async () => {
      const result = await ${name}Api.listWithMeta(view)
      return result.columns
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  })

  return {
    data: dataQuery.data,
    columns: metadataQuery.data ?? [],
    isLoading: dataQuery.isLoading,
    isLoadingMetadata: metadataQuery.isLoading,
    error: dataQuery.error,
    metadataError: metadataQuery.error,
    isReady: !dataQuery.isLoading && !metadataQuery.isLoading,
    refetch: dataQuery.refetch,
  }
}`
  }

  /**
   * Generate create mutation hook
   */
  private generateCreateMutation(entity: EntityDefinition): string {
    const { pascalName, name, singular } = entity
    const requestType = entity.schemas.createRequest || `${pascalName}Create`
    const returnType = entity.schemas.item || pascalName
    const listType = entity.schemas.listResponse || `${pascalName}[]`

    // Check if this entity needs broadcast on mutations (realtime/local_first mode)
    const emitBroadcast = this.options.broadcastOnMutations && entity.syncMode === 'realtime'

    if (this.options.optimisticMutations) {
      const jsdoc = this.options.includeJSDoc
        ? `/**
 * Create a new ${singular} with optimistic update
 *
 * The UI updates instantly before the API confirms. On error, changes are rolled back.
 * ${emitBroadcast ? 'Broadcasts the change to other tabs/clients for real-time sync.' : ''}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useCreate${pascalName}()
 * await mutateAsync(data)
 */
`
        : ''

      // Context type for optimistic mutations
      const contextType = `{ previousData: ${listType} | undefined }`

      // Build the broadcast setup if needed
      const broadcastSetup = emitBroadcast
        ? `  const { emit } = useBroadcast()\n`
        : ''

      // Build the onSuccess handler with optional broadcast
      const onSuccessHandler = emitBroadcast
        ? `
    // Broadcast create event to other tabs/clients
    onSuccess: (createdEntity) => {
      emit('${singular}', {
        type: 'created',
        entity_id: (createdEntity as { id: string }).id,
      })
    },`
        : ''

      return `${jsdoc}export function useCreate${pascalName}(): UseMutationResult<${returnType}, Error, ${requestType}, ${contextType}> {
  const queryClient = useQueryClient()
${broadcastSetup}
  return useMutation({
    mutationFn: (data: ${requestType}) => ${name}Api.create(data),

    // Optimistic update - runs BEFORE API call
    onMutate: async (newData) => {
      // Cancel in-flight fetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: queryKeys.${name}.all })

      // Snapshot for rollback
      const previousData = queryClient.getQueryData<${listType}>(queryKeys.${name}.all)

      // Optimistically add to list with temp ID
      queryClient.setQueryData<${listType}>(queryKeys.${name}.all, (old) => {
        if (!old) return old
        const tempItem = {
          ...newData,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        } as unknown as ${returnType}
        // Handle both array and paginated response formats
        if (Array.isArray(old)) {
          return [...old, tempItem] as ${listType}
        }
        if ('items' in old && Array.isArray((old as { items: unknown[] }).items)) {
          return {
            ...old,
            items: [...(old as { items: ${returnType}[] }).items, tempItem],
          } as ${listType}
        }
        return old
      })

      return { previousData }
    },

    // Rollback on error
    onError: (_err, _newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.${name}.all, context.previousData)
      }
    },
${onSuccessHandler}
    // Sync with server response
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
    },
  })
}`
    }

    // Non-optimistic version (backward compatible)
    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Create a new ${singular}
 * ${emitBroadcast ? 'Broadcasts the change to other tabs/clients for real-time sync.' : ''}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useCreate${pascalName}()
 * await mutateAsync(data)
 */
`
      : ''

    // Build the broadcast setup if needed
    const broadcastSetup = emitBroadcast
      ? `  const { emit } = useBroadcast()\n`
      : ''

    // Build the onSuccess handler with optional broadcast
    const onSuccessContent = emitBroadcast
      ? `(createdEntity) => {
      // Broadcast create event to other tabs/clients
      emit('${singular}', {
        type: 'created',
        entity_id: (createdEntity as { id: string }).id,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
    }`
      : `() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
    }`

    return `${jsdoc}export function useCreate${pascalName}(): UseMutationResult<${returnType}, Error, ${requestType}> {
  const queryClient = useQueryClient()
${broadcastSetup}
  return useMutation({
    mutationFn: (data: ${requestType}) => ${name}Api.create(data),
    onSuccess: ${onSuccessContent},
  })
}`
  }

  /**
   * Generate update mutation hook
   */
  private generateUpdateMutation(entity: EntityDefinition): string {
    const { pascalName, name, singular } = entity
    const requestType = entity.schemas.updateRequest || `${pascalName}Update`
    const returnType = entity.schemas.item || pascalName

    // Check if this entity needs broadcast on mutations (realtime/local_first mode)
    const emitBroadcast = this.options.broadcastOnMutations && entity.syncMode === 'realtime'

    if (this.options.optimisticMutations) {
      const jsdoc = this.options.includeJSDoc
        ? `/**
 * Update an existing ${singular} with optimistic update
 *
 * The UI updates instantly before the API confirms. On error, changes are rolled back.
 * ${emitBroadcast ? 'Broadcasts the change to other tabs/clients for real-time sync.' : ''}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useUpdate${pascalName}()
 * await mutateAsync({ id, data })
 */
`
        : ''

      // Context type for optimistic mutations
      const contextType = `{ previousData: ${returnType} | undefined }`

      // Build the broadcast setup if needed
      const broadcastSetup = emitBroadcast
        ? `  const { emit } = useBroadcast()\n`
        : ''

      // Build the onSuccess handler with optional broadcast
      const onSuccessHandler = emitBroadcast
        ? `
    // Broadcast update event to other tabs/clients
    onSuccess: (_, { id }) => {
      emit('${singular}', {
        type: 'updated',
        entity_id: id,
      })
    },`
        : ''

      return `${jsdoc}export function useUpdate${pascalName}(): UseMutationResult<${returnType}, Error, { id: string; data: ${requestType} }, ${contextType}> {
  const queryClient = useQueryClient()
${broadcastSetup}
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ${requestType} }) => ${name}Api.update(id, data),

    // Optimistic update - runs BEFORE API call
    onMutate: async ({ id, data }) => {
      // Cancel in-flight fetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: queryKeys.${name}.detail(id) })

      // Snapshot for rollback
      const previousData = queryClient.getQueryData<${returnType}>(queryKeys.${name}.detail(id))

      // Optimistically update the entity
      queryClient.setQueryData<${returnType}>(queryKeys.${name}.detail(id), (old) => {
        if (!old) return old
        return {
          ...old,
          ...data,
          updated_at: new Date().toISOString(),
        }
      })

      return { previousData }
    },

    // Rollback on error
    onError: (_err, { id }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.${name}.detail(id), context.previousData)
      }
    },
${onSuccessHandler}
    // Sync with server response
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.detail(id) })
    },
  })
}`
    }

    // Non-optimistic version (backward compatible)
    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Update an existing ${singular}
 * ${emitBroadcast ? 'Broadcasts the change to other tabs/clients for real-time sync.' : ''}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useUpdate${pascalName}()
 * await mutateAsync({ id, data })
 */
`
      : ''

    // Build the broadcast setup if needed
    const broadcastSetup = emitBroadcast
      ? `  const { emit } = useBroadcast()\n`
      : ''

    // Build the onSuccess handler with optional broadcast
    const onSuccessContent = emitBroadcast
      ? `(_, { id }) => {
      // Broadcast update event to other tabs/clients
      emit('${singular}', {
        type: 'updated',
        entity_id: id,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.detail(id) })
    }`
      : `(_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.detail(id) })
    }`

    return `${jsdoc}export function useUpdate${pascalName}(): UseMutationResult<${returnType}, Error, { id: string; data: ${requestType} }> {
  const queryClient = useQueryClient()
${broadcastSetup}
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ${requestType} }) => ${name}Api.update(id, data),
    onSuccess: ${onSuccessContent},
  })
}`
  }

  /**
   * Generate delete mutation hook
   */
  private generateDeleteMutation(entity: EntityDefinition): string {
    const { pascalName, name, singular } = entity
    const returnType = entity.schemas.item || pascalName
    const listType = entity.schemas.listResponse || `${pascalName}[]`

    // Check if this entity needs broadcast on mutations (realtime/local_first mode)
    const emitBroadcast = this.options.broadcastOnMutations && entity.syncMode === 'realtime'

    if (this.options.optimisticMutations) {
      const jsdoc = this.options.includeJSDoc
        ? `/**
 * Delete a ${singular} with optimistic update
 *
 * The UI removes the item instantly before the API confirms. On error, it is restored.
 * ${emitBroadcast ? 'Broadcasts the change to other tabs/clients for real-time sync.' : ''}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useDelete${pascalName}()
 * await mutateAsync(id)
 */
`
        : ''

      // Context type for optimistic mutations
      const contextType = `{ previousData: ${listType} | undefined }`

      // Build the broadcast setup if needed
      const broadcastSetup = emitBroadcast
        ? `  const { emit } = useBroadcast()\n`
        : ''

      // Build the onSuccess handler with optional broadcast
      const onSuccessHandler = emitBroadcast
        ? `
    // Broadcast delete event to other tabs/clients
    onSuccess: (_, id) => {
      emit('${singular}', {
        type: 'deleted',
        entity_id: id,
      })
    },`
        : ''

      return `${jsdoc}export function useDelete${pascalName}(): UseMutationResult<void, Error, string, ${contextType}> {
  const queryClient = useQueryClient()
${broadcastSetup}
  return useMutation({
    mutationFn: (id: string) => ${name}Api.delete(id),

    // Optimistic update - runs BEFORE API call
    onMutate: async (id) => {
      // Cancel in-flight fetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: queryKeys.${name}.all })

      // Snapshot for rollback
      const previousData = queryClient.getQueryData<${listType}>(queryKeys.${name}.all)

      // Optimistically remove from list
      queryClient.setQueryData<${listType}>(queryKeys.${name}.all, (old) => {
        if (!old) return old
        // Handle both array and paginated response formats
        if (Array.isArray(old)) {
          return old.filter((item: ${returnType}) => (item as { id: string }).id !== id) as ${listType}
        }
        if ('items' in old && Array.isArray((old as { items: unknown[] }).items)) {
          return {
            ...old,
            items: (old as { items: ${returnType}[] }).items.filter(
              (item: ${returnType}) => (item as { id: string }).id !== id
            ),
          } as ${listType}
        }
        return old
      })

      // Remove individual query
      queryClient.removeQueries({ queryKey: queryKeys.${name}.detail(id) })

      return { previousData }
    },

    // Rollback on error
    onError: (_err, _id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.${name}.all, context.previousData)
      }
    },
${onSuccessHandler}
    // Sync with server response
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
    },
  })
}`
    }

    // Non-optimistic version (backward compatible)
    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Delete a ${singular}
 * ${emitBroadcast ? 'Broadcasts the change to other tabs/clients for real-time sync.' : ''}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useDelete${pascalName}()
 * await mutateAsync(id)
 */
`
      : ''

    // Build the broadcast setup if needed
    const broadcastSetup = emitBroadcast
      ? `  const { emit } = useBroadcast()\n`
      : ''

    // Build the onSuccess handler with optional broadcast
    const onSuccessContent = emitBroadcast
      ? `(_, id) => {
      // Broadcast delete event to other tabs/clients
      emit('${singular}', {
        type: 'deleted',
        entity_id: id,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.removeQueries({ queryKey: queryKeys.${name}.detail(id) })
    }`
      : `(_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.removeQueries({ queryKey: queryKeys.${name}.detail(id) })
    }`

    return `${jsdoc}export function useDelete${pascalName}(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
${broadcastSetup}
  return useMutation({
    mutationFn: (id: string) => ${name}Api.delete(id),
    onSuccess: ${onSuccessContent},
  })
}`
  }

  // ===========================================================================
  // Schema Availability Checks
  // ===========================================================================

  /**
   * Check if entity has schemas required for create operation
   */
  private hasCreateSchemas(entity: EntityDefinition): boolean {
    const op = entity.operations.create
    if (!op) return false
    // Must have request schema (what to send) and response schema (what we get back)
    const hasRequest = !!(entity.schemas.createRequest || op.requestSchema?.name)
    const hasResponse = !!(entity.schemas.item || op.responseSchema?.name)
    return hasRequest && hasResponse
  }

  /**
   * Check if entity has schemas required for update operation
   */
  private hasUpdateSchemas(entity: EntityDefinition): boolean {
    const op = entity.operations.update
    if (!op) return false
    // Must have request schema and response schema
    const hasRequest = !!(entity.schemas.updateRequest || op.requestSchema?.name)
    const hasResponse = !!(entity.schemas.item || op.responseSchema?.name)
    return hasRequest && hasResponse
  }

  // ===========================================================================
  // Output Generators
  // ===========================================================================

  /**
   * Generate query keys file
   */
  private generateQueryKeys(model: EntityModel): string {
    const lines: string[] = []

    lines.push(`/**
 * Query Keys
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 *
 * Centralized query key factories for cache management.
 */
`)

    lines.push('export const queryKeys = {')

    for (const [name] of model.entities) {
      lines.push(`  ${name}: {`)
      lines.push(`    all: ['${name}'] as const,`)
      lines.push(`    detail: (id: string) => ['${name}', id] as const,`)
      lines.push(`  },`)
    }

    lines.push('}')

    return lines.join('\n')
  }

  /**
   * Generate index file
   */
  private generateIndex(model: EntityModel): string {
    const exports: string[] = []

    exports.push(`/**
 * Hooks Module
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 */
`)

    // Export query keys
    exports.push("export { queryKeys } from './keys.js'")
    exports.push('')

    // Export hooks from each entity
    for (const [name, entity] of model.entities) {
      const hookNames: string[] = []

      if (entity.operations.list) {
        hookNames.push(`use${entity.pascalName}s`)
      }
      if (entity.operations.get) {
        hookNames.push(`use${entity.pascalName}`)
      }
      if (entity.metadataOperation && entity.operations.list) {
        hookNames.push(`use${entity.pascalName}sWithMeta`)
      }
      if (entity.operations.create && this.hasCreateSchemas(entity)) {
        hookNames.push(`useCreate${entity.pascalName}`)
      }
      if (entity.operations.update && this.hasUpdateSchemas(entity)) {
        hookNames.push(`useUpdate${entity.pascalName}`)
      }
      if (entity.operations.delete) {
        hookNames.push(`useDelete${entity.pascalName}`)
      }

      if (hookNames.length > 0) {
        exports.push(`export { ${hookNames.join(', ')} } from './${name}.js'`)
      }
    }

    return exports.join('\n')
  }
}
