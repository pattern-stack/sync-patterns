/**
 * Shared Naming Utilities for OpenAPI Code Generation
 *
 * Provides a single source of truth for naming operations, hooks, client methods,
 * and query keys. This ensures consistency across all generated code.
 *
 * FastAPI operationIds follow this structure:
 * list_field_definitions_api_v1_accounts_fields__get
 * │___________________│ │_________________________│ │_│
 *    Function name         Auto-appended path      Method
 *
 * We extract the function name part which is already semantic and unique.
 */

import type { ParsedEndpoint } from './parser.js'

/**
 * Clean an operationId by removing the FastAPI auto-generated path and method suffix
 *
 * @example
 * cleanOperationId("list_field_definitions_api_v1_accounts_fields__get")
 * // => "list_field_definitions"
 *
 * cleanOperationId("get_extended_metadata_api_v1_metadata__get")
 * // => "get_extended_metadata"
 *
 * cleanOperationId("create_transaction_api_v1_transactions__post")
 * // => "create_transaction"
 */
export function cleanOperationId(operationId: string): string {
  // Strip the _api_v{N}..._{method} suffix that FastAPI auto-appends
  // Handles patterns like:
  // - _api_v1_accounts_fields__get
  // - _api_v1_metadata__post
  // - _api_v2_users_roles__delete
  return operationId
    .replace(/_api_v\d+.*$/, '') // Remove everything from _api_v onwards
    .replace(/_+$/, '') // Clean up any trailing underscores
    .trim()
}

/**
 * Convert a clean operation name to camelCase for client method names
 *
 * @example
 * toCamelCase("list_field_definitions") // => "listFieldDefinitions"
 * toCamelCase("get_user") // => "getUser"
 */
export function toCamelCase(str: string): string {
  return str
    .split('_')
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('')
}

/**
 * Convert a clean operation name to PascalCase
 *
 * @example
 * toPascalCase("list_field_definitions") // => "ListFieldDefinitions"
 * toPascalCase("get_user") // => "GetUser"
 */
export function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

/**
 * Generate a hook name from an operationId
 *
 * @example
 * toHookName("list_field_definitions_api_v1_accounts_fields__get")
 * // => "useListFieldDefinitions"
 *
 * toHookName("create_transaction_api_v1_transactions__post")
 * // => "useCreateTransaction"
 */
export function toHookName(operationId: string): string {
  const cleanName = cleanOperationId(operationId)
  return `use${toPascalCase(cleanName)}`
}

/**
 * Generate a client method name from an operationId
 *
 * @example
 * toClientMethodName("list_field_definitions_api_v1_accounts_fields__get")
 * // => "listFieldDefinitions"
 *
 * toClientMethodName("create_transaction_api_v1_transactions__post")
 * // => "createTransaction"
 */
export function toClientMethodName(operationId: string): string {
  const cleanName = cleanOperationId(operationId)
  return toCamelCase(cleanName)
}

/**
 * Generate a query key base from an operationId
 *
 * @example
 * toQueryKeyBase("list_field_definitions_api_v1_accounts_fields__get")
 * // => "listFieldDefinitions"
 */
export function toQueryKeyBase(operationId: string): string {
  const cleanName = cleanOperationId(operationId)
  return toCamelCase(cleanName)
}

/**
 * Generate a type name from an operationId
 *
 * @example
 * toTypeName("list_field_definitions_api_v1_accounts_fields__get", "Request")
 * // => "ListFieldDefinitionsRequest"
 */
export function toTypeName(operationId: string, suffix: string): string {
  const cleanName = cleanOperationId(operationId)
  return `${toPascalCase(cleanName)}${suffix}`
}

/**
 * Generate names for an endpoint using operationId as the source of truth
 * Falls back to path-based naming if operationId is not available
 */
