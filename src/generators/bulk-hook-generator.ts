/**
 * Bulk Operations Hook Generator
 *
 * Generates specialized React hooks for bulk operations with proper typing,
 * error handling, and progress tracking.
 *
 * Part of sync-patterns code generation
 */

import type { ParsedEndpoint } from './parser.js'
import {
  detectBulkOperationType,
  generateBulkOperationName,
  isBulkOperation,
} from './bulk-types.js'

export class BulkHookGenerator {
  /**
   * Generate a bulk mutation hook with progress tracking and retry logic
   */
  generateBulkMutationHook(
    endpoint: ParsedEndpoint,
    hookName: string,
    operationName: string,
  ): string {
    const bulkType = detectBulkOperationType(endpoint.path, endpoint.method)

    const lines: string[] = []

    // Generate JSDoc
    lines.push('/**')
    if (endpoint.summary) {
      lines.push(` * ${endpoint.summary}`)
    }
    if (endpoint.description) {
      lines.push(` * ${endpoint.description}`)
    }
    lines.push(' * @param options Mutation options with bulk operation support')
    lines.push(' */')

    // Generate hook signature
    const resource = endpoint.tags?.[0] || 'default'
    lines.push(`export function ${hookName}(`)
    lines.push(
      `  options?: UseMutationOptions<BulkOperationResponse, any, BulkOperationRequest> & BulkMutationOptions`,
    )
    lines.push(') {')
    lines.push('  const queryClient = useQueryClient()')
    lines.push('  ')
    lines.push('  return useMutation({')

    // Generate mutation function with progress tracking
    lines.push('    mutationFn: async (request: BulkOperationRequest) => {')
    lines.push('      // Transform request if needed')
    lines.push('      const transformedRequest = options?.transformRequest ')
    lines.push('        ? options.transformRequest(request) ')
    lines.push('        : request')
    lines.push('      ')
    lines.push('      // Simulate progress updates for demo')
    lines.push('      if (options?.onProgress) {')
    lines.push('        options.onProgress({')
    lines.push('          total: request.ids.length,')
    lines.push('          processed: 0,')
    lines.push('          succeeded: 0,')
    lines.push('          failed: 0,')
    lines.push('          percentage: 0,')
    lines.push("          status: 'processing'")
    lines.push('        })')
    lines.push('      }')
    lines.push('      ')
    lines.push(
      // operationName is already camelCase (passed in by the caller)
      `      const response = await apiClient.${operationName}(transformedRequest)`,
    )
    lines.push('      ')
    lines.push('      // Transform response if needed')
    lines.push('      const transformedResponse = options?.transformResponse')
    lines.push('        ? options.transformResponse(response)')
    lines.push('        : response')
    lines.push('      ')
    lines.push('      // Final progress update')
    lines.push('      if (options?.onProgress && transformedResponse) {')
    lines.push('        options.onProgress({')
    lines.push(
      '          total: transformedResponse.summary?.total || request.ids.length,',
    )
    lines.push(
      '          processed: transformedResponse.summary?.total || request.ids.length,',
    )
    lines.push(
      '          succeeded: transformedResponse.summary?.succeeded || 0,',
    )
    lines.push('          failed: transformedResponse.summary?.failed || 0,')
    lines.push('          percentage: 100,')
    lines.push("          status: 'completed'")
    lines.push('        })')
    lines.push('      }')
    lines.push('      ')
    lines.push('      return transformedResponse')
    lines.push('    },')

    // Generate optimistic updates for bulk operations
    lines.push(this.generateBulkOptimisticUpdate(resource, bulkType))

    // Generate cache invalidation
    lines.push(this.generateBulkCacheInvalidation(resource))

    // Handle partial success
    lines.push('    onSuccess: (data, variables, context) => {')
    lines.push('      // Handle partial success')
    lines.push(
      '      if (data.failed.length > 0 && options?.onPartialSuccess) {',
    )
    lines.push('        options.onPartialSuccess(data)')
    lines.push('      }')
    lines.push('      ')
    lines.push('      // Call original onSuccess if provided')
    lines.push('      options?.onSuccess?.(data, variables, context)')
    lines.push('    },')

    // Retry configuration for bulk operations
    lines.push('    retry: (failureCount, error) => {')
    lines.push('      // Use custom retry config if provided')
    lines.push('      if (options?.retry?.maxAttempts !== undefined) {')
    lines.push('        return failureCount < options.retry.maxAttempts')
    lines.push('      }')
    lines.push('      // Default: retry up to 3 times for bulk operations')
    lines.push('      return failureCount < 3')
    lines.push('    },')
    lines.push('    retryDelay: (attemptIndex) => {')
    lines.push('      // Use custom retry delay if provided')
    lines.push('      if (options?.retry?.initialDelay) {')
    lines.push('        const delay = Math.min(')
    lines.push(
      '          options.retry.initialDelay * Math.pow(options.retry.backoffMultiplier || 2, attemptIndex),',
    )
    lines.push('          options.retry.maxDelay || 30000')
    lines.push('        )')
    lines.push('        return delay')
    lines.push('      }')
    lines.push('      // Default exponential backoff: 1s, 2s, 4s...')
    lines.push('      return Math.min(1000 * Math.pow(2, attemptIndex), 30000)')
    lines.push('    },')

    lines.push('    ...options')
    lines.push('  })')
    lines.push('}')

    return lines.join('\n')
  }

