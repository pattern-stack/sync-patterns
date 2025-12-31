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
  type ColumnMetadata,
  type PropertyDefinition,
  type UIType,
  type UIImportance,
  createEmptyEntityModel,
  createEmptyEntityDefinition,
  propertyToColumnMetadata,
  deriveEntityUIConfig,
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

    // Extract UI metadata for each entity from their schemas
    for (const [entityName, entity] of model.entities) {
      this.populateUIMetadata(entity, spec)
    }

    return model
  }

  /**
   * Populate UI metadata for an entity from its OpenAPI schema
   */
  private populateUIMetadata(
    entity: EntityDefinition,
    spec: OpenAPIV3.Document
  ): void {
    // Find the entity's item schema (e.g., "Account" for "accounts")
    const schemaName = entity.schemas.item
    if (!schemaName) return

    const schema = spec.components?.schemas?.[schemaName] as OpenAPIV3.SchemaObject | undefined
    if (!schema || schema.type !== 'object' || !schema.properties) return

    // Extract column metadata from schema properties
    const columns: ColumnMetadata[] = []
    const required = new Set(schema.required || [])

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const resolved = this.resolveRef(fieldSchema, spec) as OpenAPIV3.SchemaObject
      const propDef = this.extractPropertyDefinition(fieldName, resolved)
      const colMeta = propertyToColumnMetadata(propDef, required.has(fieldName))
      columns.push(colMeta)
    }

    // Store column metadata
    entity.columnMetadata = columns

    // Derive UI config from columns
    entity.uiConfig = deriveEntityUIConfig(columns, entity.name)
  }

  /**
   * Extract PropertyDefinition with UI metadata from OpenAPI schema property
   */
  private extractPropertyDefinition(
    fieldName: string,
    schema: OpenAPIV3.SchemaObject
  ): PropertyDefinition {
    // Cast to access x-ui-* extensions
    const ext = schema as Record<string, unknown>

    // Parse x-ui-reference for entity type fields
    const rawReference = ext['x-ui-reference'] as
      | { entity: string; displayField?: string }
      | undefined

    return {
      name: fieldName,
      type: schema.type as string || 'string',
      format: schema.format,
      nullable: schema.nullable,
      description: schema.description,
      ref: '$ref' in schema ? (schema as { $ref: string }).$ref : undefined,

      // Extract x-ui-* extensions
      uiType: ext['x-ui-type'] as UIType | undefined,
      uiImportance: ext['x-ui-importance'] as UIImportance | undefined,
      uiGroup: ext['x-ui-group'] as string | undefined,
      uiLabel: ext['x-ui-label'] as string | undefined,
      uiFormat: ext['x-ui-format'] as Record<string, unknown> | undefined,
      uiSortable: ext['x-ui-sortable'] as boolean | undefined,
      uiFilterable: ext['x-ui-filterable'] as boolean | undefined,
      uiVisible: ext['x-ui-visible'] as boolean | undefined,
      uiHelp: ext['x-ui-help'] as string | undefined,
      uiPlaceholder: ext['x-ui-placeholder'] as string | undefined,
      uiOptions: (schema.enum as string[]) ?? (ext['x-ui-options'] as string[] | undefined),
      uiReference: rawReference,
    }
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
    // Detect entity name from first operation's tags (or fallback to path)
    const methods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete']
    let entityName: string | null = null

    // Try to detect entity from first available operation
    for (const method of methods) {
      const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined
      if (operation) {
        entityName = this.detectEntityFromOperation(path, operation)
        if (entityName) break
      }
    }

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
    for (const method of methods) {
      const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined
      if (!operation) continue

      // Skip system operations (health checks, auth, etc.)
      if (this.isSystemOperation(operation)) continue

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
    const operationType = this.detectOperationType(method, path, operation, entity.name, spec)
    const pathItem = spec.paths?.[path] as OpenAPIV3.PathItemObject
    const opDef = this.createOperationDefinition(path, method, operation, pathItem, spec)

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
    pathItem: OpenAPIV3.PathItemObject,
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
      requiresAuth: this.operationRequiresAuth(operation, pathItem, spec),
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
   * Detect operation type using operationId patterns
   *
   * Uses the explicit operationId from the OpenAPI spec rather than
   * inferring from path patterns. This is more reliable because:
   * - Backend explicitly names operations
   * - Catches collection-level custom endpoints (e.g., /accounts/stages)
   * - No fragile path pattern matching
   */
  private detectOperationType(
    method: HttpMethod,
    path: string,
    operation: OpenAPIV3.OperationObject,
    entityName: string,
    spec: OpenAPIV3.Document
  ): OperationType {
    const operationId = operation.operationId || ''

    // Extract operation name: "list_accounts_api_v1_accounts_get" → "list_accounts"
    const opName = this.extractOperationName(operationId)
    const singular = this.singularize(entityName)

    // Check for metadata endpoint (explicit path check is fine here)
    if (path.includes('/fields/metadata')) {
      return 'metadata'
    }

    // CRUD detection by operationId prefix
    // Match against both plural (accounts) and singular (account) entity names
    const entityPattern = new RegExp(`(${entityName}|${singular})`, 'i')

    if (opName.startsWith('list_') && entityPattern.test(opName)) {
      return 'list'
    }

    if (opName.startsWith('create_') && entityPattern.test(opName)) {
      return 'create'
    }

    // 'get_' can be either single-item get (with {id}) or collection list (without {id})
    // e.g., "get_account" with {id} is CRUD get, "get_public_data" without {id} is list
    if (opName.startsWith('get_') && entityPattern.test(opName)) {
      const hasEntityIdParam = this.operationHasIdParam(operation, spec)
      return hasEntityIdParam ? 'get' : 'list'
    }

    if (opName.startsWith('update_') && entityPattern.test(opName)) {
      return 'update'
    }

    // Only explicit 'delete_' is CRUD delete; 'archive_' is a custom soft-delete operation
    if (opName.startsWith('delete_') && entityPattern.test(opName)) {
      return 'delete'
    }

    // If operationId doesn't mention the entity at all, it's likely a custom operation
    // e.g., "get_stage_metadata" under /accounts/stages is custom, not CRUD
    if (operationId && !entityPattern.test(opName)) {
      return 'custom'
    }

    // Fallback: use method + path pattern for specs without conventional operationIds
    // This handles legacy specs where operationId mentions entity but without list_/create_ prefix
    // e.g., "get_public_data" for GET /public (should be list since no {id} param)
    return this.detectOperationTypeByMethodAndPath(method, path, operation, spec)
  }

  /**
   * Fallback operation type detection using HTTP method and path pattern
   * Used when operationId doesn't follow standard naming conventions
   */
  private detectOperationTypeByMethodAndPath(
    method: HttpMethod,
    path: string,
    operation: OpenAPIV3.OperationObject,
    spec: OpenAPIV3.Document
  ): OperationType {
    const hasEntityIdParam = this.operationHasIdParam(operation, spec)

    switch (method) {
      case 'get':
        return hasEntityIdParam ? 'get' : 'list'
      case 'post':
        return hasEntityIdParam ? 'custom' : 'create'
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
   * Extract operation name from operationId
   * "list_accounts_api_v1_accounts_get" → "list_accounts"
   */
  private extractOperationName(operationId: string): string {
    // Split on _api_ to get the operation name part
    const parts = operationId.split('_api_')
    return parts[0] || operationId
  }

  /**
   * Check if operation has an ID parameter using structured parameter data
   *
   * This method uses the operation.parameters array instead of regex on the path string,
   * which is more reliable because:
   * - Uses the structured OpenAPI spec data
   * - Avoids fragile regex matching
   * - Works with any parameter naming convention
   */
  private operationHasIdParam(
    operation: OpenAPIV3.OperationObject,
    spec: OpenAPIV3.Document
  ): boolean {
    const pathParams = this.extractPathParams(operation.parameters, spec)
    return pathParams.some(p =>
      p.name === 'id' ||
      p.name.endsWith('_id') ||
      p.name.endsWith('Id')
    )
  }

  /**
   * Check if path has an entity ID parameter (legacy fallback)
   * /accounts/{account_id} → true
   * /accounts/stages → false
   *
   * @deprecated Use operationHasIdParam instead
   */
  private pathHasEntityIdParam(path: string, entityName: string): boolean {
    const singular = this.singularize(entityName)
    // Match patterns like {account_id}, {accountId}, {id}
    const idPattern = new RegExp(`\\{(${singular}_id|${singular}Id|id)\\}`, 'i')
    return idPattern.test(path)
  }

  /**
   * Simple singularize - handles common patterns
   */
  private singularize(name: string): string {
    if (name.endsWith('ies')) return name.slice(0, -3) + 'y'
    if (name.endsWith('es') && !name.endsWith('ses')) return name.slice(0, -2)
    if (name.endsWith('s')) return name.slice(0, -1)
    return name
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
   *
   * Checks security at three levels (in order of precedence):
   * 1. Operation-level security (operation.security)
   * 2. Path-level security (pathItem.security)
   * 3. Global security (spec.security)
   *
   * Note: An explicit empty array [] means "no auth required" (overrides global)
   */
  private operationRequiresAuth(
    operation: OpenAPIV3.OperationObject,
    pathItem: OpenAPIV3.PathItemObject,
    spec: OpenAPIV3.Document
  ): boolean {
    // Check operation-level security first
    if (operation.security !== undefined) {
      // Explicit empty array means "no auth required" (overrides global/path)
      if (Array.isArray(operation.security) && operation.security.length === 0) {
        return false
      }
      // Non-empty array means auth is required
      return Array.isArray(operation.security) && operation.security.length > 0
    }

    // Check path-level security next
    if (pathItem.security !== undefined) {
      if (Array.isArray(pathItem.security) && pathItem.security.length === 0) {
        return false
      }
      return Array.isArray(pathItem.security) && pathItem.security.length > 0
    }

    // Check global security last
    if (spec.security !== undefined) {
      if (Array.isArray(spec.security) && spec.security.length === 0) {
        return false
      }
      return Array.isArray(spec.security) && spec.security.length > 0
    }

    // No security defined anywhere - no auth required
    return false
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

  /**
   * Check if tag looks like a system tag
   */
  private isSystemTag(tag: string): boolean {
    const systemTags = ['health', 'system', 'internal', 'auth', 'authentication', 'docs', 'default', 'utility']
    return systemTags.includes(tag.toLowerCase())
  }

  /**
   * Check if operation is a system operation based on tags
   *
   * System operations (health checks, auth, docs, etc.) should be filtered out
   * from entity processing. This method uses OpenAPI tags as the primary
   * detection mechanism.
   */
  private isSystemOperation(operation: OpenAPIV3.OperationObject): boolean {
    const tags = operation.tags?.map(t => t.toLowerCase()) || []
    return tags.some(tag => this.isSystemTag(tag))
  }

  /**
   * Detect entity name from operation using tags as primary source
   *
   * Uses OpenAPI tags (explicit grouping from backend) as the primary source
   * for entity detection, with path parsing as a fallback. This is more reliable
   * because tags are explicitly set by the backend developer.
   *
   * Examples:
   * - Tag "Accounts" → "accounts" (single word, use as-is)
   * - Tag "Legacy" → "legacy" (single word, use as-is)
   * - Tag "Account Fields" → "accounts" (multi-word, use first word pluralized)
   * - No tags → falls back to path parsing
   */
  private detectEntityFromOperation(
    path: string,
    operation: OpenAPIV3.OperationObject
  ): string | null {
    // Primary: use tags (explicit grouping from backend)
    const tags = operation.tags
    if (tags && tags.length > 0) {
      // Normalize tag to entity name
      const tag = tags[0].toLowerCase()

      // Skip system tags
      if (this.isSystemTag(tag)) return null

      // Check if multi-word tag
      const words = tag.split(/[\s-]/)

      if (words.length === 1) {
        // Single-word tag: use as-is (already in intended form)
        // "Accounts" → "accounts", "Legacy" → "legacy"
        return tag
      } else {
        // Multi-word tag: take first word and pluralize
        // "Account Fields" → "accounts"
        const firstWord = words[0]
        return this.pluralize(firstWord)
      }
    }

    // Fallback: path parsing for specs without tags
    return this.detectEntityFromPath(path)
  }

  /**
   * Simple pluralize - handles common patterns
   */
  private pluralize(name: string): string {
    // Already plural
    if (name.endsWith('s')) return name
    // Consonant + y → ies (e.g., "category" → "categories")
    if (name.endsWith('y') && name.length > 1 && !/[aeiou]/.test(name[name.length - 2])) {
      return name.slice(0, -1) + 'ies'
    }
    // Default: add 's'
    return name + 's'
  }
}
