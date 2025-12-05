/**
 * Entity Wrapper Generator
 *
 * Generates unified entity modules that colocate:
 * - All related schemas (re-exported from schemas/)
 * - All related hooks (re-exported from hooks/)
 * - Unified wrapper functions that abstract TanStack DB vs Query
 *
 * Key design decisions:
 * 1. Colocate all types related to an entity in one place
 * 2. Re-export from existing schemas/ and hooks/ (not duplicating code)
 * 3. Use operationId patterns to detect CRUD operations
 * 4. Handle path parameter naming correctly (e.g., account_id vs id)
 */

import type { ParsedOpenAPI, ParsedEndpoint, ParsedSchema } from './parser.js'
import { cleanOperationId, toPascalCase as namingToPascalCase } from './naming.js'

export interface GeneratedEntityWrappers {
  /** Map of entity name to wrapper code */
  wrappers: Map<string, string>
  /** Combined index file */
  index: string
  /** Shared types file */
  types: string
}

export interface EntityGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<EntityGeneratorOptions> = {
  includeJSDoc: true,
}

/**
 * Represents a detected CRUD operation from an endpoint
 */
interface CrudOperation {
  type: 'list' | 'get' | 'create' | 'update' | 'delete'
  hookName: string
  /** Path parameter name for get/update/delete (e.g., "account_id") */
  pathParamName?: string
  /** The operationId this came from */
  operationId: string
}

/**
 * Sync mode for an entity
 */
type SyncMode = 'api' | 'realtime' | 'offline'

/**
 * Information about an entity extracted from endpoints
 */
interface EntityInfo {
  name: string           // singular: "account"
  namePlural: string     // plural: "accounts"
  pascalName: string     // "Account"
  syncMode: SyncMode     // 'api', 'realtime', or 'offline'
  operations: CrudOperation[]
  /** All hook names for this entity (for re-export) */
  allHookNames: Set<string>
  /** All schema names that belong to this entity */
  relatedSchemas: Set<string>
  /** Types we need to import (detected from response schemas) */
  responseTypes: Set<string>
  /** Types we need for create/update (detected from request schemas) */
  requestTypes: Set<string>
}

export class EntityGenerator {
  private options: Required<EntityGeneratorOptions>

