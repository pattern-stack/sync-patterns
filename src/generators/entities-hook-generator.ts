/**
 * Entities Hook Generator
 *
 * Generates `entities-hook.tsx` - a thin aggregator that imports from
 * per-entity files and provides unified `useEntities()` hook.
 *
 * The heavy lifting is done by entity-generator which creates:
 * - `./entities/types.ts` - UnifiedQueryResult, UnifiedMutationResult
 * - `./entities/{name}.ts` - Per-entity unified hooks
 *
 * This generator just wires them together with:
 * - Type-safe `useEntities()` hook
 * - Dynamic `get(entityName)` lookup
 * - Utility functions like `hasEntity()`, `getEntityNames()`
 */

import type { ParsedOpenAPI, ParsedEndpoint } from './parser.js'
import { cleanOperationId } from './naming.js'

export interface GeneratedEntitiesHook {
  /** The generated entities-hook.tsx content */
  code: string
}

export interface EntitiesHookGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<EntitiesHookGeneratorOptions> = {
  includeJSDoc: true,
}

/**
 * Entity info for the aggregator with type information
 */
interface EntityInfo {
  name: string           // singular: "account"
  namePlural: string     // plural: "accounts"
  pascalName: string     // "Account"
  pascalNamePlural: string // "Accounts"
  hasCreate: boolean
  hasUpdate: boolean
  hasDelete: boolean
  hasList: boolean
  hasGet: boolean
  // Type names for end-to-end type safety
  entityType: string     // e.g., "AccountOwner" or "Account"
  createType: string | null  // e.g., "AccountCreate" or null
  updateType: string | null  // e.g., "AccountUpdate" or null
}

export class EntitiesHookGenerator {
  private options: Required<EntitiesHookGeneratorOptions>

