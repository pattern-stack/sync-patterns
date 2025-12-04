/**
 * React Hook Generator
 *
 * Generates React hooks with TanStack Query integration for API endpoints
 * with proper TypeScript typing and error/loading states.
 *
 * Migrated from frontend-patterns to sync-patterns
 *
 * Uses shared naming utilities for consistent naming with client generator.
 * This ensures hooks call the correct client methods.
 */

import type {
  ParsedOpenAPI,
  ParsedEndpoint,
  ParsedParameter,
} from './parser.js'
import { BulkHookGenerator } from './bulk-hook-generator.js'
import { isBulkOperation } from './bulk-types.js'
import {
  getEndpointNames,
  extractResourceFromPath,
} from './naming.js'

export interface HookGeneratorOptions {
  queryKeyPrefix?: string
  includeInfiniteQueries?: boolean
  includeOptimisticUpdates?: boolean
  includeMutationHelpers?: boolean
  authenticationRequired?: boolean
  errorHandling?: 'throw' | 'return' | 'callback'
}

export interface GeneratedHooks {
  queries: string
  mutations: string
  keys: string
  types: string
  index: string
}

export class ReactHookGenerator {
  private options: Required<HookGeneratorOptions>
  private bulkHookGenerator: BulkHookGenerator

  constructor(options: HookGeneratorOptions = {}) {
    this.options = {
      queryKeyPrefix: options.queryKeyPrefix || 'api',
      includeInfiniteQueries: options.includeInfiniteQueries !== false,
      includeOptimisticUpdates: options.includeOptimisticUpdates !== false,
      includeMutationHelpers: options.includeMutationHelpers ?? true,
      authenticationRequired: options.authenticationRequired ?? true,
      errorHandling: options.errorHandling || 'throw',
    }

    this.bulkHookGenerator = new BulkHookGenerator()
  }

  /**
   * Extract resource name from path (uses shared utility)
   */
  private extractResourceName(path: string): string | null {
    const resource = extractResourceFromPath(path)
    return resource === 'default' ? null : resource
  }

  async generate(parsedAPI: ParsedOpenAPI): Promise<GeneratedHooks> {
    const endpoints = parsedAPI.endpoints

    return {
      queries: this.generateQueryHooks(endpoints),
      mutations: this.generateMutationHooks(endpoints),
      keys: this.generateQueryKeys(endpoints),
      types: this.generateHookTypes(endpoints),
      index: this.generateIndexFile(),
    }
  }

