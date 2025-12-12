/**
 * EntityResolver
 *
 * Resolves OpenAPI spec into EntityModel.
 * Single source of truth for entity detection.
 *
 * This is the core of the new generator architecture.
 */

import type { OpenAPIV3 } from 'openapi-types'
import {
  type EntityModel,
  type EntityDefinition,
  type OperationDefinition,
  type ParameterDefinition,
  type SchemaReference,
  type SyncMode,
  type HttpMethod,
  createEmptyEntityModel,
  createEmptyEntityDefinition,
} from './entity-model.js'

/**
 * Operation type classification
 */
type OperationType = 'list' | 'get' | 'create' | 'update' | 'delete' | 'custom' | 'metadata'

/**
 * Paths to ignore as entities
 */
const IGNORED_PATHS = ['/health', '/ready', '/docs', '/openapi.json', '/redoc']

/**
 * Resolves OpenAPI spec into EntityModel
 */
export class EntityResolver {
  /**
   * Parse OpenAPI and resolve into EntityModel
   */
  resolve(spec: OpenAPIV3.Document): EntityModel {
    const model = createEmptyEntityModel()

    // Extract API info
    model.info = {
      title: spec.info.title,
      version: spec.info.version,
      description: spec.info.description,
    }

    // Extract base URL from servers
    if (spec.servers && spec.servers.length > 0) {
      model.info.baseUrl = spec.servers[0].url
    }

    // Extract auth config
    model.auth = this.extractAuthConfig(spec)

    // Process all paths
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      if (!pathItem) continue
      if (this.shouldIgnorePath(path)) continue

      this.processPath(path, pathItem as OpenAPIV3.PathItemObject, model, spec)
    }

    // Extract shared schemas (non-entity schemas)
    // TODO: Implement shared schema extraction