  constructor(options: EntitiesHookGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedEntitiesHook {
    const entities = this.getEntityInfo(parsedAPI.endpoints)

    // Filter to only entities with at least one operation
    const entitiesWithOps = entities.filter(
      (e) => e.hasList || e.hasGet || e.hasCreate || e.hasUpdate || e.hasDelete
    )

    const code = this.generateEntitiesHook(entitiesWithOps)

    return { code }
  }

  /**
   * Extract entity info from endpoints with type information
   */
  private getEntityInfo(endpoints: ParsedEndpoint[]): EntityInfo[] {
    const entityMap = new Map<string, EntityInfo>()

    for (const endpoint of endpoints) {
      const entityNamePlural = this.extractEntityName(endpoint.path)
      if (!entityNamePlural) continue

      let entity = entityMap.get(entityNamePlural)
      if (!entity) {
        const singular = this.singularize(entityNamePlural)
        const pascalName = this.toPascalCase(singular)
        entity = {
          name: singular,
          namePlural: entityNamePlural,
          pascalName,
          pascalNamePlural: this.toPascalCase(entityNamePlural),
          hasCreate: false,
          hasUpdate: false,
          hasDelete: false,
          hasList: false,
          hasGet: false,
          // Default type names (may be refined by response/request schemas)
          entityType: pascalName,
          createType: null,
          updateType: null,
        }
        entityMap.set(entityNamePlural, entity)
      }

      // Detect operation type
      const opType = this.detectOperationType(endpoint, entity.name)
      if (opType === 'list') entity.hasList = true
      if (opType === 'get') entity.hasGet = true
      if (opType === 'create') {
        entity.hasCreate = true
        entity.createType = `${entity.pascalName}Create`
      }
      if (opType === 'update') {
        entity.hasUpdate = true
        entity.updateType = `${entity.pascalName}Update`
      }
      if (opType === 'delete') entity.hasDelete = true

      // Try to extract actual type names from response schemas
      this.extractTypeFromEndpoint(endpoint, opType, entity)
    }

    return Array.from(entityMap.values())
  }

  /**
   * Extract type names from endpoint response/request schemas
   */
  private extractTypeFromEndpoint(
    endpoint: ParsedEndpoint,
    opType: string | null,
    entity: EntityInfo
  ): void {
    // Extract from response schemas (for list/get operations)
    if ((opType === 'list' || opType === 'get') && endpoint.responses) {
      for (const response of endpoint.responses) {
        if (response.statusCode?.startsWith('2') && response.content) {
          const jsonContent = response.content['application/json']
          if (jsonContent?.schema?.ref) {
            const typeName = this.extractTypeFromRef(jsonContent.schema.ref)
            if (typeName && !typeName.includes('List') && !typeName.includes('Response')) {
              entity.entityType = typeName
            }
          }
        }
      }
    }

    // Extract from request body (for create/update operations)
    if ((opType === 'create' || opType === 'update') && endpoint.requestBody?.content) {
      const jsonContent = endpoint.requestBody.content['application/json']
      if (jsonContent?.schema?.ref) {
        const typeName = this.extractTypeFromRef(jsonContent.schema.ref)
        if (typeName) {
          if (opType === 'create') entity.createType = typeName
          if (opType === 'update') entity.updateType = typeName
        }
      }
    }
  }

  /**
   * Extract type name from $ref string
   */
  private extractTypeFromRef(ref: string): string | null {
    const match = ref.match(/#\/components\/schemas\/(.+)/)
    return match?.[1] || null
  }

  /**
   * Detect operation type from endpoint
   */
  private detectOperationType(
    endpoint: ParsedEndpoint,
    entityName: string
  ): 'list' | 'get' | 'create' | 'update' | 'delete' | null {
    if (!endpoint.operationId) return null

    const cleanId = cleanOperationId(endpoint.operationId)
    const parts = cleanId.split('_')
    const action = parts[0]?.toLowerCase()

    // Normalize entity names (replace hyphens with underscores for matching)
    const normalize = (s: string) => s.toLowerCase().replace(/-/g, '_')

    // Check if this operation is for this entity
    const entityInOpId = parts.slice(1).join('_').toLowerCase()
    const normalizedEntity = normalize(entityName)
    const normalizedPlural = normalize(this.pluralize(entityName))

    const entityMatches =
      entityInOpId === normalizedEntity ||
      entityInOpId === normalizedPlural ||
      entityInOpId.startsWith(normalizedEntity + '_') ||
      entityInOpId.startsWith(normalizedPlural + '_')

    if (!entityMatches && action !== 'search') {
      if (!(action === 'search' && parts[1]?.toLowerCase() === normalizedPlural)) {
        return null
      }
    }

    const hasPathParam = endpoint.path.includes('{')

    switch (action) {
      case 'list':
      case 'search':
        return 'list'
      case 'get':
        return hasPathParam ? 'get' : null
      case 'create':
        return endpoint.method === 'post' ? 'create' : null
      case 'update':
        return (endpoint.method === 'put' || endpoint.method === 'patch') ? 'update' : null
      case 'delete':
      case 'archive':
      case 'remove':
        return endpoint.method === 'delete' ? 'delete' : null
      default:
        return null
    }
  }

  /**
   * Generate the entities-hook.tsx file
   */
  private generateEntitiesHook(entities: EntityInfo[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader())
    lines.push('')
    lines.push(this.generateImports(entities))
    lines.push('')
    lines.push(this.generateEntityApiType())
    lines.push('')
    lines.push(this.generateEntitiesInterface(entities))
    lines.push('')
    lines.push(this.generateUseEntitiesHook(entities))
    lines.push('')
    lines.push(this.generateUtilityFunctions(entities))

    return lines.join('\n')
  }

  private generateFileHeader(): string {
    return `/**
 * Entity API Hook
 *
 * Auto-generated from OpenAPI specification.
 * Do not edit manually - regenerate using sync-patterns CLI.
 *
 * Provides useEntities() for type-safe, entity-agnostic access to all entities.
 */`
  }

  private generateImports(entities: EntityInfo[]): string {
    const lines: string[] = []

    // Import from frontend-patterns for metadata
    lines.push("import type { ColumnMetadata } from '@pattern-stack/frontend-patterns'")
    lines.push("import { useEntityData } from '@pattern-stack/frontend-patterns'")
    lines.push('')

    // Import shared types
    lines.push("import type { UnifiedQueryResult, UnifiedMutationResult } from './entities/types'")
    lines.push('')

    // Import hooks from each entity (no type imports - use generic EntityApi)
    for (const entity of entities) {
      const { hooks } = this.getEntityImports(entity)

      if (hooks.length > 0) {
        lines.push(`import { ${hooks.join(', ')} } from './entities/${this.toKebabCase(entity.namePlural)}'`)
      }
    }

    return lines.join('\n')
  }

  private getEntityImports(entity: EntityInfo): { hooks: string[] } {
    const hooks: string[] = []

    // Hooks - entity-generator uses use${PascalName}s (just adds 's'), not proper pluralization
    if (entity.hasList) hooks.push(`use${entity.pascalName}s`)
    if (entity.hasGet) hooks.push(`use${entity.pascalName}`)
    if (entity.hasCreate) hooks.push(`useCreate${entity.pascalName}`)
    if (entity.hasUpdate) hooks.push(`useUpdate${entity.pascalName}`)
    if (entity.hasDelete) hooks.push(`useDelete${entity.pascalName}`)

    // Don't import types - the entity files handle their own type safety
    // The aggregator uses generic EntityApi to avoid type mismatches
    return { hooks }
  }

  private generateEntityApiType(): string {
    const lines: string[] = []

    // MetadataResult interface
    lines.push('export interface MetadataResult {')
    lines.push('  columns: ColumnMetadata[]')
    lines.push('  isLoading: boolean')
    lines.push('}')
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Generic entity API shape for entity-agnostic access.')
      lines.push(' *')
      lines.push(' * For full type safety, import hooks directly from entity modules:')
      lines.push(" * import { useAccounts, useCreateAccount } from './entities/accounts'")
      lines.push(' *')
      lines.push(' * Queries are hook references (consumer calls them).')
      lines.push(' * Mutations are results (already called inside useEntities).')
      lines.push(' */')
    }

    lines.push('// eslint-disable-next-line @typescript-eslint/no-explicit-any')
    lines.push('export interface EntityApi {')
    lines.push('  /** Fetch all entities - hook reference, consumer calls */')
    lines.push('  // eslint-disable-next-line @typescript-eslint/no-explicit-any')
    lines.push('  useList: () => UnifiedQueryResult<any[]>')
    lines.push('  /** Fetch single entity by ID - hook reference, consumer calls */')
    lines.push('  // eslint-disable-next-line @typescript-eslint/no-explicit-any')
    lines.push('  useOne: (id: string) => UnifiedQueryResult<any>')
    lines.push('  /** Fetch column metadata - hook reference, consumer calls */')
    lines.push("  useMetadata: (view?: 'list' | 'detail' | 'form') => MetadataResult")
    lines.push('  /** Create mutation - result, already initialized */')
    lines.push('  // eslint-disable-next-line @typescript-eslint/no-explicit-any')
    lines.push('  create?: UnifiedMutationResult<any, any>')
    lines.push('  /** Update mutation - result, already initialized */')
    lines.push('  // eslint-disable-next-line @typescript-eslint/no-explicit-any')
    lines.push('  update?: UnifiedMutationResult<any, any>')
    lines.push('  /** Delete mutation - result, already initialized */')
    lines.push('  delete?: UnifiedMutationResult<void, string>')
    lines.push('}')

    return lines.join('\n')
  }

  private generateEntitiesInterface(entities: EntityInfo[]): string {
    const lines: string[] = []

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Complete entities interface with typed access and dynamic lookup.')
      lines.push(' * For full type safety, import hooks directly from entity modules.')
      lines.push(' */')
    }

    lines.push('export interface Entities {')
    for (const entity of entities) {
      lines.push(`  ${entity.namePlural}: EntityApi`)
    }
    lines.push('  /** Dynamic entity lookup by name */')
    lines.push('  get: (name: string) => EntityApi | undefined')
    lines.push('}')

    return lines.join('\n')
  }