  private generateQueryHooks(endpoints: ParsedEndpoint[]): string {
    const hooks: string[] = []

    hooks.push(this.generateFileHeader('Query Hooks'))
    hooks.push('')

    // Only import useInfiniteQuery and UseInfiniteQueryOptions if we're generating infinite queries
    const hasInfiniteQueries =
      this.options.includeInfiniteQueries &&
      endpoints.some((e) => e.method === 'get' && this.isListEndpoint(e))

    if (hasInfiniteQueries) {
      hooks.push(
        "import { useQuery, useInfiniteQuery, type UseQueryOptions, type UseInfiniteQueryOptions } from '@tanstack/react-query'",
      )
    } else {
      hooks.push(
        "import { useQuery, type UseQueryOptions } from '@tanstack/react-query'",
      )
    }
    hooks.push("import { apiClient } from '../client/index'")
    hooks.push("import { queryKeys } from './keys'")
    hooks.push('')

    // Filter GET endpoints for queries
    const queryEndpoints = endpoints.filter((endpoint) => endpoint.method === 'get')

    // Track generated hook names to avoid duplicates
    const generatedHooks = new Map<string, ParsedEndpoint>()

    for (const endpoint of queryEndpoints) {
      let hookName = this.generateQueryHookName(endpoint)

      // If we've already generated this hook, add suffix to differentiate
      if (generatedHooks.has(hookName)) {
        const existingEndpoint = generatedHooks.get(hookName)!

        // Determine which endpoint should get a suffix based on the path
        const existingIsSimpler =
          existingEndpoint.path.split('/').filter((s) => !s.startsWith('{')).length <
          endpoint.path.split('/').filter((s) => !s.startsWith('{')).length

        if (existingIsSimpler) {
          // Current endpoint needs a suffix
          const suffix = endpoint.path.includes('/{subcategory_id}') ? 'Single' : 'List'
          hookName = `${hookName}${suffix}`
        } else {
          // Need to rename the existing hook that we already added
          const existingSuffix = existingEndpoint.path.includes('/{subcategory_id}')
            ? 'Single'
            : 'List'
          const existingHookName = hookName
          const newExistingHookName = `${existingHookName}${existingSuffix}`

          // Find and update the existing hook in our output
          for (let i = hooks.length - 1; i >= 0; i--) {
            const currentLine = hooks[i]
            if (currentLine && currentLine.includes(`function ${existingHookName}(`)) {
              hooks[i] = currentLine.replace(
                `function ${existingHookName}(`,
                `function ${newExistingHookName}(`,
              )
              // Also update the JSDoc if it references the hook name
              const prevLine = hooks[i - 1]
              if (i > 0 && prevLine && prevLine.includes(`${existingHookName}`)) {
                hooks[i - 1] = prevLine.replace(
                  existingHookName,
                  newExistingHookName,
                )
              }
              break
            }
          }

          // Update our tracking map
          generatedHooks.delete(existingHookName)
          generatedHooks.set(newExistingHookName, existingEndpoint)
        }
      }

      generatedHooks.set(hookName, endpoint)

      const hook = this.generateQueryHook(endpoint, hookName)
      hooks.push(hook)
      hooks.push('')

      // Generate infinite query version if applicable
      if (this.options.includeInfiniteQueries && this.isListEndpoint(endpoint)) {
        const infiniteHook = this.generateInfiniteQueryHook(endpoint, hookName)
        hooks.push(infiniteHook)
        hooks.push('')
      }
    }

    return hooks.join('\n')
  }

  private generateQueryHook(endpoint: ParsedEndpoint, hookName: string): string {
    const operationName = this.getOperationName(endpoint)
    const hasParams = this.hasRequiredParams(endpoint)

    const lines: string[] = []

    // Generate JSDoc
    lines.push('/**')
    if (endpoint.summary) {
      lines.push(` * ${endpoint.summary}`)
    }
    if (endpoint.description) {
      lines.push(` * ${endpoint.description}`)
    }
    lines.push(
      ` * @param ${hasParams ? 'params' : 'options'} ${hasParams ? 'Request parameters' : 'Query options'}`,
    )
    lines.push(' */')

    // Generate hook signature
    const paramType = hasParams ? this.generateParamType(endpoint) : ''
    const params = hasParams
      ? `params: ${paramType}, options?: UseQueryOptions<unknown, unknown, unknown>`
      : 'options?: UseQueryOptions<unknown, unknown, unknown>'

    lines.push(`export function ${hookName}(${params}) {`)

    // Generate hook body
    // Extract the query key name from the hook name
    // Remove 'use' prefix, and also remove 'Get' prefix to match key generation
    let queryKeyName = hookName.replace(/^use/, '')
    // Strip leading 'Get' to match query key generator which does the same
    queryKeyName = queryKeyName.replace(/^Get/, '')
    const queryKeyNameCamelCase =
      queryKeyName.charAt(0).toLowerCase() + queryKeyName.slice(1)

    const queryKeyCall = hasParams
      ? `queryKeys.${queryKeyNameCamelCase}(params)`
      : `queryKeys.${queryKeyNameCamelCase}()`

    // For API calls, destructure params to pass individual path params
    const pathParams = endpoint.parameters.filter((p) => p.in === 'path')
    const queryParams = endpoint.parameters.filter((p) => p.in === 'query')
    const hasPathParams = pathParams.length > 0
    const hasQueryParams = queryParams.length > 0

    let apiCall: string
    if (hasParams) {
      if (hasPathParams && !hasQueryParams) {
        // Only path params - destructure and pass individually
        const pathParamNames = pathParams.map((p) => p.name)
        const pathParamSpread = pathParamNames.map((n) => `params.${n}`).join(', ')
        apiCall = `() => apiClient.${this.camelCase(operationName)}(${pathParamSpread})`
      } else if (hasPathParams && hasQueryParams) {
        // Both path and query params - destructure path params, pass query as options
        const pathParamNames = pathParams.map((p) => p.name)
        const pathParamSpread = pathParamNames.map((n) => `params.${n}`).join(', ')
        apiCall = `() => apiClient.${this.camelCase(operationName)}(${pathParamSpread}, params)`
      } else {
        // Only query params - pass as options
        apiCall = `() => apiClient.${this.camelCase(operationName)}(params)`
      }
    } else {
      apiCall = `() => apiClient.${this.camelCase(operationName)}()`
    }

    lines.push('  return useQuery({')
    lines.push(`    queryKey: ${queryKeyCall},`)
    lines.push(`    queryFn: ${apiCall},`)

    // Note: Authentication is handled by the API client interceptors
    // If you need to disable queries when not authenticated, use:
    // enabled: !!user && (options?.enabled ?? true) in your component

    lines.push('    ...options')
    lines.push('  })')
    lines.push('}')

    return lines.join('\n')
  }

