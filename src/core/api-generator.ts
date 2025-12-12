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

    // CRUD methods
    if (entity.operations.list) {
      methods.push(this.generateListMethod(entity))
    }
    if (entity.operations.get) {
      methods.push(this.generateGetMethod(entity))
    }
    if (entity.operations.create) {
      methods.push(this.generateCreateMethod(entity))
    }
    if (entity.operations.update) {
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
    const returnType = entity.schemas.listResponse || `${entity.pascalName}[]`
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
    const returnType = entity.schemas.item || entity.pascalName
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Get a single ${entity.singular} by ID
   */
`
      : ''

    return `${jsdoc}  async get(id: string): Promise<${returnType}> {
    return await apiClient.get<${returnType}>(\`${pathTemplate}\`)
  }`
  }

  /**
   * Generate create method
   */
  private generateCreateMethod(entity: EntityDefinition): string {
    const op = entity.operations.create!
    const requestType = entity.schemas.createRequest || `${entity.pascalName}Create`
    const returnType = entity.schemas.item || entity.pascalName
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
    const requestType = entity.schemas.updateRequest || `${entity.pascalName}Update`
    const returnType = entity.schemas.item || entity.pascalName
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)
    const method = op.method === 'patch' ? 'patch' : 'put'

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Update an existing ${entity.singular}
   */
`
      : ''

    return `${jsdoc}  async update(id: string, data: ${requestType}): Promise<${returnType}> {
    return await apiClient.${method}<${returnType}>(\`${pathTemplate}\`, data)
  }`
  }

  /**
   * Generate delete method
   */
  private generateDeleteMethod(entity: EntityDefinition): string {
    const op = entity.operations.delete!
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)

    const jsdoc = this.options.includeJSDoc
      ? `  /**
   * Delete a ${entity.singular}
   */
`
      : ''

    return `${jsdoc}  async delete(id: string): Promise<void> {
    return await apiClient.delete<void>(\`${pathTemplate}\`)
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
    const hasPathParam = op.pathParams.length > 0
    const hasRequestBody = op.requestSchema !== undefined
    const returnType = op.responseSchema?.name || 'void'
    const pathTemplate = this.createPathTemplate(op.path, op.pathParams)

    // Build parameters
    const params: string[] = []
    if (hasPathParam) {
      params.push('id: string')
    }
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
    return await apiClient.${httpMethod}<${returnType}>(\`${pathTemplate}\`${args})
  }`
  }

  /**
   * Convert operationId to method name
   * e.g., "transition_account_stage" → "transitionStage"
   */
  private operationIdToMethodName(operationId: string, entityName: string): string {
    const singular = this.singularize(entityName)

    // Remove entity name from various positions
    let name = operationId
      // Remove from start: account_transition → transition
      .replace(new RegExp(`^(${entityName}|${singular})_`, 'i'), '')
      // Remove from end: transition_account → transition
      .replace(new RegExp(`_(${entityName}|${singular})$`, 'i'), '')
      // Remove from middle: transition_account_stage → transition_stage
      .replace(new RegExp(`_(${entityName}|${singular})_`, 'gi'), '_')

    // Convert to camelCase
    return name
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
      // Replace {param_name} with ${id}
      template = template.replace(`{${param.name}}`, '${id}')
    }
    return template
  }

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
 * Configurable HTTP client for API calls.
 */

import type { ApiConfig } from './types.js'

let config: ApiConfig = {
  baseUrl: '',
  authToken: undefined,
}

/**
 * Configure the API client
 *
 * @example
 * configureApi({
 *   baseUrl: 'http://localhost:8000/api/v1',
 *   authToken: 'your-jwt-token',
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
 * Internal HTTP client
 */
export const apiClient = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(\`\${config.baseUrl}\${path}\`, {
      method: 'GET',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(\`\${config.baseUrl}\${path}\`, {
      method: 'POST',
      headers: buildHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(\`\${config.baseUrl}\${path}\`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(\`\${config.baseUrl}\${path}\`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(\`\${config.baseUrl}\${path}\`, {
      method: 'DELETE',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  },
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.authToken) {
    headers['Authorization'] = \`Bearer \${config.authToken}\`
  }

  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText)
    throw new Error(\`API Error \${response.status}: \${error}\`)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
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
  /** JWT auth token (optional) */
  authToken?: string
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
    exports.push("export type { ApiConfig, ColumnMetadata, PaginatedResponse } from './types.js'")
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