    return model
  }

  /**
   * Process a single path and its operations
   */
  private processPath(
    path: string,
    pathItem: OpenAPIV3.PathItemObject,
    model: EntityModel,
    spec: OpenAPIV3.Document
  ): void {
    const entityName = this.detectEntityFromPath(path)
    if (!entityName) return

    // Get or create entity definition
    let entity = model.entities.get(entityName)
    if (!entity) {
      entity = createEmptyEntityDefinition(entityName)
      model.entities.set(entityName, entity)
    }

    // Extract sync mode from path-level extensions
    const pathSyncMode = this.extractSyncModeFromPathItem(pathItem)
    if (pathSyncMode !== 'api') {
      entity.syncMode = pathSyncMode
    }

    // Process each HTTP method
    const methods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete']
    for (const method of methods) {
      const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined
      if (!operation) continue

      this.processOperation(path, method, operation, entity, spec)
    }
  }

  /**
   * Process a single operation
   */
  private processOperation(
    path: string,
    method: HttpMethod,
    operation: OpenAPIV3.OperationObject,
    entity: EntityDefinition,
    spec: OpenAPIV3.Document
  ): void {
    const operationType = this.detectOperationType(method, path, operation.operationId || '')
    const opDef = this.createOperationDefinition(path, method, operation, spec)

    switch (operationType) {
      case 'list':
        entity.operations.list = opDef
        // Extract list response schema
        if (opDef.responseSchema) {
          entity.schemas.listResponse = opDef.responseSchema.name
        }
        break

      case 'get':
        entity.operations.get = opDef
        // Extract item schema
        if (opDef.responseSchema) {
          entity.schemas.item = opDef.responseSchema.name
        }
        break

      case 'create':
        entity.operations.create = opDef
        // Extract create request schema and item schema
        if (opDef.requestSchema) {
          entity.schemas.createRequest = opDef.requestSchema.name
        }
        if (opDef.responseSchema && !entity.schemas.item) {
          entity.schemas.item = opDef.responseSchema.name
        }
        break

      case 'update':
        entity.operations.update = opDef
        // Extract update request schema
        if (opDef.requestSchema) {
          entity.schemas.updateRequest = opDef.requestSchema.name
        }
        break

      case 'delete':
        entity.operations.delete = opDef
        break

      case 'metadata':
        entity.metadataOperation = opDef
        break

      case 'custom':
        entity.customOperations.push(opDef)
        break
    }
  }

  /**
   * Create an OperationDefinition from OpenAPI operation
   */
  private createOperationDefinition(
    path: string,
    method: HttpMethod,
    operation: OpenAPIV3.OperationObject,
    spec: OpenAPIV3.Document
  ): OperationDefinition {
    const pathParams = this.extractPathParams(operation.parameters, spec)
    const queryParams = this.extractQueryParams(operation.parameters, spec)
    const requestSchema = this.extractRequestSchema(operation.requestBody, spec)
    const responseSchema = this.extractResponseSchema(operation.responses, spec)

    return {
      operationId: operation.operationId || '',
      method,
      path,
      summary: operation.summary || operation.description,
      pathParams,
      queryParams,
      requestSchema,
      responseSchema,
      requiresAuth: this.operationRequiresAuth(operation),
    }
  }

  /**
   * Detect entity name from path
   */
  private detectEntityFromPath(path: string): string | null {
    // Remove API version prefix: /api/v1/accounts → /accounts
    const normalized = path.replace(/^\/api\/v\d+/, '')

    // Split path into segments
    const segments = normalized.split('/').filter(Boolean)
    if (segments.length === 0) return null

    // First segment is typically the entity name
    const firstSegment = segments[0]

    // Skip if it looks like a system path
    if (this.isSystemPath(firstSegment)) return null

    return firstSegment
  }

  /**
   * Detect operation type from method, path, and operationId
   */
  private detectOperationType(
    method: HttpMethod,
    path: string,
    operationId: string
  ): OperationType {
    // Check for metadata endpoint
    if (path.includes('/metadata') || path.includes('/fields/metadata')) {
      return 'metadata'
    }

    // Check for path parameters (indicates single-resource operation)
    const hasPathParam = path.includes('{')

    // Check for sub-resource paths like /accounts/{id}/transition
    const segments = path.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    const isSubResource = hasPathParam && !lastSegment.startsWith('{') && lastSegment !== 'fields'

    if (isSubResource) {
      return 'custom'
    }

    // Standard CRUD detection
    switch (method) {
      case 'get':
        return hasPathParam ? 'get' : 'list'
      case 'post':
        return hasPathParam ? 'custom' : 'create'
      case 'put':
      case 'patch':
        return 'update'
      case 'delete':
        return 'delete'
      default:
        return 'custom'
    }
  }

  /**
   * Extract sync mode from path item extensions
   */
  private extractSyncModeFromPathItem(
    pathItem: OpenAPIV3.PathItemObject
  ): SyncMode {
    const extensions = pathItem as Record<string, unknown>

    // Check new flat format: x-sync-mode
    const flatMode = extensions['x-sync-mode'] as string | undefined
    if (flatMode === 'offline') return 'offline'
    if (flatMode === 'realtime' || flatMode === 'local_first') return 'realtime'
    if (flatMode === 'api') return 'api'

    // Check legacy format: x-sync.local_first
    const syncConfig = extensions['x-sync'] as Record<string, unknown> | undefined
    if (syncConfig) {
      if (syncConfig.local_first === true) return 'realtime'
      if (syncConfig.mode === 'offline') return 'offline'
      if (syncConfig.mode === 'realtime' || syncConfig.mode === 'local_first') return 'realtime'
    }

    return 'api'
  }

  /**
   * Extract path parameters from operation
   */
  private extractPathParams(
    parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[] | undefined,
    spec: OpenAPIV3.Document
  ): ParameterDefinition[] {
    if (!parameters) return []

    return parameters
      .map((p) => this.resolveRef(p, spec) as OpenAPIV3.ParameterObject)
      .filter((p) => p.in === 'path')
      .map((p) => this.createParameterDefinition(p))
  }

  /**
   * Extract query parameters from operation
   */
  private extractQueryParams(
    parameters: (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[] | undefined,
    spec: OpenAPIV3.Document
  ): ParameterDefinition[] {
    if (!parameters) return []

    return parameters
      .map((p) => this.resolveRef(p, spec) as OpenAPIV3.ParameterObject)
      .filter((p) => p.in === 'query')
      .map((p) => this.createParameterDefinition(p))
  }

  /**
   * Create a ParameterDefinition from OpenAPI parameter
   */
  private createParameterDefinition(param: OpenAPIV3.ParameterObject): ParameterDefinition {
    const schema = param.schema as OpenAPIV3.SchemaObject | undefined

    return {
      name: param.name,
      type: schema?.type || 'string',
      format: schema?.format,
      required: param.required || false,
      description: param.description,
      default: schema?.default,
      enumValues: schema?.enum as (string | number)[] | undefined,
    }
  }

  /**
   * Extract request schema from operation
   */
  private extractRequestSchema(
    requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined,
    spec: OpenAPIV3.Document
  ): SchemaReference | undefined {
    if (!requestBody) return undefined

    const resolved = this.resolveRef(requestBody, spec) as OpenAPIV3.RequestBodyObject
    const content = resolved.content?.['application/json']
    if (!content?.schema) return undefined

    return this.extractSchemaReference(content.schema, spec)
  }

  /**
   * Extract response schema from operation (200 or 201)
   */
  private extractResponseSchema(
    responses: OpenAPIV3.ResponsesObject | undefined,
    spec: OpenAPIV3.Document
  ): SchemaReference | undefined {
    if (!responses) return undefined

    // Try 200, then 201
    const response = responses['200'] || responses['201']
    if (!response) return undefined

    const resolved = this.resolveRef(response, spec) as OpenAPIV3.ResponseObject
    const content = resolved.content?.['application/json']
    if (!content?.schema) return undefined

    return this.extractSchemaReference(content.schema, spec)
  }

  /**
   * Extract schema reference, detecting arrays and pagination
   */
  private extractSchemaReference(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    spec: OpenAPIV3.Document
  ): SchemaReference | undefined {
    // Handle $ref
    if ('$ref' in schema) {
      const name = this.extractSchemaNameFromRef(schema.$ref)
      if (!name) return undefined

      // Check if the referenced schema is a paginated response
      const resolved = this.resolveSchemaRef(schema.$ref, spec)
      const arrayProperty = this.detectPaginatedArrayProperty(resolved)

      return {
        name,
        isArray: false,
        arrayProperty,
      }
    }

    // Handle array type
    if (schema.type === 'array' && schema.items) {
      const itemRef = schema.items as OpenAPIV3.ReferenceObject
      if ('$ref' in itemRef) {
        const name = this.extractSchemaNameFromRef(itemRef.$ref)
        if (name) {
          return { name, isArray: true }
        }
      }
    }

    return undefined
  }

  /**
   * Detect if schema is a paginated response and return the array property name
   */
  private detectPaginatedArrayProperty(
    schema: OpenAPIV3.SchemaObject | undefined
  ): string | undefined {
    if (!schema || schema.type !== 'object' || !schema.properties) return undefined

    // Common pagination array property names
    const candidates = ['items', 'data', 'results', 'records']

    for (const candidate of candidates) {
      const prop = schema.properties[candidate] as OpenAPIV3.SchemaObject | undefined
      if (prop?.type === 'array') {
        return candidate
      }
    }

    return undefined
  }

  /**
   * Extract schema name from $ref
   */
  private extractSchemaNameFromRef(ref: string): string | undefined {
    // #/components/schemas/AccountCreate → AccountCreate
    const match = ref.match(/#\/components\/schemas\/(.+)/)
    return match ? match[1] : undefined
  }

  /**
   * Resolve a $ref to the actual schema
   */
  private resolveSchemaRef(
    ref: string,
    spec: OpenAPIV3.Document
  ): OpenAPIV3.SchemaObject | undefined {
    const name = this.extractSchemaNameFromRef(ref)
    if (!name) return undefined

    return spec.components?.schemas?.[name] as OpenAPIV3.SchemaObject | undefined
  }

  /**
   * Resolve $ref to actual object
   */
  private resolveRef(
    obj: unknown,
    spec: OpenAPIV3.Document
  ): unknown {
    if (typeof obj !== 'object' || obj === null) return obj
    if (!('$ref' in obj)) return obj

    const ref = (obj as { $ref: string }).$ref
    const parts = ref.replace('#/', '').split('/')

    let current: unknown = spec
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return obj
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Check if operation requires authentication
   */
  private operationRequiresAuth(operation: OpenAPIV3.OperationObject): boolean {
    return Array.isArray(operation.security) && operation.security.length > 0
  }

  /**
   * Extract auth configuration from spec
   */
  private extractAuthConfig(spec: OpenAPIV3.Document): EntityModel['auth'] {
    const schemes = spec.components?.securitySchemes || {}
    const authSchemes: EntityModel['auth']['schemes'] = []

    for (const [name, scheme] of Object.entries(schemes)) {
      const resolved = this.resolveRef(scheme, spec) as OpenAPIV3.SecuritySchemeObject
      authSchemes.push({
        name,
        type: resolved.type,
        scheme: 'scheme' in resolved ? resolved.scheme : undefined,
        bearerFormat: 'bearerFormat' in resolved ? resolved.bearerFormat : undefined,
      })
    }

    // Determine primary auth type
    const hasBearerAuth = authSchemes.some(
      (s) => s.type === 'http' && s.scheme === 'bearer'
    )

    return {
      type: hasBearerAuth ? 'bearer' : authSchemes.length > 0 ? 'apiKey' : 'none',
      schemes: authSchemes,
    }
  }

  /**
   * Check if path should be ignored
   */
  private shouldIgnorePath(path: string): boolean {
    return IGNORED_PATHS.some((ignored) => path === ignored || path.startsWith(ignored + '/'))
  }

  /**
   * Check if path segment looks like a system path
   */
  private isSystemPath(segment: string): boolean {
    const systemPaths = ['health', 'ready', 'docs', 'openapi', 'redoc', 'auth', 'login', 'logout']
    return systemPaths.includes(segment.toLowerCase())
  }
}