  private generateInfiniteQueryHook(
    endpoint: ParsedEndpoint,
    baseHookName: string,
  ): string {
    const hookName = baseHookName.replace('use', 'useInfinite')
    const operationName = this.getOperationName(endpoint)

    const lines: string[] = []

    lines.push('/**')
    lines.push(` * Infinite query version of ${baseHookName}`)
    lines.push(' * @deprecated Consider using regular pagination with useQuery instead')
    lines.push(' */')

    const paramType = this.generateParamType(endpoint)

    // Extract the query key name from the hook name
    // Remove 'use' prefix, and also remove 'Get' prefix to match key generation
    let queryKeyName = baseHookName.replace(/^use/, '')
    queryKeyName = queryKeyName.replace(/^Get/, '')
    const queryKeyNameCamelCase =
      queryKeyName.charAt(0).toLowerCase() + queryKeyName.slice(1)

    // Determine if the query key function requires params
    const keyNeedsParams = this.hasRequiredParams(endpoint)

    // TanStack Query v5 signature: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
    // Using 'unknown' for data types and 'number' for page param
    lines.push(
      `export function ${hookName}(params: ${paramType}, options?: Omit<UseInfiniteQueryOptions<unknown, Error, unknown, readonly unknown[], number>, 'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'>) {`,
    )
    lines.push('  return useInfiniteQuery({')
    // If the query key needs params, pass them; otherwise, spread into the array
    if (keyNeedsParams) {
      lines.push(
        `    queryKey: [...queryKeys.${queryKeyNameCamelCase}(params), 'infinite'] as const,`,
      )
    } else {
      lines.push(`    queryKey: [...queryKeys.${queryKeyNameCamelCase}(), params] as const,`)
    }
    lines.push(
      `    queryFn: ({ pageParam }) => apiClient.${this.camelCase(operationName)}({ ...params, page: pageParam }),`,
    )
    lines.push('    initialPageParam: 1,')
    lines.push('    getNextPageParam: (lastPage, _allPages, lastPageParam) => {')
    lines.push(
      '      // Default pagination: check for items array and compare to limit',
    )
    lines.push(
      '      const page = lastPage as { items?: unknown[]; total?: number } | null',
    )
    lines.push(
      '      const hasMore = page?.items && page.items.length > 0 && (page.total === undefined || page.items.length >= (params as { limit?: number }).limit!)',
    )
    lines.push(
      '      return hasMore ? lastPageParam + 1 : undefined',
    )
    lines.push('    },')
    lines.push('    ...options')
    lines.push('  })')
    lines.push('}')

    return lines.join('\n')
  }