  private generateUseEntitiesHook(entities: EntityInfo[]): string {
    const lines: string[] = []

    // createMetadataHook factory
    lines.push('function createMetadataHook(entityName: string) {')
    lines.push("  return function useMetadata(view: 'list' | 'detail' | 'form' = 'list'): MetadataResult {")
    lines.push('    const { columns, isLoadingMetadata } = useEntityData(entityName, { view })')
    lines.push('    return {')
    lines.push('      columns,')
    lines.push('      isLoading: isLoadingMetadata,')
    lines.push('    }')
    lines.push('  }')
    lines.push('}')
    lines.push('')

    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Access all entity APIs with full TypeScript support.')
      lines.push(' *')
      lines.push(' * Mutations are called INSIDE this hook and returned as results.')
      lines.push(' * Queries stay as hook references - consumer must call them.')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(' * const { accounts } = useEntities()')
      lines.push(' * const { data } = accounts.useList()        // Query - call it')
      lines.push(' * const { columns } = accounts.useMetadata() // Metadata - call it')
      lines.push(' * await accounts.create?.mutateAsync(data)   // Mutation - use directly')
      lines.push(' */')
    }

    lines.push('export function useEntities(): Entities {')
    lines.push('  // Call ALL mutation hooks unconditionally (React rules of hooks)')

