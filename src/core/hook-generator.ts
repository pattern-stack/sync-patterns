/**
 * Hook Generator
 *
 * Generates React hooks that wrap the API layer.
 * Uses TanStack Query for data fetching and caching.
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
}

const DEFAULT_OPTIONS: Required<HookGeneratorOptions> = {
  includeJSDoc: true,
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

    // Mutation hooks
    if (entity.operations.create) {
      lines.push(this.generateCreateMutation(entity))
      lines.push('')
    }

    if (entity.operations.update) {
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
    const { pascalName, name } = entity
    const pluralName = `${pascalName}s`
    const returnType = entity.schemas.listResponse || `${pascalName}[]`

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
    const listType = entity.schemas.listResponse || `${pascalName}[]`

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

    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Create a new ${singular}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useCreate${pascalName}()
 * await mutateAsync(data)
 */
`
      : ''

    return `${jsdoc}export function useCreate${pascalName}(): UseMutationResult<${returnType}, Error, ${requestType}> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ${requestType}) => ${name}Api.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
    },
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

    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Update an existing ${singular}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useUpdate${pascalName}()
 * await mutateAsync({ id, data })
 */
`
      : ''

    return `${jsdoc}export function useUpdate${pascalName}(): UseMutationResult<${returnType}, Error, { id: string; data: ${requestType} }> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ${requestType} }) => ${name}Api.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.detail(id) })
    },
  })
}`
  }

  /**
   * Generate delete mutation hook
   */
  private generateDeleteMutation(entity: EntityDefinition): string {
    const { pascalName, name, singular } = entity

    const jsdoc = this.options.includeJSDoc
      ? `/**
 * Delete a ${singular}
 *
 * @example
 * const { mutate, mutateAsync, isPending } = useDelete${pascalName}()
 * await mutateAsync(id)
 */
`
      : ''

    return `${jsdoc}export function useDelete${pascalName}(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => ${name}Api.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.${name}.all })
      queryClient.removeQueries({ queryKey: queryKeys.${name}.detail(id) })
    },
  })
}`
  }

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
      if (entity.operations.create) {
        hookNames.push(`useCreate${entity.pascalName}`)
      }
      if (entity.operations.update) {
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