  constructor(options: EntityGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedEntityWrappers {
    const wrappers = new Map<string, string>()
    const entities = this.getEntityInfo(parsedAPI.endpoints, parsedAPI.schemas)

    for (const entity of entities) {
      // Only generate wrapper if entity has at least one CRUD operation
      if (entity.operations.length === 0) continue

      const code = this.generateWrapper(entity)
      wrappers.set(entity.namePlural, code)
    }

    // Generate shared types file
    const types = this.generateSharedTypes()

    // Generate index file
    const index = this.generateIndex(Array.from(wrappers.keys()))

    return { wrappers, index, types }
  }

  /**
   * Extract entity information from endpoints using operationId patterns
   */
  private getEntityInfo(endpoints: ParsedEndpoint[], schemas: ParsedSchema[]): EntityInfo[] {
    const entityMap = new Map<string, EntityInfo>()

    for (const endpoint of endpoints) {
      // Extract entity name from path
      const entityNamePlural = this.extractEntityName(endpoint.path)
      if (!entityNamePlural) continue

      // Get or create entity info
      let entityInfo = entityMap.get(entityNamePlural)
      if (!entityInfo) {
        const singular = this.singularize(entityNamePlural)
        entityInfo = {
          name: singular,
          namePlural: entityNamePlural,
          pascalName: this.toPascalCase(singular),
          syncMode: 'api',
          operations: [],
          allHookNames: new Set(),
          relatedSchemas: new Set(),
          responseTypes: new Set(),
          requestTypes: new Set(),
        }
        entityMap.set(entityNamePlural, entityInfo)
      }

      // Update sync mode from endpoint
      const endpointSyncMode = this.getSyncMode(endpoint)
      if (endpointSyncMode !== 'api') {
        // Prefer non-api sync modes (realtime/offline)
        entityInfo.syncMode = endpointSyncMode
      }

      // Collect ALL hook names for this entity's endpoints
      if (endpoint.operationId) {
        const cleanId = cleanOperationId(endpoint.operationId)
        const hookName = `use${namingToPascalCase(cleanId)}`
        entityInfo.allHookNames.add(hookName)
      }

      // Detect CRUD operation from operationId
      const operation = this.detectCrudOperation(endpoint, entityInfo.name)
      if (operation) {
        // Check if we already have this operation type (keep first one found)
        const existing = entityInfo.operations.find(op => op.type === operation.type)
        if (!existing) {
          entityInfo.operations.push(operation)
        }
      }

      // Extract response types
      this.extractResponseTypes(endpoint, entityInfo)

      // Extract request types
      this.extractRequestTypes(endpoint, entityInfo)
    }

    // Now find all schemas related to each entity
    for (const entity of entityMap.values()) {
      this.findRelatedSchemas(entity, schemas)
    }

    return Array.from(entityMap.values())
  }

  /**
   * Find all schemas that belong to an entity based on naming patterns
   */
  private findRelatedSchemas(entity: EntityInfo, schemas: ParsedSchema[]): void {
    const { pascalName } = entity

    for (const schema of schemas) {
      if (!schema.name) continue

      // Check if schema name starts with entity's pascal name
      // e.g., Account, AccountCreate, AccountUpdate, AccountOwner, AccountListResponse
      if (schema.name.startsWith(pascalName)) {
        entity.relatedSchemas.add(schema.name)
      }
    }

    // Also add any types we discovered from endpoints that might not match the pattern
    for (const rt of entity.responseTypes) {
      entity.relatedSchemas.add(rt)
    }
    for (const rt of entity.requestTypes) {
      entity.relatedSchemas.add(rt)
    }
  }

  /**
   * Detect CRUD operation type from operationId
   */
  private detectCrudOperation(endpoint: ParsedEndpoint, entityName: string): CrudOperation | null {
    if (!endpoint.operationId) return null

    const cleanId = cleanOperationId(endpoint.operationId)
    const parts = cleanId.split('_')
    const action = parts[0]?.toLowerCase()

    // Check if this operation is for this entity
    const entityInOpId = parts.slice(1).join('_').toLowerCase()
    const entityMatches =
      entityInOpId === entityName.toLowerCase() ||
      entityInOpId === this.pluralize(entityName).toLowerCase() ||
      entityInOpId.startsWith(entityName.toLowerCase() + '_') ||
      entityInOpId.startsWith(this.pluralize(entityName).toLowerCase() + '_')

    if (!entityMatches && action !== 'search') {
      if (action === 'search' && parts[1]?.toLowerCase() === this.pluralize(entityName).toLowerCase()) {
        // search_accounts → list operation for accounts
      } else {
        return null
      }
    }

    // Extract path parameter name for operations that need it
    const pathParamMatch = endpoint.path.match(/\{([^}]+)\}/)
    const pathParamName = pathParamMatch?.[1]

    // Generate hook name using the naming convention
    const hookName = `use${namingToPascalCase(cleanId)}`

    switch (action) {
      case 'list':
      case 'search':
        return { type: 'list', hookName, operationId: endpoint.operationId }

      case 'get':
        if (endpoint.method === 'get' && pathParamName) {
          return { type: 'get', hookName, pathParamName, operationId: endpoint.operationId }
        }
        return null

      case 'create':
        if (endpoint.method === 'post') {
          return { type: 'create', hookName, operationId: endpoint.operationId }
        }
        return null

      case 'update':
        if (endpoint.method === 'put' || endpoint.method === 'patch') {
          return { type: 'update', hookName, pathParamName, operationId: endpoint.operationId }
        }
        return null

      case 'delete':
      case 'archive':
      case 'remove':
        if (endpoint.method === 'delete') {
          return { type: 'delete', hookName, pathParamName, operationId: endpoint.operationId }
        }
        return null

      default:
        return null
    }
  }

