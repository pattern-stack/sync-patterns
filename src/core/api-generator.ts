/**
 * API Generator
 *
 * Generates pure TypeScript API layer from EntityModel.
 * No React dependency - can be used by TUI, CLI, or React hooks.
 *
 * Output structure:
 *   api/
 *     accounts.ts    - accountsApi.list(), .get(), .create(), etc.
 *     contacts.ts    - contactsApi.list(), etc.
 *     client.ts      - Configurable HTTP client
 *     types.ts       - ApiConfig, ApiResponse types
 *     index.ts       - Re-exports all
 */

import type {
  EntityModel,
  EntityDefinition,
  OperationDefinition,
} from './entity-model.js'

export interface GeneratedApi {
  /** Entity API files keyed by entity name */
  entities: Map<string, string>
  /** Shared client code */
  client: string
  /** Shared types */
  types: string
  /** Index file with exports */
  index: string
}

export interface ApiGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<ApiGeneratorOptions> = {
  includeJSDoc: true,
}

export class ApiGenerator {
  private options: Required<ApiGeneratorOptions>

  constructor(options: ApiGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(model: EntityModel): GeneratedApi {
    const entities = new Map<string, string>()

    for (const [name, entity] of model.entities) {
      const code = this.generateEntityApi(entity)
      entities.set(name, code)
    }

    return {
      entities,
      client: this.generateClient(),
      types: this.generateTypes(),
      index: this.generateIndex(model),
    }
  }

  /**
   * Generate API object for a single entity
   */
  private generateEntityApi(entity: EntityDefinition): string {
    const lines: string[] = []
    const { pascalName, name } = entity

    // File header
    lines.push(this.generateFileHeader(pascalName))
    lines.push('')

    // Imports
    lines.push(this.generateImports(entity))
    lines.push('')

    // API object
    lines.push(this.generateApiObject(entity))

    return lines.join('\n')
  }

  /**
   * Generate file header
   */
  private generateFileHeader(entityName: string): string {
    return `/**
 * ${entityName} API
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
    const types: Set<string> = new Set()

    // Collect types from schemas
    if (entity.schemas.item) types.add(entity.schemas.item)
    if (entity.schemas.listResponse) types.add(entity.schemas.listResponse)
    if (entity.schemas.createRequest) types.add(entity.schemas.createRequest)
    if (entity.schemas.updateRequest) types.add(entity.schemas.updateRequest)

    // Collect types from custom operations
    for (const op of entity.customOperations) {
      if (op.requestSchema) types.add(op.requestSchema.name)
      if (op.responseSchema) types.add(op.responseSchema.name)
    }

    // Import from client
    imports.push("import { apiClient } from './client.js'")

    // Import types from schemas
    if (types.size > 0) {
      const typeList = Array.from(types).sort().join(', ')
      imports.push(`import type { ${typeList} } from '../schemas/index.js'`)
    }

    return imports.join('\n')
  }

  /**
   * Generate the main API object
   */
  private generateApiObject(entity: EntityDefinition): string {
    const { name } = entity
    const methods: string[] = []

    // CRUD methods - only generate if operation exists AND required schemas are available
    if (entity.operations.list && this.hasListSchema(entity)) {
      methods.push(this.generateListMethod(entity))
    }
    if (entity.operations.get && this.hasItemSchema(entity)) {
      methods.push(this.generateGetMethod(entity))
    }
    if (entity.operations.create && this.hasCreateSchemas(entity)) {
      methods.push(this.generateCreateMethod(entity))
    }
    if (entity.operations.update && this.hasUpdateSchemas(entity)) {
      methods.push(this.generateUpdateMethod(entity))
    }
    if (entity.operations.delete) {
      methods.push(this.generateDeleteMethod(entity))
    }

    // Metadata convenience method
    if (entity.metadataOperation && entity.operations.list) {
      methods.push(this.generateListWithMetaMethod(entity))
    }

    // Custom operations
    for (const op of entity.customOperations) {
      methods.push(this.generateCustomMethod(entity, op))
    }

    const jsdoc = this.options.includeJSDoc
      ? `/**
 * ${entity.pascalName} API
 *
 * Provides typed methods for ${name} operations.
 */
`
      : ''

    return `${jsdoc}export const ${name}Api = {
${methods.join(',\n\n')}
}`
  }

  /**
   * Generate list method
   */
  private generateListMethod(entity: EntityDefinition): string {
    const op = entity.operations.list!
    // Use actual schema from operation - for arrays, append []
    const responseSchema = op.responseSchema
    let returnType: string
    if (entity.schemas.listResponse) {
      // Explicit list response type (already includes array if needed)
      returnType = entity.schemas.listResponse
    } else if (responseSchema?.isArray && responseSchema.name) {
      // Array of items
      returnType = `${responseSchema.name}[]`
    } else if (responseSchema?.name) {
      // Single item or paginated response
      returnType = responseSchema.name
    } else if (entity.schemas.item) {
      // Fallback to item schema as array
      returnType = `${entity.schemas.item}[]`
    } else {
      // Last resort fallback
      returnType = `${entity.pascalName}[]`
    }
    const path = op.path

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * List all ${entity.name}
   */
`
      : ''

    return `${jsdoc}  async list(): Promise<${returnType}> {
    return await apiClient.get<${returnType}>('${path}')
  }`
  }

  /**
   * Generate get method
   */
  private generateGetMethod(entity: EntityDefinition): string {
    const op = entity.operations.get!
    // Use actual schema from operation, fall back to entity schema
    const returnType = entity.schemas.item || op.responseSchema?.name || entity.pascalName
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)
    const methodParams = this.buildMethodParams(op.pathParams)
    const paramMapping = this.createParamMapping(op.pathParams, methodParams)
    const finalTemplate = this.applyParamMapping(pathTemplate, paramMapping)

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Get a single ${entity.singular} by ID
   */
`
      : ''

    return `${jsdoc}  async get(${methodParams.join(', ')}): Promise<${returnType}> {
    return await apiClient.get<${returnType}>(\`${finalTemplate}\`)
  }`
  }

  /**
   * Generate create method
   */
  private generateCreateMethod(entity: EntityDefinition): string {
    const op = entity.operations.create!
    // Use actual schema from operation, fall back to entity schema
    const requestType = entity.schemas.createRequest || op.requestSchema?.name || `${entity.pascalName}Create`
    const returnType = entity.schemas.item || op.responseSchema?.name || entity.pascalName
    const path = op.path

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Create a new ${entity.singular}
   */
`
      : ''

    return `${jsdoc}  async create(data: ${requestType}): Promise<${returnType}> {
    return await apiClient.post<${returnType}>('${path}', data)
  }`
  }

  /**
   * Generate update method
   */
  private generateUpdateMethod(entity: EntityDefinition): string {
    const op = entity.operations.update!
    // Use actual schema from operation, fall back to entity schema
    const requestType = entity.schemas.updateRequest || op.requestSchema?.name || `${entity.pascalName}Update`
    const returnType = entity.schemas.item || op.responseSchema?.name || entity.pascalName
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)
    const methodParams = this.buildMethodParams(op.pathParams)
    const paramMapping = this.createParamMapping(op.pathParams, methodParams)
    const finalTemplate = this.applyParamMapping(pathTemplate, paramMapping)
    const method = op.method === 'patch' ? 'patch' : 'put'

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Update an existing ${entity.singular}
   */
`
      : ''

    return `${jsdoc}  async update(${methodParams.join(', ')}, data: ${requestType}): Promise<${returnType}> {
    return await apiClient.${method}<${returnType}>(\`${finalTemplate}\`, data)
  }`
  }

  /**
   * Generate delete method
   */
  private generateDeleteMethod(entity: EntityDefinition): string {
    const op = entity.operations.delete!
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)
    const methodParams = this.buildMethodParams(op.pathParams)
    const paramMapping = this.createParamMapping(op.pathParams, methodParams)
    const finalTemplate = this.applyParamMapping(pathTemplate, paramMapping)

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Delete a ${entity.singular}
   */
`
      : ''

    return `${jsdoc}  async delete(${methodParams.join(', ')}): Promise<void> {
    return await apiClient.delete<void>(\`${finalTemplate}\`)
  }`
  }

  /**
   * Generate listWithMeta convenience method
   */
  private generateListWithMetaMethod(entity: EntityDefinition): string {
    const listOp = entity.operations.list!
    const metaOp = entity.metadataOperation!
    const listType = entity.schemas.listResponse || `${entity.pascalName}[]`

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * List ${entity.name} with column metadata
   *
   * Fetches both data and metadata in parallel for table rendering.
   */
`
      : ''

    return `${jsdoc}  async listWithMeta(view: 'list' | 'detail' | 'form' = 'list'): Promise<{
    data: ${listType}
    columns: ColumnMetadata[]
  }> {
    const [data, metaResponse] = await Promise.all([
      apiClient.get<${listType}>('${listOp.path}'),
      apiClient.get<{ columns: ColumnMetadata[] }>(\`${metaOp.path}?view=\${view}\`),
    ])
    return { data, columns: metaResponse.columns }
  }`
  }

  /**
   * Generate custom operation method
   */
  private generateCustomMethod(entity: EntityDefinition, op: OperationDefinition): string {
    const methodName = this.operationIdToMethodName(op.operationId, entity.name)
    const hasRequestBody = op.requestSchema !== undefined
    const returnType = op.responseSchema?.name || 'void'
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)
    const methodParams = this.buildMethodParams(op.pathParams)
    const paramMapping = this.createParamMapping(op.pathParams, methodParams)
    const finalTemplate = this.applyParamMapping(pathTemplate, paramMapping)

    // Build parameters
    const params: string[] = [...methodParams]
    if (hasRequestBody) {
      params.push(`data: ${op.requestSchema!.name}`)
    }

    // Build method body
    const httpMethod = op.method
    const args = hasRequestBody ? ', data' : ''

    const jsdoc = this.options.includeJSDoc && op.summary
      ? `  /**
   * ${op.summary}
   */
`
      : ''

    return `${jsdoc}  async ${methodName}(${params.join(', ')}): Promise<${returnType}> {
    return await apiClient.${httpMethod}<${returnType}>(\`${finalTemplate}\`${args})
  }`
  }

  /**
   * Convert operationId to method name
   *
   * FastAPI operationIds follow this structure:
   *   get_allowed_stage_transitions_api_v1_accounts__account_id__stages_allowed_get
   *   │___________________________│ │____________________________________________│
   *        Function name                Auto-appended path + method
   *
   * We strip everything from _api_v onwards to get the semantic function name.
   *
   * @example
   * "get_allowed_stage_transitions_api_v1_accounts__account_id__stages_allowed_get"
   *   → "getAllowedStageTransitions"
   */
  private operationIdToMethodName(operationId: string, _entityName: string): string {
    // Strip the _api_v{N}..._{method} suffix that FastAPI auto-appends
    const cleanName = operationId
      .replace(/_api_v\d+.*$/, '') // Remove everything from _api_v onwards
      .replace(/_+$/, '') // Clean up any trailing underscores
      .trim()

    // Convert to camelCase
    return cleanName
      .split('_')
      .map((part, i) => (i === 0 ? part.toLowerCase() : this.capitalize(part)))
      .join('')
  }

  /**
   * Create path template with variable substitution
   */
  private createPathTemplate(
    path: string,
    pathParams: OperationDefinition['pathParams']
  ): string {
    let template = path
    for (const param of pathParams) {
      // Replace {param_name} with ${param_name}
      template = template.replace(`{${param.name}}`, `\${${param.name}}`)
    }
    return template
  }

  /**
   * Build parameter list for method signature
   * For single param ending in '_id', use 'id' for cleaner API
   * For multiple params or non-id params, use exact names
   */
  private buildMethodParams(pathParams: OperationDefinition['pathParams']): string[] {
    if (pathParams.length === 0) return []

    // Single parameter ending in _id -> use 'id' for clean API
    if (pathParams.length === 1 && pathParams[0].name.endsWith('_id')) {
      return ['id: string']
    }

    // Multiple parameters or non-standard names -> use exact names
    return pathParams.map(param => `${param.name}: string`)
  }

  /**
   * Create mapping for path template when params are renamed
   * e.g., if param is 'account_id' but method takes 'id', return mapping
   */
  private createParamMapping(
    pathParams: OperationDefinition['pathParams'],
    methodParams: string[]
  ): Map<string, string> {
    const mapping = new Map<string, string>()

    if (pathParams.length === 1 && methodParams.length === 1 && methodParams[0].startsWith('id:')) {
      // Single param renamed to 'id'
      mapping.set(pathParams[0].name, 'id')
    }

    return mapping
  }

  /**
   * Apply parameter mapping to path template
   */
  private applyParamMapping(template: string, mapping: Map<string, string>): string {
    let result = template
    for (const [original, renamed] of mapping) {
      result = result.replace(`\${${original}}`, `\${${renamed}}`)
    }
    return result
  }

  // ===========================================================================
  // Schema Availability Checks
  // ===========================================================================

  /**
   * Check if entity has a valid list response schema
   */
  private hasListSchema(entity: EntityDefinition): boolean {
    // Has explicit list response OR item schema (for array return)
    return !!(entity.schemas.listResponse || entity.schemas.item ||
              entity.operations.list?.responseSchema?.name)
  }

  /**
   * Check if entity has a valid item schema (for get/create/update)
   */
  private hasItemSchema(entity: EntityDefinition): boolean {
    return !!(entity.schemas.item || entity.operations.get?.responseSchema?.name)
  }

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
   * Generate the shared client
   */
  private generateClient(): string {
    return `/**
 * API Client
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 *
 * Features:
 * - Dynamic auth token (callback or localStorage fallback)
 * - Configurable timeout
 * - Retry with exponential backoff
 * - Structured error handling
 * - Request/response callbacks
 */

import type { ApiConfig, ApiError, RequestConfig, RequestOptions } from './types.js'

// Default configuration
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: '',
  timeout: 10000,
  retries: 3,
  authTokenKey: 'auth_token',
}

let config: ApiConfig = { ...DEFAULT_CONFIG }

/**
 * Configure the API client
 *
 * @example
 * configureApi({
 *   baseUrl: 'http://localhost:8000/api/v1',
 *   timeout: 5000,
 *   getAuthToken: () => localStorage.getItem('my_token'),
 *   onAuthError: () => window.location.href = '/login',
 * })
 */
export function configureApi(newConfig: Partial<ApiConfig>): void {
  config = { ...config, ...newConfig }
}

/**
 * Get current API configuration
 */
export function getApiConfig(): ApiConfig {
  return { ...config }
}

/**
 * Get auth token - uses callback if provided, otherwise reads from localStorage
 */
async function getAuthToken(): Promise<string | null> {
  // Use custom getter if provided
  if (config.getAuthToken) {
    const token = config.getAuthToken()
    return token instanceof Promise ? await token : token
  }

  // Fallback to localStorage
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(config.authTokenKey || 'auth_token')
  }

  return null
}

/**
 * Build request headers
 */
async function buildHeaders(options?: RequestOptions): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.defaultHeaders,
    ...options?.headers,
  }

  const token = await getAuthToken()
  if (token) {
    headers['Authorization'] = \`Bearer \${token}\`
  }

  return headers
}

/**
 * Create structured API error
 */
function createApiError(
  message: string,
  status?: number,
  statusText?: string,
  data?: unknown,
  url?: string,
  method?: string
): ApiError {
  const error: ApiError = {
    message,
    status,
    statusText,
    data,
    config: { url, method },
  }

  // Call error callback if configured
  config.onError?.(error)

  // Call auth error callback for 401/403
  if ((status === 401 || status === 403) && config.onAuthError) {
    config.onAuthError(error)
  }

  return error
}

/**
 * Handle fetch response
 */
async function handleResponse<T>(response: Response, url: string, method: string): Promise<T> {
  if (!response.ok) {
    let errorData: unknown
    let errorMessage = response.statusText

    try {
      errorData = await response.json()
      // Extract message from common error response formats
      if (typeof errorData === 'object' && errorData !== null) {
        const data = errorData as Record<string, unknown>
        errorMessage = (data.detail || data.message || data.error || response.statusText) as string
      }
    } catch {
      try {
        errorMessage = await response.text()
      } catch {
        // Use statusText as fallback
      }
    }

    throw createApiError(errorMessage, response.status, response.statusText, errorData, url, method)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

/**
 * Build query string from params
 */
function buildQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params || Object.keys(params).length === 0) {
    return ''
  }

  const query = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => \`\${encodeURIComponent(key)}=\${encodeURIComponent(String(value))}\`)
    .join('&')

  return query ? \`?\${query}\` : ''
}

/**
 * Combine multiple AbortSignals into one.
 * Uses AbortSignal.any() if available (modern browsers), otherwise manual fallback.
 */
function combineSignals(signals: AbortSignal[]): AbortSignal {
  // Filter out undefined/null signals
  const validSignals = signals.filter(Boolean)
  if (validSignals.length === 0) {
    return new AbortController().signal
  }
  if (validSignals.length === 1) {
    return validSignals[0]
  }

  // Use native AbortSignal.any if available (Chrome 116+, Firefox 124+, Safari 17.4+)
  if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(validSignals)
  }

  // Fallback: create a new controller that aborts when any signal aborts
  const controller = new AbortController()
  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

/**
 * Execute request with retry logic and interceptors
 */
async function executeWithRetry<T>(
  method: string,
  path: string,
  options?: RequestOptions & { body?: string }
): Promise<T> {
  const queryString = buildQueryString(options?.params)
  const url = \`\${config.baseUrl}\${path}\${queryString}\`
  const maxRetries = config.retries ?? 3
  let lastError: ApiError | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = options?.timeout ?? config.timeout ?? 10000
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const headers = await buildHeaders(options)

      // Build request config for interceptors
      let requestConfig: RequestConfig = {
        method,
        url,
        headers,
        body: options?.body,
      }

      // Call request interceptor if configured
      if (config.onRequest) {
        requestConfig = await Promise.resolve(config.onRequest(requestConfig))
      }

      // Combine timeout signal with user-provided signal
      const signals: AbortSignal[] = [controller.signal]
      if (options?.signal) {
        signals.push(options.signal)
      }

      const response = await fetch(requestConfig.url, {
        method: requestConfig.method,
        headers: requestConfig.headers,
        body: requestConfig.body,
        signal: combineSignals(signals),
        credentials: config.credentials,
      })

      let result = await handleResponse<T>(response, requestConfig.url, requestConfig.method)

      // Call response interceptor if configured
      if (config.onResponse) {
        result = await Promise.resolve(config.onResponse(result, requestConfig))
      }

      return result
    } catch (error) {
      // Don't retry on user-initiated abort
      if (options?.signal?.aborted) {
        throw createApiError('Request aborted', undefined, undefined, undefined, url, method)
      }

      // Don't retry on timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw createApiError('Request timeout', undefined, undefined, undefined, url, method)
      }

      // Don't retry on client errors (4xx)
      if (isApiError(error) && error.status && error.status >= 400 && error.status < 500) {
        throw error
      }

      // Better network error context
      if (error instanceof TypeError) {
        lastError = createApiError(
          'Network error: unable to reach server. Check your connection and that the server is running.',
          undefined, undefined, undefined, url, method
        )
      } else {
        lastError = isApiError(error)
          ? error
          : createApiError(
              error instanceof Error ? error.message : 'Unknown error',
              undefined, undefined, undefined, url, method
            )
      }

      // Retry with exponential backoff for server errors or network failures
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } finally {
      // Always clean up timeout to prevent memory leaks
      clearTimeout(timeoutId)
    }
  }

  throw lastError ?? createApiError('Request failed after retries', undefined, undefined, undefined, url, method)
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'message' in error && 'config' in error
}

/**
 * API client with typed methods
 */
export const apiClient = {
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return executeWithRetry<T>('GET', path, options)
  },

  async post<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return executeWithRetry<T>('POST', path, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  async put<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return executeWithRetry<T>('PUT', path, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  async patch<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return executeWithRetry<T>('PATCH', path, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
    })
  },

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return executeWithRetry<T>('DELETE', path, options)
  },
}
`
  }

  /**
   * Generate shared types
   */
  private generateTypes(): string {
    return `/**
 * API Types
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 */

/**
 * API client configuration
 */
export interface ApiConfig {
  /** Base URL for API calls (e.g., 'http://localhost:8000/api/v1') */
  baseUrl: string

  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number

  /** Number of retry attempts for failed requests (default: 3) */
  retries?: number

  /** Key for auth token in localStorage (default: 'auth_token') */
  authTokenKey?: string

  /** Default headers for all requests */
  defaultHeaders?: Record<string, string>

  /**
   * Custom auth token getter. If provided, this is used instead of localStorage.
   * Useful for apps using cookies, memory storage, or custom auth flows.
   *
   * @example
   * getAuthToken: () => sessionStorage.getItem('token')
   * getAuthToken: async () => await authService.getValidToken()
   */
  getAuthToken?: () => string | null | Promise<string | null>

  /**
   * Callback when any API error occurs
   */
  onError?: (error: ApiError) => void

  /**
   * Callback when auth error (401/403) occurs.
   * Use this to redirect to login or refresh tokens.
   *
   * @example
   * onAuthError: () => window.location.href = '/login'
   */
  onAuthError?: (error: ApiError) => void

  /**
   * Request interceptor - called before each request.
   * Can modify the request config or perform side effects (logging).
   *
   * @example
   * onRequest: (config) => { console.log('Request:', config.method, config.url); return config }
   */
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>

  /**
   * Response interceptor - called after successful responses.
   * Can transform the response data or perform side effects.
   *
   * @example
   * onResponse: (response, config) => { console.log('Response:', config.url, response); return response }
   */
  onResponse?: <T>(response: T, config: RequestConfig) => T | Promise<T>

  /**
   * Credentials mode for cross-origin requests.
   * - 'omit': Never send cookies (default)
   * - 'same-origin': Send cookies for same-origin requests only
   * - 'include': Always send cookies, even for cross-origin requests
   *
   * @example
   * credentials: 'include'  // For cross-origin authenticated requests
   */
  credentials?: 'omit' | 'same-origin' | 'include'
}

/**
 * Request configuration passed to interceptors
 */
export interface RequestConfig {
  /** HTTP method */
  method: string
  /** Full URL */
  url: string
  /** Request headers */
  headers: Record<string, string>
  /** Request body (if any) */
  body?: string
}

/**
 * Request options for individual API calls
 */
export interface RequestOptions {
  /** Query parameters to append to URL */
  params?: Record<string, string | number | boolean | undefined>

  /** Additional headers for this request */
  headers?: Record<string, string>

  /** Override timeout for this request */
  timeout?: number

  /** AbortSignal for request cancellation */
  signal?: AbortSignal
}

/**
 * Structured API error with context
 */
export interface ApiError {
  /** Error message */
  message: string

  /** HTTP status code (if available) */
  status?: number

  /** HTTP status text */
  statusText?: string

  /** Response body data (if available) */
  data?: unknown

  /** Request context */
  config: {
    url?: string
    method?: string
  }
}

/**
 * Column metadata for table rendering
 */
export interface ColumnMetadata {
  key: string
  label: string
  type?: string
  sortable?: boolean
  importance?: 'primary' | 'secondary' | 'tertiary'
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  offset?: number
  limit?: number
}
`
  }

  /**
   * Generate index file
   */
  private generateIndex(model: EntityModel): string {
    const exports: string[] = []
    const reExports: string[] = []

    // Export from client
    exports.push("export { configureApi, getApiConfig, apiClient } from './client.js'")
    exports.push("export type { ApiConfig, ApiError, RequestConfig, RequestOptions, ColumnMetadata, PaginatedResponse } from './types.js'")
    exports.push('')

    // Export entity APIs
    for (const [name] of model.entities) {
      const apiName = `${name}Api`
      reExports.push(`export { ${apiName} } from './${name}.js'`)
    }

    return `/**
 * API Module
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 */

${exports.join('\n')}
${reExports.join('\n')}
`
  }

  /**
   * Helpers
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  private singularize(str: string): string {
    if (str.endsWith('ies')) return str.slice(0, -3) + 'y'
    if (str.endsWith('ses')) return str.slice(0, -2)
    if (str.endsWith('s') && !str.endsWith('ss')) return str.slice(0, -1)
    return str
  }
}
