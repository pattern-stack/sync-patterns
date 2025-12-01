/**
 * Bulk Operations Types
 *
 * Standard types for bulk operations in generated hooks
 * Part of sync-patterns code generation
 */

/**
 * Standard bulk operation request format
 */
export interface BulkOperationRequest<T = unknown> {
  /** Array of IDs to operate on */
  ids: Array<string | number>
  /** Optional additional data for the operation */
  data?: T
  /** Optional operation-specific options */
  options?: BulkOperationOptions
}

/**
 * Options for bulk operations
 */
export interface BulkOperationOptions {
  /** Continue processing if some items fail */
  continueOnError?: boolean
  /** Batch size for processing */
  batchSize?: number
  /** Progress callback */
  onProgress?: (progress: BulkOperationProgress) => void
}

/**
 * Progress tracking for bulk operations
 */
export interface BulkOperationProgress {
  /** Total number of items to process */
  total: number
  /** Number of items processed so far */
  processed: number
  /** Number of successful operations */
  succeeded: number
  /** Number of failed operations */
  failed: number
  /** Percentage complete (0-100) */
  percentage: number
  /** Current status */
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

/**
 * Standard bulk operation response format
 */
export interface BulkOperationResponse<T = unknown> {
  /** Overall operation success */
  success: boolean
  /** Results for successful operations */
  succeeded: BulkOperationResult<T>[]
  /** Results for failed operations */
  failed: BulkOperationError[]
  /** Summary statistics */
  summary: BulkOperationSummary
}

/**
 * Individual result for a successful bulk operation
 */
export interface BulkOperationResult<T = unknown> {
  /** ID of the processed item */
  id: string | number
  /** Result data */
  data?: T
  /** Operation-specific message */
  message?: string
}

/**
 * Individual error for a failed bulk operation
 */
export interface BulkOperationError {
  /** ID of the failed item */
  id: string | number
  /** Error code */
  code?: string
  /** Error message */
  message: string
  /** Detailed error information */
  details?: unknown
  /** Whether this error is retryable */
  retryable?: boolean
}

/**
 * Summary statistics for bulk operations
 */
export interface BulkOperationSummary {
  /** Total items requested */
  total: number
  /** Successfully processed items */
  succeeded: number
  /** Failed items */
  failed: number
  /** Processing duration in ms */
  duration?: number
  /** Operation timestamp */
  timestamp: string
}

/**
 * Retry configuration for bulk operations
 */
export interface BulkRetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number
  /** Initial delay between retries (ms) */
  initialDelay?: number
  /** Maximum delay between retries (ms) */
  maxDelay?: number
  /** Backoff multiplier */
  backoffMultiplier?: number
  /** Which errors should trigger a retry */
  retryOn?: (error: BulkOperationError) => boolean
}

/**
 * Hook options specific to bulk operations
 */
export interface BulkMutationOptions<TData = unknown, TVariables = unknown> {
  /** Retry configuration */
  retry?: BulkRetryConfig
  /** Progress tracking */
  onProgress?: (progress: BulkOperationProgress) => void
  /** Callback for partial success */
  onPartialSuccess?: (response: BulkOperationResponse<TData>) => void
  /** Transform function for request */
  transformRequest?: (request: BulkOperationRequest<TVariables>) => unknown
  /** Transform function for response */
  transformResponse?: (response: unknown) => BulkOperationResponse<TData>
}

/**
 * Type guard to check if an endpoint handles bulk operations
 */
export function isBulkOperation(
  path: string,
  _method: string,
  requestBody?: unknown,
): boolean {
  const bulkPatterns = [
    /\/bulk[-_]?delete$/i,
    /\/bulk[-_]?update$/i,
    /\/bulk[-_]?create$/i,
    /\/batch$/i,
    /\/bulk$/i,
    /\/multiple$/i,
  ]

  // Check path patterns
  if (bulkPatterns.some((pattern) => pattern.test(path))) {
    return true
  }

  // Check if request body expects an array of items
  if (requestBody && typeof requestBody === 'object') {
    // Check for ParsedRequestBody structure
    const body = requestBody as Record<string, unknown>
    if (body.content && typeof body.content === 'object') {
      const contentObj = body.content as Record<string, unknown>
      const jsonSchema = contentObj['application/json']
      if (jsonSchema && typeof jsonSchema === 'object') {
        const schemaObj = jsonSchema as Record<string, unknown>
        const schema = schemaObj.schema as Record<string, unknown> | undefined
        if (schema && schema.type === 'array' && !!schema.items) {
          return true
        }
      }
    }

    // Check direct schema
    if ('type' in requestBody) {
      const bodyType = requestBody as { type: string; items?: unknown }
      return bodyType.type === 'array' && !!bodyType.items
    }
  }

  return false
}

/**
 * Detect bulk operation type from endpoint
 */
export function detectBulkOperationType(
  path: string,
  method: string,
): 'create' | 'update' | 'delete' | 'mixed' | null {
  const lowercasePath = path.toLowerCase()
  const lowercaseMethod = method.toLowerCase()

  if (lowercasePath.includes('delete') || lowercaseMethod === 'delete') {
    return 'delete'
  }

  if (
    lowercasePath.includes('update') ||
    lowercaseMethod === 'put' ||
    lowercaseMethod === 'patch'
  ) {
    return 'update'
  }

  if (lowercasePath.includes('create') || lowercaseMethod === 'post') {
    return 'create'
  }

  if (lowercasePath.includes('batch') || lowercasePath.includes('bulk')) {
    return 'mixed'
  }

  return null
}

/**
 * Generate a descriptive bulk operation name
 */
export function generateBulkOperationName(
  resource: string,
  operationType: string,
): string {
  const cleanResource = resource.replace(/[^a-zA-Z0-9]/g, '')
  const singular = cleanResource.endsWith('s')
    ? cleanResource.slice(0, -1)
    : cleanResource

  // Capitalize first letter of singular resource
  const capitalizedSingular = capitalize(singular)

  switch (operationType) {
    case 'delete':
      return `bulkDelete${capitalizedSingular}s`
    case 'update':
      return `bulkUpdate${capitalizedSingular}s`
    case 'create':
      return `bulkCreate${capitalizedSingular}s`
    case 'mixed':
      return `bulk${capitalizedSingular}Operations`
    default:
      return `bulk${capitalizedSingular}s`
  }
}

function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