  /**
   * Extract response types from endpoint
   */
  private extractResponseTypes(endpoint: ParsedEndpoint, entityInfo: EntityInfo): void {
    for (const response of endpoint.responses) {
      if (response.statusCode.startsWith('2') && response.content) {
        const jsonContent = response.content['application/json']
        if (jsonContent?.schema?.ref) {
          const typeName = this.extractTypeNameFromRef(jsonContent.schema.ref)
          if (typeName) {
            entityInfo.responseTypes.add(typeName)
          }
        }
      }
    }
  }

  /**
   * Extract request types from endpoint
   */
  private extractRequestTypes(endpoint: ParsedEndpoint, entityInfo: EntityInfo): void {
    if (endpoint.requestBody?.content) {
      const jsonContent = endpoint.requestBody.content['application/json']
      if (jsonContent?.schema?.ref) {
        const typeName = this.extractTypeNameFromRef(jsonContent.schema.ref)
        if (typeName) {
          entityInfo.requestTypes.add(typeName)
        }
      }
    }
  }

  /**
   * Extract type name from $ref
   */
  private extractTypeNameFromRef(ref: string): string | null {
    const match = ref.match(/#\/components\/schemas\/(.+)/)
    return match?.[1] || null
  }

  /**
   * Generate unified wrapper for an entity
   */
  private generateWrapper(entity: EntityInfo): string {
    const lines: string[] = []
    const { namePlural, pascalName, syncMode, operations, relatedSchemas, allHookNames } = entity
    const hasCollection = syncMode !== 'api'

    // Determine which operations we have
    const hasOp = {
      list: operations.some(op => op.type === 'list'),
      get: operations.some(op => op.type === 'get'),
      create: operations.some(op => op.type === 'create'),
      update: operations.some(op => op.type === 'update'),
      delete: operations.some(op => op.type === 'delete'),
    }

    // File header
    lines.push(this.generateFileHeader(pascalName))
    lines.push('')

    // Module JSDoc
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * ${pascalName} Entity Module`)
      lines.push(' *')
      lines.push(' * Colocates all schemas, hooks, and unified wrappers for this entity.')
      lines.push(' * Import from here for a complete, self-contained API for this entity.')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(` * import { ${pascalName}Create, useCreate${pascalName}, use${pascalName}s } from './entities/${this.toKebabCase(namePlural)}'`)
      lines.push(' */')
      lines.push('')
    }

    // =========================================================================
    // SECTION 1: Re-export all related schemas
    // =========================================================================
    lines.push('// ============================================================================')
    lines.push('// SCHEMAS - All types related to this entity')
    lines.push('// ============================================================================')
    lines.push('')

    if (relatedSchemas.size > 0) {
      // Export types
      const sortedSchemas = Array.from(relatedSchemas).sort()
      lines.push(`export type {`)
      for (const schema of sortedSchemas) {
        lines.push(`  ${schema},`)
      }
      lines.push(`} from '../schemas/index'`)
      lines.push('')

      // Export schema validators (Zod schemas)
      lines.push(`export {`)
      for (const schema of sortedSchemas) {
        lines.push(`  ${schema}Schema,`)
      }
      lines.push(`} from '../schemas/index'`)
      lines.push('')
    }

    // =========================================================================
    // SECTION 2: Re-export NON-CRUD hooks (CRUD hooks are replaced by unified wrappers)
    // =========================================================================
    // Build set of hooks that have unified wrappers (don't re-export these)
    const unifiedWrapperHooks = new Set<string>()
    for (const op of operations) {
      unifiedWrapperHooks.add(op.hookName)
    }

    // Filter to only hooks that don't have unified wrappers
    const hooksToReExport = Array.from(allHookNames).filter(h => !unifiedWrapperHooks.has(h)).sort()

    if (hooksToReExport.length > 0) {
      lines.push('// ============================================================================')
      lines.push('// HOOKS - Additional TanStack Query hooks for this entity')
      lines.push('// (CRUD hooks are replaced by unified wrappers below)')
      lines.push('// ============================================================================')
      lines.push('')
      lines.push(`export {`)
      for (const hook of hooksToReExport) {
        lines.push(`  ${hook},`)
      }
      lines.push(`} from '../hooks/index'`)
      lines.push('')
    }

    // =========================================================================
    // SECTION 3: Internal imports for unified wrappers
    // =========================================================================
    // These are internal - we use hooks.* for the wrapper implementations

    if (hasCollection) {
      lines.push("import { getSyncMode } from '../config'")
      // SyncMode type not needed - getSyncMode returns it
      // TanStack DB React integration for live queries
      lines.push("import { useLiveQuery } from '@tanstack/react-db'")
      // Query operators for filtering
      lines.push("import { eq } from '@tanstack/db'")

      // Import the correct collection based on sync mode
      const collectionBaseName = this.toCamelCase(namePlural)
      const kebabName = this.toKebabCase(namePlural)
      if (syncMode === 'realtime') {
        lines.push(`import { ${collectionBaseName}RealtimeCollection } from '../collections/${kebabName}.realtime'`)
      } else if (syncMode === 'offline') {
        lines.push(`import { ${collectionBaseName}OfflineCollection } from '../collections/${kebabName}.offline'`)
      }
    }

    // Import hooks as namespace for internal use
    lines.push("import * as hooks from '../hooks/index'")

    // Import types we need for the wrapper functions
    const wrapperTypes = this.getWrapperTypeImports(entity)
    if (wrapperTypes.length > 0) {
      lines.push(`import type { ${wrapperTypes.join(', ')} } from '../schemas/index'`)
    }

    lines.push("import type { UnifiedQueryResult, UnifiedMutationResult } from './types'")
    lines.push('')

    // =========================================================================
    // SECTION 4: Unified wrapper functions
    // =========================================================================
    lines.push('// ============================================================================')
    lines.push('// UNIFIED WRAPPERS - Abstract TanStack DB vs Query')
    lines.push('// ============================================================================')
    lines.push('')

    if (hasOp.list) {
      const listOp = operations.find(op => op.type === 'list')!
      lines.push(this.generateListHook(entity, listOp))
      lines.push('')
    }

    if (hasOp.get) {
      const getOp = operations.find(op => op.type === 'get')!
      lines.push(this.generateGetHook(entity, getOp))
      lines.push('')
    }

    if (hasOp.create) {
      const createOp = operations.find(op => op.type === 'create')!
      lines.push(this.generateCreateHook(entity, createOp))
      lines.push('')
    }

    if (hasOp.update) {
      const updateOp = operations.find(op => op.type === 'update')!
      lines.push(this.generateUpdateHook(entity, updateOp))
      lines.push('')
    }

    if (hasOp.delete) {
      const deleteOp = operations.find(op => op.type === 'delete')!
      lines.push(this.generateDeleteHook(entity, deleteOp))
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Get type imports needed for wrapper function signatures
   */
  private getWrapperTypeImports(entity: EntityInfo): string[] {
    const types = new Set<string>()
    const { pascalName, requestTypes } = entity

    // Get entity type for return values
    const entityType = this.getEntityType(entity)
    types.add(entityType)

    // Add Create type if it exists
    const createType = `${pascalName}Create`
    if (requestTypes.has(createType)) {
      types.add(createType)
    }

    // Add Update type if it exists
    const updateType = `${pascalName}Update`
    if (requestTypes.has(updateType)) {
      types.add(updateType)
    }

    return Array.from(types).sort()
  }

  /**
   * Get the main entity type for list/get operations
   */
  private getEntityType(entity: EntityInfo): string {
    const { pascalName, responseTypes } = entity

    const candidates = [
      pascalName,
      `${pascalName}Owner`,
      `${pascalName}Response`,
    ]

    for (const candidate of candidates) {
      if (responseTypes.has(candidate)) {
        return candidate
      }
    }

    const firstResponse = Array.from(responseTypes)[0]
    return firstResponse || pascalName
  }

  private generateListHook(entity: EntityInfo, operation: CrudOperation): string {
    const { namePlural, pascalName, syncMode } = entity
    const entityType = this.getEntityType(entity)
    const hasCollection = syncMode !== 'api'
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Fetch all ${namePlural}.`)
      lines.push(' * Unified wrapper - uses TanStack DB or Query based on config.')
      lines.push(' */')
    }