  private generateMutationHooks(endpoints: ParsedEndpoint[]): string {
    const hooks: string[] = []

    hooks.push(this.generateFileHeader('Mutation Hooks'))
    hooks.push('')
    hooks.push(
      "import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'",
    )
    hooks.push("import { apiClient } from '../client/index'")
    hooks.push("import { queryKeys } from './keys'")

    // Only import bulk types if we have bulk operations
    const hasBulkOps = endpoints.some((e) => {
      const requestBody = e.requestBody
      return isBulkOperation(e.path, e.method, requestBody)
    })

    if (hasBulkOps) {
      hooks.push(
        "import type { BulkOperationRequest, BulkOperationResponse, BulkOperationProgress, BulkMutationOptions } from './types'",
      )
    }

    hooks.push('')

    // Filter non-GET endpoints for mutations
    const mutationEndpoints = endpoints.filter((endpoint) => endpoint.method !== 'get')

    // Track generated hook names to avoid duplicates
    const generatedHooks = new Map<string, ParsedEndpoint>()

    for (const endpoint of mutationEndpoints) {
      // Check if this is a bulk operation
      const requestBody = endpoint.requestBody
      const isBulk = isBulkOperation(endpoint.path, endpoint.method, requestBody)

      let hookName = this.generateMutationHookName(endpoint)

      // If we've already generated this hook, add suffix to differentiate
      if (generatedHooks.has(hookName)) {
        // Add method suffix to differentiate
        const methodSuffix =
          endpoint.method.charAt(0).toUpperCase() + endpoint.method.slice(1)
        hookName = `${hookName}${methodSuffix}`
      }

      generatedHooks.set(hookName, endpoint)

      // Generate appropriate hook based on type
      const hook = isBulk
        ? this.bulkHookGenerator.generateBulkMutationHook(
            endpoint,
            hookName,
            this.getOperationName(endpoint),
          )
        : this.generateMutationHook(endpoint, hookName)

      hooks.push(hook)
      hooks.push('')
    }

    return hooks.join('\n')
  }

  private generateMutationHook(endpoint: ParsedEndpoint, hookName: string): string {
    const operationName = this.getOperationName(endpoint)

    const lines: string[] = []

    // Generate JSDoc
    lines.push('/**')
    if (endpoint.summary) {
      lines.push(` * ${endpoint.summary}`)
    }
    if (endpoint.description) {
      lines.push(` * ${endpoint.description}`)
    }
    lines.push(' */')

    // Generate hook signature
    const mutationType = this.generateMutationType(endpoint)
    // TanStack Query v5: UseMutationOptions<TData, TError, TVariables, TContext>
    // Set TContext to match onMutate return type for proper type inference
    const contextType = this.options.includeOptimisticUpdates
      ? '{ previousData?: unknown }'
      : 'unknown'
    lines.push(
      `export function ${hookName}(options?: UseMutationOptions<unknown, unknown, ${mutationType}, ${contextType}>) {`,
    )
    lines.push('  const queryClient = useQueryClient()')
    lines.push('')
    lines.push('  return useMutation({')

    // Generate mutation function
    const pathParams = endpoint.parameters.filter((p) => p.in === 'path')
    const hasPathParams = pathParams.length > 0

    if (hasPathParams) {
      // Destructure pathParams object to pass individual params to client method
      const pathParamNames = pathParams.map((p) => p.name)
      const pathParamSpread = pathParamNames.join(', ')
      const pathParamDestructure = `{ ${pathParamNames.join(', ')} }`

      lines.push(`    mutationFn: ({ pathParams, ...data }) => {`)
      lines.push(`      const ${pathParamDestructure} = pathParams`)
      lines.push(
        `      return apiClient.${this.camelCase(operationName)}(${pathParamSpread}, { data })`,
      )
      lines.push(`    },`)
    } else {
      lines.push(
        `    mutationFn: (data) => apiClient.${this.camelCase(operationName)}({ data }),`,
      )
    }

    // Generate optimistic updates and cache invalidation
    if (this.options.includeOptimisticUpdates) {
      lines.push(this.generateOptimisticUpdate(endpoint))
    }

    lines.push(this.generateCacheInvalidation(endpoint))

    lines.push('    ...options')
    lines.push('  })')
    lines.push('}')

    return lines.join('\n')
  }