    // Initialize mutations
    for (const entity of entities) {
      if (entity.hasCreate) {
        lines.push(`  const ${entity.namePlural}Create = useCreate${entity.pascalName}()`)
      }
      if (entity.hasUpdate) {
        lines.push(`  const ${entity.namePlural}Update = useUpdate${entity.pascalName}()`)
      }
      if (entity.hasDelete) {
        lines.push(`  const ${entity.namePlural}Delete = useDelete${entity.pascalName}()`)
      }
    }

    lines.push('')
    lines.push('  // Build entity APIs with full type safety')

    // Build each entity API - use pascalName + 's' for list hook (matches entity-generator)
    for (const entity of entities) {
      lines.push(`  const ${entity.namePlural}Api: EntityApi = {`)
      lines.push(`    useList: use${entity.pascalName}s,`)
      lines.push(`    useOne: use${entity.pascalName},`)
      lines.push(`    useMetadata: createMetadataHook('${entity.namePlural}'),`)
      if (entity.hasCreate) lines.push(`    create: ${entity.namePlural}Create,`)
      if (entity.hasUpdate) lines.push(`    update: ${entity.namePlural}Update,`)
      if (entity.hasDelete) lines.push(`    delete: ${entity.namePlural}Delete,`)
      lines.push('  }')
      lines.push('')
    }

    // Registry
    lines.push('  const registry: Record<string, EntityApi> = {')
    for (const entity of entities) {
      lines.push(`    ${entity.namePlural}: ${entity.namePlural}Api,`)
    }
    lines.push('  }')
    lines.push('')

    // Return
    lines.push('  return {')
    for (const entity of entities) {
      lines.push(`    ${entity.namePlural}: ${entity.namePlural}Api,`)
    }
    lines.push('    get: (name: string) => registry[name],')
    lines.push('  }')
    lines.push('}')

    return lines.join('\n')
  }

  private generateUtilityFunctions(entities: EntityInfo[]): string {
    const lines: string[] = []

    const names = entities.map((e) => `'${e.namePlural}'`).join(', ')
    lines.push(`const ENTITY_NAMES = [${names}] as const`)
    lines.push('')
    lines.push('export function hasEntity(name: string): boolean {')
    lines.push('  return ENTITY_NAMES.includes(name as typeof ENTITY_NAMES[number])')
    lines.push('}')
    lines.push('')
    lines.push('export function getEntityNames(): readonly string[] {')
    lines.push('  return ENTITY_NAMES')
    lines.push('}')

    return lines.join('\n')
  }

  // --- Utility methods ---

  private extractEntityName(path: string): string | null {
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    return segments.find((seg) => !skipPrefixes.includes(seg.toLowerCase())) || null
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
    if (str.endsWith('ies')) return str.slice(0, -3) + 'y'
    if (str.endsWith('ses') || str.endsWith('shes') || str.endsWith('ches') || str.endsWith('xes')) {
      return str.slice(0, -2)
    }
    if (str.endsWith('s') && !str.endsWith('ss')) return str.slice(0, -1)
    return str
  }
}

// Factory function
export function generateEntitiesHook(
  parsedAPI: ParsedOpenAPI,
  options?: EntitiesHookGeneratorOptions
): GeneratedEntitiesHook {
  const generator = new EntitiesHookGenerator(options)
  return generator.generate(parsedAPI)
}