  /**
   * Generate optimistic updates for bulk operations
   */
  private generateBulkOptimisticUpdate(
    resource: string,
    bulkType: string | null,
  ): string {
    switch (bulkType) {
      case 'delete':
        return `    onMutate: async (request: BulkOperationRequest) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      // Snapshot previous value
      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Optimistically remove items
      queryClient.setQueryData(queryKeys.${resource}(), (old: unknown) => {
        if (Array.isArray(old)) {
          return old.filter((item: unknown) => !(item as Record<string, unknown>).id || !request.ids.includes((item as Record<string, unknown>).id))
        }
        return old
      })

      return { previousData }
    },
    onError: (err: unknown, request: unknown, context: { previousData?: unknown }) => {
      // Rollback on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`

      case 'update':
        return `    onMutate: async (request: BulkOperationRequest) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Optimistically update items
      queryClient.setQueryData(queryKeys.${resource}(), (old: unknown) => {
        if (Array.isArray(old)) {
          return old.map((item: unknown) =>
            request.ids.includes((item as Record<string, unknown>).id)
              ? { ...item, ...request.data }
              : item
          )
        }
        return old
      })

      return { previousData }
    },
    onError: (err: unknown, request: unknown, context: { previousData?: unknown }) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`

      case 'create':
        return `    onMutate: async (request: BulkOperationRequest) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.${resource}() })

      const previousData = queryClient.getQueryData(queryKeys.${resource}())

      // Optimistically add items (if data provided)
      if (request.data && Array.isArray(request.data)) {
        queryClient.setQueryData(queryKeys.${resource}(), (old: unknown) => {
          if (Array.isArray(old)) {
            return [...old, ...request.data]
          }
          return old
        })
      }

      return { previousData }
    },
    onError: (err: unknown, request: unknown, context: { previousData?: unknown }) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKeys.${resource}(), context.previousData)
      }
    },`

      default:
        return ''
    }
  }

  /**
   * Generate cache invalidation for bulk operations
   */
  private generateBulkCacheInvalidation(resource: string): string {
    return `    onSettled: () => {
      // Invalidate related queries after bulk operation
      queryClient.invalidateQueries({ queryKey: queryKeys.${resource}() })
      queryClient.invalidateQueries({ queryKey: queryKeys.all })
    },`
  }

  /**
   * Generate bulk mutation hook name
   */
  generateBulkMutationHookName(
    endpoint: ParsedEndpoint,
    resourceName: string,
  ): string | null {
    const requestBody = endpoint.requestBody
    if (!isBulkOperation(endpoint.path, endpoint.method, requestBody)) {
      return null
    }

    const bulkType = detectBulkOperationType(endpoint.path, endpoint.method)

    if (bulkType && resourceName) {
      const bulkName = generateBulkOperationName(resourceName, bulkType)
      // bulkName is already camelCase (e.g., bulkDeleteUsers), just capitalize first letter
      return `use${bulkName.charAt(0).toUpperCase()}${bulkName.slice(1)}`
    }

    return null
  }

  /**
   * Check if endpoint is a bulk operation
   */
  isBulkEndpoint(endpoint: ParsedEndpoint): boolean {
    const requestBody = endpoint.requestBody
    return isBulkOperation(endpoint.path, endpoint.method, requestBody)
  }
}