  private generateOptimisticUpdate(endpoint: ParsedEndpoint): string {
    const method = endpoint.method.toLowerCase()
    const rawResource = endpoint.tags?.[0] || 'default'
    const resource = this.sanitizeIdentifier(rawResource)
    const hasPathParams = endpoint.parameters.some((p) => p.in === 'path')

    switch (method) {
      case 'post':
        return `    onMutate: async (data: Record<string, unknown>) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.${resource}(), (old: unknown) => {
        if (Array.isArray(old)) {
          return [...old, data]
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`

      case 'put':
      case 'patch':
        if (hasPathParams) {
          return `    onMutate: async (variables: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Update specific item in cache
      const { pathParams, ...updateData } = variables as { pathParams?: Record<string, unknown>; [key: string]: unknown }
      const typedUpdateData = updateData as Record<string, unknown>
      queryClient.setQueryData(queryKeys.${resource}(), (old: unknown) => {
        if (Array.isArray(old)) {
          return old.map((item: unknown) => {
            const typedItem = item as Record<string, unknown>
            return typedItem.id === pathParams?.id || typedItem.id === pathParams?.${resource.slice(0, -1)}_id
              ? { ...typedItem, ...typedUpdateData }
              : item
          })
        }
        return old
      })

      return { previousData }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`
        }
        return `    onMutate: async (data: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Update cache with new data
      queryClient.setQueryData(queryKeys.${resource}(), data)

      return { previousData }
    },
    onError: (_error: unknown, _variables: Record<string, unknown>, context: { previousData?: unknown } | undefined) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`

      case 'delete':
        return `    onMutate: async (data: Record<string, unknown>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Remove item from cache
      queryClient.setQueryData(queryKeys.${resource}(), (old: unknown) => {
        if (Array.isArray(old)) {
          const idToDelete = (data.pathParams as Record<string, unknown>)?.id || (data.pathParams as Record<string, unknown>)?.${resource.slice(0, -1)}_id || data
          return old.filter((item: unknown) => (item as Record<string, unknown>).id !== idToDelete)
        }
        return old
      })

      return { previousData }
    },
    onError: (_error: unknown, _variables: Record<string, unknown>, context: { previousData?: unknown } | undefined) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`

      default:
        return ''
    }
  }

  private generateCacheInvalidation(endpoint: ParsedEndpoint): string {
    const relatedTags = this.getRelatedQueryTags(endpoint)

    return `    onSettled: () => {
      // Invalidate related queries
      ${relatedTags
        .map((tag) =>
          tag === 'all'
            ? `queryClient.invalidateQueries({ queryKey: queryKeys.all })`
            : `queryClient.invalidateQueries({ queryKey: queryKeys.${tag}() })`,
        )
        .join('\n      ')}
    },`
  }

  private generateQueryKeys(endpoints: ParsedEndpoint[]): string {
    const keys: string[] = []

    keys.push(this.generateFileHeader('Query Keys'))
    keys.push('')
    keys.push('/**')
    keys.push(' * Centralized query key factory')
    keys.push(' * Ensures consistent cache key generation across the application')
    keys.push(' */')
    keys.push('')
    keys.push('export const queryKeys = {')
    keys.push(`  all: ['${this.options.queryKeyPrefix}'] as const,`)
    keys.push('')

    // Group endpoints by resource/tag
    const groupedEndpoints = this.groupEndpointsByResource(endpoints)

    for (const [resource, resourceEndpoints] of Object.entries(groupedEndpoints)) {
      // Sanitize resource name to be a valid JS identifier
      const sanitizedResource = this.sanitizeIdentifier(resource)
      keys.push(`  // ${resource} keys`)
      keys.push(
        `  ${sanitizedResource}: () => [...queryKeys.all, '${sanitizedResource}'] as const,`,
      )

      // Track generated key names to avoid duplicates
      const generatedKeys = new Map<string, ParsedEndpoint>()

      for (const endpoint of resourceEndpoints) {
        if (endpoint.method !== 'get') continue

        const operationName = this.getOperationName(endpoint)
        let keyName = this.camelCase(operationName.replace(/^get/, ''))

        // Skip if keyName matches sanitizedResource (base key already handles this)
        if (keyName === sanitizedResource) {
          continue
        }

        // If we've already generated this key, add suffix to differentiate
        if (generatedKeys.has(keyName)) {
          // Extract the last path segment to use as a more unique suffix
          const pathSegments = endpoint.path
            .split('/')
            .filter((s) => s && !s.startsWith('{'))
          const lastSegment = pathSegments[pathSegments.length - 1]
          const uniqueSuffix = lastSegment
            ? lastSegment
                .split('-')
                .map((w, i) =>
                  i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1),
                )
                .join('')
            : 'Duplicate'

          // Capitalize first letter of suffix
          const capitalizedSuffix =
            uniqueSuffix.charAt(0).toUpperCase() + uniqueSuffix.slice(1)
          keyName = `${keyName}${capitalizedSuffix}`

          // If still duplicate after suffix, skip to avoid compilation error
          if (generatedKeys.has(keyName)) {
            continue
          }
        }

        generatedKeys.set(keyName, endpoint)

        if (this.hasRequiredParams(endpoint)) {
          keys.push(
            `  ${keyName}: (params: Record<string, unknown>) => [...queryKeys.${sanitizedResource}(), '${keyName}', params] as const,`,
          )
        } else {
          keys.push(
            `  ${keyName}: () => [...queryKeys.${sanitizedResource}(), '${keyName}'] as const,`,
          )
        }
      }
      keys.push('')
    }