export function getEndpointNames(endpoint: ParsedEndpoint): {
  hookName: string
  clientMethodName: string
  queryKeyBase: string
  typeName: string
} {
  if (endpoint.operationId) {
    const cleanName = cleanOperationId(endpoint.operationId)
    const pascalCase = toPascalCase(cleanName)
    const camelCase = toCamelCase(cleanName)

    return {
      hookName: `use${pascalCase}`,
      clientMethodName: camelCase,
      queryKeyBase: camelCase,
      typeName: pascalCase,
    }
  }

  // Fallback: Generate from path + method (for APIs without operationIds)
  const fallbackName = generateFallbackName(endpoint)
  const pascalCase = toPascalCase(fallbackName)
  const camelCase = toCamelCase(fallbackName)

  return {
    hookName: `use${pascalCase}`,
    clientMethodName: camelCase,
    queryKeyBase: camelCase,
    typeName: pascalCase,
  }
}

/**
 * Generate a fallback name when operationId is not available
 * Uses path segments and HTTP method to create a meaningful name
 */
export function generateFallbackName(endpoint: ParsedEndpoint): string {
  // Remove API version prefix
  const cleanPath = endpoint.path.replace(/^\/api\/v\d+\//, '/')
  const segments = cleanPath.split('/').filter(Boolean)

  // Get non-parameter segments (resource names)
  const resourceSegments = segments
    .filter((seg) => !seg.startsWith('{'))
    .map((seg) => seg.replace(/-/g, '_'))

  if (resourceSegments.length === 0) {
    return endpoint.method
  }

  // Determine prefix based on method
  const methodPrefixes: Record<string, string> = {
    get: '', // GET doesn't need prefix for reads, but we add "list" or nothing
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'delete',
  }

  const prefix = methodPrefixes[endpoint.method.toLowerCase()] || endpoint.method

  // Check if it's a list operation (GET without path params)
  const isListOperation = endpoint.method === 'get' && !endpoint.path.includes('{')

  // Build the name
  const resource = resourceSegments.join('_')

  if (endpoint.method === 'get') {
    return isListOperation ? `list_${resource}` : `get_${resource}`
  }

  return prefix ? `${prefix}_${resource}` : resource
}

/**
 * Sanitize a string to be a valid JavaScript/TypeScript identifier
 */
export function sanitizeIdentifier(str: string): string {
  let result = str
    .replace(/[^a-zA-Z0-9_]/g, '_') // Replace invalid chars with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores

  // If starts with number, prefix with underscore
  if (/^[0-9]/.test(result)) {
    result = '_' + result
  }

  return result
}

/**
 * Extract the primary resource name from a path
 * Useful for query key grouping
 */
export function extractResourceFromPath(path: string): string {
  // Remove API version prefix
  const cleanPath = path.replace(/^\/api\/v\d+\//, '/')
  const segments = cleanPath.split('/').filter(Boolean)

  // Find the first non-parameter segment
  for (const segment of segments) {
    if (!segment.startsWith('{')) {
      return sanitizeIdentifier(segment.replace(/-/g, '_'))
    }
  }

  return 'default'
}

/**
 * Simple pluralization for resource names
 * Only used for fallback naming, not for operationId-based naming
 */
export function pluralize(word: string): string {
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word
  }
  if (
    word.endsWith('y') &&
    !['ay', 'ey', 'iy', 'oy', 'uy'].includes(word.slice(-2))
  ) {
    return word.slice(0, -1) + 'ies'
  }
  if (
    word.endsWith('ss') ||
    word.endsWith('x') ||
    word.endsWith('ch') ||
    word.endsWith('sh')
  ) {
    return word + 'es'
  }
  return word + 's'
}

/**
 * Simple singularization for resource names
 * Only used for fallback naming, not for operationId-based naming
 */
export function singularize(word: string): string {
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y'
  }
  if (
    word.endsWith('ses') ||
    word.endsWith('xes') ||
    word.endsWith('ches') ||
    word.endsWith('shes')
  ) {
    return word.slice(0, -2)
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }
  return word
}