    lines.push(`export function use${pascalName}s(): UnifiedQueryResult<${entityType}[]> {`)

    if (hasCollection) {
      const collName = this.toCamelCase(namePlural)
      const collSuffix = syncMode === 'realtime' ? 'Realtime' : 'Offline'
      const collectionName = `${collName}${collSuffix}Collection`
      const modeCheck = syncMode === 'realtime' ? 'realtime' : 'offline'

      lines.push(`  const mode = getSyncMode('${namePlural}')`)
      lines.push('')
      lines.push(`  if (mode === '${modeCheck}') {`)
      lines.push('    // Use TanStack DB live query for reactive data')
      lines.push(`    const { data } = useLiveQuery((q) =>`)
      lines.push(`      q.from({ item: ${collectionName} })`)
      lines.push(`        .select(({ item }) => item)`)
      lines.push('    )')
      lines.push('    return {')
      lines.push(`      data: data as ${entityType}[] | undefined,`)
      lines.push('      isLoading: data === undefined,')
      lines.push('      error: null,')
      lines.push('    }')
      lines.push('  }')
      lines.push('')
    }

    // API mode (default)
    lines.push('  // api mode - use TanStack Query')
    lines.push(`  const result = hooks.${operation.hookName}()`)
    lines.push('  return {')
    lines.push(`    data: result.data as ${entityType}[] | undefined,`)
    lines.push('    isLoading: result.isLoading,')
    lines.push('    error: (result.error as Error) ?? null,')
    lines.push('  }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateGetHook(entity: EntityInfo, operation: CrudOperation): string {
    const { namePlural, pascalName, syncMode, name } = entity
    const entityType = this.getEntityType(entity)
    const hasCollection = syncMode !== 'api'
    const paramName = operation.pathParamName || 'id'
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Fetch a single ${name} by ID.`)
      lines.push(' * Unified wrapper - uses TanStack DB or Query based on config.')
      lines.push(' */')
    }

    lines.push(`export function use${pascalName}(id: string): UnifiedQueryResult<${entityType} | undefined> {`)

    if (hasCollection) {
      const collName = this.toCamelCase(namePlural)
      const collSuffix = syncMode === 'realtime' ? 'Realtime' : 'Offline'
      const collectionName = `${collName}${collSuffix}Collection`
      const modeCheck = syncMode === 'realtime' ? 'realtime' : 'offline'

      lines.push(`  const mode = getSyncMode('${namePlural}')`)
      lines.push('')
      lines.push(`  if (mode === '${modeCheck}') {`)
      lines.push('    // Use TanStack DB live query with filter')
      lines.push(`    const { data } = useLiveQuery((q) =>`)
      lines.push(`      q.from({ item: ${collectionName} })`)
      lines.push(`        .where(({ item }) => eq(item.id, id))`)
      lines.push(`        .select(({ item }) => item)`)
      lines.push('    )')
      lines.push('    return {')
      lines.push(`      data: data?.[0] as ${entityType} | undefined,`)
      lines.push('      isLoading: data === undefined,')
      lines.push('      error: null,')
      lines.push('    }')
      lines.push('  }')
      lines.push('')
    }

    // API mode (default)
    lines.push('  // api mode - use TanStack Query')
    lines.push(`  const result = hooks.${operation.hookName}({ ${paramName}: id })`)
    lines.push('  return {')
    lines.push(`    data: result.data as ${entityType} | undefined,`)
    lines.push('    isLoading: result.isLoading,')
    lines.push('    error: (result.error as Error) ?? null,')
    lines.push('  }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateCreateHook(entity: EntityInfo, operation: CrudOperation): string {
    const { namePlural, pascalName, syncMode, requestTypes } = entity
    const entityType = this.getEntityType(entity)
    const hasCollection = syncMode !== 'api'
    const createType = requestTypes.has(`${pascalName}Create`) ? `${pascalName}Create` : 'Record<string, unknown>'
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Create a new ${entity.name}.`)
      lines.push(' * Unified wrapper - uses TanStack DB or Query based on config.')
      lines.push(' */')
    }

    lines.push(`export function useCreate${pascalName}(): UnifiedMutationResult<${entityType}, ${createType}> {`)

    if (hasCollection) {
      const collName = this.toCamelCase(namePlural)
      const collSuffix = syncMode === 'realtime' ? 'Realtime' : 'Offline'
      const collectionName = `${collName}${collSuffix}Collection`
      const modeCheck = syncMode === 'realtime' ? 'realtime' : 'offline'

      lines.push(`  const mode = getSyncMode('${namePlural}')`)
      lines.push('')
      lines.push(`  if (mode === '${modeCheck}') {`)
      lines.push('    return {')
      lines.push(`      mutate: (data: ${createType}) => {`)
      lines.push(`        ${collectionName}.insert({`)
      lines.push('          ...data,')
      lines.push('          id: crypto.randomUUID(),')
      lines.push('          created_at: new Date().toISOString(),')
      lines.push('          updated_at: new Date().toISOString(),')
      lines.push(`        } as unknown as ${entityType})`)
      lines.push('      },')
      lines.push(`      mutateAsync: async (data: ${createType}) => {`)
      lines.push('        const doc = {')
      lines.push('          ...data,')
      lines.push('          id: crypto.randomUUID(),')
      lines.push('          created_at: new Date().toISOString(),')
      lines.push('          updated_at: new Date().toISOString(),')
      lines.push('        }')
      lines.push(`        await ${collectionName}.insert(doc as unknown as ${entityType})`)
      lines.push(`        return doc as unknown as ${entityType}`)
      lines.push('      },')
      lines.push('      isPending: false, // Optimistic - always instant')
      lines.push('      error: null,')
      lines.push('    }')
      lines.push('  }')
      lines.push('')
    }

    // API mode (default)
    lines.push('  // api mode')
    lines.push(`  const mutation = hooks.${operation.hookName}()`)
    lines.push('  return {')
    lines.push(`    mutate: (data: ${createType}) => mutation.mutate(data as Record<string, unknown>),`)
    lines.push(`    mutateAsync: async (data: ${createType}) => mutation.mutateAsync(data as Record<string, unknown>) as Promise<${entityType}>,`)
    lines.push('    isPending: mutation.isPending,')
    lines.push('    error: (mutation.error as Error) ?? null,')
    lines.push('  }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateUpdateHook(entity: EntityInfo, operation: CrudOperation): string {
    const { namePlural, pascalName, syncMode, requestTypes } = entity
    const entityType = this.getEntityType(entity)
    const hasCollection = syncMode !== 'api'
    const updateType = requestTypes.has(`${pascalName}Update`) ? `${pascalName}Update` : 'Record<string, unknown>'
    const paramName = operation.pathParamName || 'id'
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Update an existing ${entity.name}.`)
      lines.push(' * Unified wrapper - uses TanStack DB or Query based on config.')
      lines.push(' */')
    }

    lines.push(`export function useUpdate${pascalName}(): UnifiedMutationResult<${entityType}, { id: string; data: ${updateType} }> {`)

    if (hasCollection) {
      const collName = this.toCamelCase(namePlural)
      const collSuffix = syncMode === 'realtime' ? 'Realtime' : 'Offline'
      const collectionName = `${collName}${collSuffix}Collection`
      const modeCheck = syncMode === 'realtime' ? 'realtime' : 'offline'

      lines.push(`  const mode = getSyncMode('${namePlural}')`)
      lines.push('')
      lines.push(`  if (mode === '${modeCheck}') {`)
      lines.push('    return {')
      lines.push(`      mutate: ({ id, data }: { id: string; data: ${updateType} }) => {`)
      lines.push(`        ${collectionName}.update(id, (draft) => Object.assign(draft, { ...data, updated_at: new Date().toISOString() }))`)
      lines.push('      },')
      lines.push(`      mutateAsync: async ({ id, data }: { id: string; data: ${updateType} }) => {`)
      lines.push(`        await ${collectionName}.update(id, (draft) => Object.assign(draft, { ...data, updated_at: new Date().toISOString() }))`)
      lines.push(`        return { id, ...data } as unknown as ${entityType}`)
      lines.push('      },')
      lines.push('      isPending: false, // Optimistic - always instant')
      lines.push('      error: null,')
      lines.push('    }')
      lines.push('  }')
      lines.push('')
    }

    // API mode (default)
    lines.push('  // api mode')
    lines.push(`  const mutation = hooks.${operation.hookName}()`)
    lines.push('  return {')
    lines.push(`    mutate: ({ id, data }: { id: string; data: ${updateType} }) => mutation.mutate({ pathParams: { ${paramName}: id }, ...data }),`)
    lines.push(`    mutateAsync: async ({ id, data }: { id: string; data: ${updateType} }) => mutation.mutateAsync({ pathParams: { ${paramName}: id }, ...data }) as Promise<${entityType}>,`)
    lines.push('    isPending: mutation.isPending,')
    lines.push('    error: (mutation.error as Error) ?? null,')
    lines.push('  }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateDeleteHook(entity: EntityInfo, operation: CrudOperation): string {
    const { namePlural, pascalName, syncMode } = entity
    const hasCollection = syncMode !== 'api'
    const paramName = operation.pathParamName || 'id'
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Delete ${this.getArticle(entity.name)} ${entity.name}.`)
      lines.push(' * Unified wrapper - uses TanStack DB or Query based on config.')
      lines.push(' */')
    }

    lines.push(`export function useDelete${pascalName}(): UnifiedMutationResult<void, string> {`)

    if (hasCollection) {
      const collName = this.toCamelCase(namePlural)
      const collSuffix = syncMode === 'realtime' ? 'Realtime' : 'Offline'
      const collectionName = `${collName}${collSuffix}Collection`
      const modeCheck = syncMode === 'realtime' ? 'realtime' : 'offline'

      lines.push(`  const mode = getSyncMode('${namePlural}')`)
      lines.push('')
      lines.push(`  if (mode === '${modeCheck}') {`)
      lines.push('    return {')
      lines.push('      mutate: (id: string) => {')
      lines.push(`        ${collectionName}.delete(id)`)
      lines.push('      },')
      lines.push('      mutateAsync: async (id: string) => {')
      lines.push(`        await ${collectionName}.delete(id)`)
      lines.push('      },')
      lines.push('      isPending: false, // Optimistic - always instant')
      lines.push('      error: null,')
      lines.push('    }')
      lines.push('  }')
      lines.push('')
    }

    // API mode (default)
    lines.push('  // api mode')
    lines.push(`  const mutation = hooks.${operation.hookName}()`)
    lines.push('  return {')
    lines.push(`    mutate: (id: string) => mutation.mutate({ pathParams: { ${paramName}: id } }),`)
    lines.push(`    mutateAsync: async (id: string) => { await mutation.mutateAsync({ pathParams: { ${paramName}: id } }) },`)
    lines.push('    isPending: mutation.isPending,')
    lines.push('    error: (mutation.error as Error) ?? null,')
    lines.push('  }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateSharedTypes(): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Entity Wrapper Types'))
    lines.push('')
    lines.push('/**')
    lines.push(' * Shared types for unified entity wrappers')
    lines.push(' */')
    lines.push('')

    lines.push('export interface UnifiedQueryResult<T> {')
    lines.push('  data: T | undefined')
    lines.push('  isLoading: boolean')
    lines.push('  error: Error | null')
    lines.push('  /** Refetch data. No-op in realtime mode (data auto-updates). */')
    lines.push('  refetch?: () => void')
    lines.push('}')
    lines.push('')

    lines.push('export interface UnifiedMutationResult<TData, TVariables> {')
    lines.push('  mutate: (variables: TVariables) => void')
    lines.push('  mutateAsync: (variables: TVariables) => Promise<TData>')
    lines.push('  isPending: boolean')
    lines.push('  error: Error | null')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  private generateIndex(entityNames: string[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Entity Modules Index'))
    lines.push('')
    lines.push('/**')
    lines.push(' * Entity modules - colocated schemas, hooks, and unified wrappers')
    lines.push(' *')
    lines.push(' * Each entity module exports:')
    lines.push(' * - All related types (e.g., Account, AccountCreate, AccountUpdate)')
    lines.push(' * - All related Zod schemas (e.g., AccountSchema, AccountCreateSchema)')
    lines.push(' * - All related hooks (e.g., useListAccounts, useCreateAccount)')
    lines.push(' * - Unified wrappers (e.g., useAccounts, useAccount, useCreateAccount)')
    lines.push(' *')
    lines.push(' * @example')
    lines.push(' * // Import everything for accounts')
    lines.push(" * import { AccountCreate, useAccounts, useCreateAccount } from './entities/accounts'")
    lines.push(' */')
    lines.push('')

    // Export shared types first
    lines.push("export * from './types'")
    lines.push('')

    // Export all entity modules
    for (const entityName of entityNames.sort()) {
      const fileName = this.toKebabCase(entityName)
      lines.push(`export * from './${fileName}'`)
    }

    if (entityNames.length === 0) {
      lines.push('// No entities with CRUD operations found in OpenAPI spec')
    }

    lines.push('')

    return lines.join('\n')
  }

  /**
   * Extract entity name from path
   */
  private extractEntityName(path: string): string | null {
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find(
      (seg) => !skipPrefixes.includes(seg.toLowerCase())
    )
    return resourceSegment || null
  }

  /**
   * Get sync mode from endpoint with backward compatibility
   */
  private getSyncMode(endpoint: ParsedEndpoint): SyncMode {
    // New format: explicit syncMode
    if (endpoint.syncMode === 'offline') return 'offline'
    if (endpoint.syncMode === 'realtime') return 'realtime'
    if (endpoint.syncMode === 'api') return 'api'

    // Legacy format: localFirst boolean
    // local_first: true → 'realtime' (backward compat)
    if (endpoint.localFirst === true) return 'realtime'

    return 'api'
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }

  private getArticle(word: string): string {
    const vowels = ['a', 'e', 'i', 'o', 'u']
    return vowels.includes(word[0]?.toLowerCase() || '') ? 'an' : 'a'
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toLowerCase())
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^./, (char) => char.toUpperCase())
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }

  private pluralize(str: string): string {
    if (str.endsWith('s') || str.endsWith('x') || str.endsWith('ch') || str.endsWith('sh')) {
      return str + 'es'
    }
    if (str.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].includes(str.slice(-2))) {
      return str.slice(0, -1) + 'ies'
    }
    return str + 's'
  }

  private singularize(str: string): string {
    if (str.endsWith('ies')) {
      return str.slice(0, -3) + 'y'
    }
    if (str.endsWith('ses') || str.endsWith('shes') || str.endsWith('ches') || str.endsWith('xes')) {
      return str.slice(0, -2)
    }
    if (str.endsWith('s') && !str.endsWith('ss')) {
      return str.slice(0, -1)
    }
    return str
  }
}

// Factory function for easy usage
export function generateEntityWrappers(
  parsedAPI: ParsedOpenAPI,
  options?: EntityGeneratorOptions
): GeneratedEntityWrappers {
  const generator = new EntityGenerator(options)
  return generator.generate(parsedAPI)
}