    keys.push('}')

    return keys.join('\n')
  }

  private generateHookTypes(endpoints: ParsedEndpoint[]): string {
    const types: string[] = []

    types.push(this.generateFileHeader('Hook Types'))
    types.push('')
    types.push('// Bulk operation types (inlined for standalone generated code)')
    types.push(`export interface BulkOperationRequest<T = unknown> {
  items: T[]
  options?: { continueOnError?: boolean; batchSize?: number }
}

export interface BulkOperationResponse<T = unknown> {
  successful: T[]
  failed: Array<{ item: T; error: string }>
  total: number
  successCount: number
  failureCount: number
}

export interface BulkOperationProgress {
  completed: number
  total: number
  current?: unknown
}

export interface BulkMutationOptions {
  onProgress?: (progress: BulkOperationProgress) => void
}`)
    types.push('')

    // Track generated type names to avoid duplicates
    const generatedTypes = new Set<string>()

    // Generate parameter and response types for hooks
    for (const endpoint of endpoints) {
      const operationName = this.getOperationName(endpoint)

      if (this.hasRequiredParams(endpoint)) {
        const typeName = `${this.capitalize(operationName)}Params`
        if (!generatedTypes.has(typeName)) {
          generatedTypes.add(typeName)
          const paramType = this.generateParamType(endpoint)
          types.push(`export interface ${typeName} ${paramType}`)
          types.push('')
        }
      }

      if (endpoint.method !== 'get') {
        const typeName = `${this.capitalize(operationName)}Data`
        if (!generatedTypes.has(typeName)) {
          generatedTypes.add(typeName)
          const mutationType = this.generateMutationType(endpoint)
          types.push(`export interface ${typeName} ${mutationType}`)
          types.push('')
        }
      }
    }

    return types.join('\n')
  }

  private generateIndexFile(): string {
    const exports: string[] = []

    exports.push(this.generateFileHeader('Generated React Hooks'))
    exports.push('')
    exports.push('// Query hooks')
    exports.push("export * from './queries'")
    exports.push('')
    exports.push('// Mutation hooks')
    exports.push("export * from './mutations'")
    exports.push('')
    exports.push('// Query keys')
    exports.push("export { queryKeys } from './keys'")
    exports.push('')
    exports.push('// Hook types')
    exports.push("export * from './types'")

    return exports.join('\n')
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated React hooks from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }

  /**
   * Generate hook name for a query endpoint
   * Uses shared naming utility for consistency with client generator
   */
  private generateQueryHookName(endpoint: ParsedEndpoint): string {
    const names = getEndpointNames(endpoint)
    return names.hookName
  }

  /**
   * Generate hook name for a mutation endpoint
   * Uses shared naming utility for consistency with client generator
   */
  private generateMutationHookName(endpoint: ParsedEndpoint): string {
    // Check if this is a bulk operation first
    const resourceName = this.extractResourceName(endpoint.path)
    if (resourceName) {
      const bulkHookName = this.bulkHookGenerator.generateBulkMutationHookName(
        endpoint,
        resourceName,
      )
      if (bulkHookName) {
        return bulkHookName
      }
    }

    const names = getEndpointNames(endpoint)
    return names.hookName
  }

  /**
   * Get the operation name (client method name) for an endpoint
   * Uses shared naming utility for consistency with client generator
   */
  private getOperationName(endpoint: ParsedEndpoint): string {
    const names = getEndpointNames(endpoint)
    return names.clientMethodName
  }

  private hasRequiredParams(endpoint: ParsedEndpoint): boolean {
    return (
      endpoint.parameters.some((p) => p.required) ||
      endpoint.parameters.some((p) => p.in === 'path')
    )
  }

  private generateParamType(endpoint: ParsedEndpoint): string {
    const pathParams = endpoint.parameters.filter((p) => p.in === 'path')
    const queryParams = endpoint.parameters.filter((p) => p.in === 'query')

    const properties: string[] = []

    pathParams.forEach((param) => {
      properties.push(`${param.name}: ${this.getParameterType(param)}`)
    })

    queryParams.forEach((param) => {
      const optional = param.required ? '' : '?'
      properties.push(`${param.name}${optional}: ${this.getParameterType(param)}`)
    })

    return `{ ${properties.join('; ')} }`
  }

  private generateMutationType(endpoint: ParsedEndpoint): string {
    const hasPathParams = endpoint.parameters.some((p) => p.in === 'path')

    if (hasPathParams) {
      const pathType = this.generateParamType(endpoint)
      return `{ pathParams: ${pathType}; [key: string]: unknown }`
    }

    return '{ [key: string]: unknown }'
  }

  private getParameterType(param: ParsedParameter): string {
    switch (param.schema.type) {
      case 'string':
        return 'string'
      case 'number':
      case 'integer':
        return 'number'
      case 'boolean':
        return 'boolean'
      default:
        return 'any'
    }
  }

  private isListEndpoint(endpoint: ParsedEndpoint): boolean {
    // Only GET requests can be list endpoints
    if (endpoint.method.toLowerCase() !== 'get') return false

    // If it has path parameters, it's likely fetching a single resource
    if (endpoint.path.includes('{')) return false

    // Check if the response is an array
    const response200 = endpoint.responses.find((r) => r.statusCode === '200')
    const jsonContent = response200?.content?.['application/json']
    if (jsonContent?.schema?.type === 'array') return true

    // Check if summary/description indicates it's a list
    const description =
      `${endpoint.summary || ''} ${endpoint.description || ''}`.toLowerCase()
    return (
      description.includes('list') ||
      description.includes('get all') ||
      description.includes('fetch all')
    )
  }

  private groupEndpointsByResource(
    endpoints: ParsedEndpoint[],
  ): Record<string, ParsedEndpoint[]> {
    const groups: Record<string, ParsedEndpoint[]> = {}

    for (const endpoint of endpoints) {
      const resource = endpoint.tags?.[0] || 'default'
      if (!groups[resource]) {
        groups[resource] = []
      }
      groups[resource].push(endpoint)
    }

    return groups
  }

  private getRelatedQueryTags(endpoint: ParsedEndpoint): string[] {
    const resource = endpoint.tags?.[0] || 'default'
    const sanitizedResource = this.sanitizeIdentifier(resource)
    return [sanitizedResource, 'all']
  }

  private camelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toLowerCase())
  }

  private capitalize(str: string): string {
    // Convert snake_case to PascalCase
    return str
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('')
  }

  private sanitizeIdentifier(str: string): string {
    // Convert to camelCase and remove invalid characters
    return str
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars except spaces
      .split(/\s+/) // Split on whitespace
      .map((word, i) =>
        i === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      )
      .join('')
  }
}

// Factory function
export async function generateHooks(
  parsedAPI: ParsedOpenAPI,
  options?: HookGeneratorOptions,
): Promise<GeneratedHooks> {
  const generator = new ReactHookGenerator(options)
  return generator.generate(parsedAPI)
}
