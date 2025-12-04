/**
 * RxDB Schema Generator
 *
 * Generates RxDB JSON schemas from parsed OpenAPI specifications for offline mode.
 * Includes schema versioning support for migrations.
 *
 * NOTE: This generator is for entities with syncMode: 'offline' only.
 * ElectricSQL (realtime mode) remains unchanged.
 */

import type { ParsedOpenAPI, ParsedSchema, ParsedEndpoint } from './parser.js'
import { createHash } from 'crypto'

export interface GeneratedRxDBSchemas {
  /** Map of entity name to schema code */
  schemas: Map<string, string>
  /** Combined index file */
  index: string
  /** Schema hashes for drift detection */
  hashes: Map<string, string>
}

export interface RxDBSchemaGeneratorOptions {
  /** Include JSDoc comments */
  includeJSDoc?: boolean
  /** Database name for RxDB */
  databaseName?: string
}

const DEFAULT_OPTIONS: Required<RxDBSchemaGeneratorOptions> = {
  includeJSDoc: true,
  databaseName: 'app',
}

export class RxDBSchemaGenerator {
  private options: Required<RxDBSchemaGeneratorOptions>

  constructor(options: RxDBSchemaGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(parsedAPI: ParsedOpenAPI): GeneratedRxDBSchemas {
    const schemas = new Map<string, string>()
    const hashes = new Map<string, string>()

    // Find all entities with syncMode: 'offline'
    const offlineEntities = this.extractOfflineEntities(parsedAPI.endpoints, parsedAPI.schemas)

    for (const [entityName, entityInfo] of Object.entries(offlineEntities)) {
      const code = this.generateSchemaFile(entityName, entityInfo.schema, entityInfo.schemaVersion)
      schemas.set(entityName, code)

      // Calculate schema hash for drift detection
      const hash = this.calculateSchemaHash(entityInfo.schema)
      hashes.set(entityName, hash)
    }

    // Generate index file
    const index = this.generateIndexFile(Array.from(schemas.keys()))

    return { schemas, index, hashes }
  }

  /**
   * Extract entities that have syncMode: 'offline' from endpoints
   */
  private extractOfflineEntities(
    endpoints: ParsedEndpoint[],
    schemas: ParsedSchema[]
  ): Record<string, { schema: ParsedSchema; schemaVersion: number }> {
    const entities: Record<string, { schema: ParsedSchema; schemaVersion: number }> = {}

    for (const endpoint of endpoints) {
      // Check if endpoint has syncMode: 'offline'
      const syncMode = this.getSyncMode(endpoint)
      if (syncMode !== 'offline') continue

      // Extract entity name from path (e.g., /contacts -> contacts)
      const entityName = this.extractEntityName(endpoint.path)
      if (!entityName || entities[entityName]) continue

      // Find the corresponding schema
      const pascalName = this.toPascalCase(this.singularize(entityName))
      const matchingSchema = schemas.find(
        (s) =>
          s.name === pascalName ||
          s.name === `${pascalName}Owner` ||
          s.name === `${pascalName}Response`
      )

      if (matchingSchema) {
        // Get schema_version from x-sync extension, default to 0
        const schemaVersion = this.getSchemaVersion(endpoint)
        entities[entityName] = {
          schema: matchingSchema,
          schemaVersion,
        }
      }
    }

    return entities
  }

  /**
   * Get sync mode from endpoint, with backward compatibility
   */
  private getSyncMode(endpoint: ParsedEndpoint): 'api' | 'realtime' | 'offline' {
    // New format: x-sync.mode
    if (endpoint.syncMode === 'offline') return 'offline'
    if (endpoint.syncMode === 'realtime') return 'realtime'
    if (endpoint.syncMode === 'api') return 'api'

    // Legacy format: local_first maps to realtime (NOT offline)
    // This preserves backward compatibility
    if (endpoint.localFirst === true) return 'realtime'

    return 'api'
  }

  /**
   * Get schema version from x-sync extension
   */
  private getSchemaVersion(endpoint: ParsedEndpoint): number {
    // schema_version would be extracted by the updated parser
    return (endpoint as unknown as { schemaVersion?: number }).schemaVersion ?? 0
  }

  private generateSchemaFile(
    entityName: string,
    schema: ParsedSchema,
    schemaVersion: number
  ): string {
    const lines: string[] = []
    const pascalName = this.toPascalCase(this.singularize(entityName))
    const documentTypeName = `${pascalName}Document`

    // File header
    lines.push(this.generateFileHeader(pascalName))
    lines.push('')

    // Imports
    lines.push("import type { RxJsonSchema } from 'rxdb'")
    lines.push('')

    // Generate TypeScript interface for document
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * RxDB document type for ${pascalName}`)
      if (schema.description) {
        lines.push(` * ${schema.description}`)
      }
      lines.push(' */')
    }

    lines.push(`export interface ${documentTypeName} {`)
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const tsType = this.toTypeScriptType(propSchema)
        const isRequired = schema.required?.includes(propName)
        const optional = isRequired ? '' : '?'

        if (propSchema.description) {
          lines.push(`  /** ${propSchema.description} */`)
        }
        lines.push(`  ${propName}${optional}: ${tsType}`)
      }
    }
    // Add _deleted field for soft deletes
    lines.push('  _deleted?: boolean')
    lines.push('}')
    lines.push('')

    // Schema version constant
    lines.push(`export const ${entityName.toUpperCase()}_SCHEMA_VERSION = ${schemaVersion}`)
    lines.push('')

    // Generate RxDB JSON Schema
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * RxDB JSON Schema for ${entityName}`)
      lines.push(` * Version: ${schemaVersion}`)
      lines.push(' */')
    }

    const rxdbSchema = this.generateRxDBSchema(entityName, schema, schemaVersion)
    lines.push(
      `export const ${entityName}Schema: RxJsonSchema<${documentTypeName}> = ${JSON.stringify(rxdbSchema, null, 2)}`
    )
    lines.push('')

    // Generate migration strategies placeholder
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Migration strategies for schema version changes')
      lines.push(' * Add migration functions when incrementing schema version')
      lines.push(' *')
      lines.push(' * @example')
      lines.push(' * // Version 0 → 1: Added priority field')
      lines.push(' * 1: (oldDoc: any) => ({')
      lines.push(" *   ...oldDoc,")
      lines.push(" *   priority: 'normal', // default value")
      lines.push(' * }),')
      lines.push(' */')
    }
    lines.push(`export const ${entityName}Migrations: Record<number, (doc: any) => any> = {`)
    lines.push('  // Add migration functions here when schema version changes')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate RxDB JSON Schema object
   */
  private generateRxDBSchema(
    entityName: string,
    schema: ParsedSchema,
    schemaVersion: number
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    const indexes: string[] = []

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        properties[propName] = this.toRxDBProperty(propSchema)

        if (schema.required?.includes(propName)) {
          required.push(propName)
        }

        // Add common fields as indexes
        if (['state', 'updated_at', 'owner_user_id', 'status', 'type'].includes(propName)) {
          indexes.push(propName)
        }
      }
    }

    // Add _deleted field for soft deletes
    properties['_deleted'] = { type: 'boolean' }

    return {
      version: schemaVersion,
      primaryKey: 'id',
      type: 'object',
      properties,
      required,
      indexes,
    }
  }

  /**
   * Convert ParsedSchema to RxDB property definition
   */
  private toRxDBProperty(schema: ParsedSchema): Record<string, unknown> {
    const prop: Record<string, unknown> = {}

    switch (schema.type) {
      case 'string':
        if (schema.nullable) {
          prop.type = ['string', 'null']
        } else {
          prop.type = 'string'
        }
        // Add maxLength for primaryKey compatibility (RxDB requires it for primary keys)
        if (schema.format === 'uuid') {
          prop.maxLength = 36
        } else if (schema.format === 'email') {
          prop.maxLength = 255
          prop.format = 'email'
        } else if (schema.format === 'date-time') {
          prop.format = 'date-time'
        } else {
          // Default maxLength for strings
          prop.maxLength = 255
        }
        if (schema.enum) {
          prop.enum = schema.enum
        }
        break

      case 'number':
      case 'integer':
        if (schema.nullable) {
          prop.type = ['number', 'null']
        } else {
          prop.type = 'number'
        }
        break

      case 'boolean':
        prop.type = 'boolean'
        break

      case 'array':
        prop.type = 'array'
        if (schema.items) {
          prop.items = this.toRxDBProperty(schema.items)
        }
        break

      case 'object':
        prop.type = 'object'
        if (schema.properties) {
          const nestedProps: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(schema.properties)) {
            nestedProps[key] = this.toRxDBProperty(value)
          }
          prop.properties = nestedProps
        }
        break

      default:
        prop.type = 'string'
    }

    return prop
  }

  /**
   * Convert ParsedSchema to TypeScript type
   */
  private toTypeScriptType(schema: ParsedSchema): string {
    let baseType: string

    switch (schema.type) {
      case 'string':
        baseType = 'string'
        break
      case 'number':
      case 'integer':
        baseType = 'number'
        break
      case 'boolean':
        baseType = 'boolean'
        break
      case 'array':
        if (schema.items) {
          baseType = `${this.toTypeScriptType(schema.items)}[]`
        } else {
          baseType = 'unknown[]'
        }
        break
      case 'object':
        baseType = 'Record<string, unknown>'
        break
      default:
        baseType = 'unknown'
    }

    if (schema.nullable) {
      return `${baseType} | null`
    }
    return baseType
  }

  /**
   * Calculate hash of schema for drift detection
   */
  calculateSchemaHash(schema: ParsedSchema): string {
    const canonical = JSON.stringify(schema, Object.keys(schema).sort())
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
  }

  private generateIndexFile(entityNames: string[]): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('RxDB Schemas Index'))
    lines.push('')
    lines.push('/**')
    lines.push(' * RxDB JSON Schemas for offline mode entities')
    lines.push(' *')
    lines.push(' * These schemas define the structure for IndexedDB-backed collections')
    lines.push(' * that persist data for offline-first functionality.')
    lines.push(' */')
    lines.push('')

    // Export all schemas
    for (const entityName of entityNames.sort()) {
      const fileName = this.toKebabCase(entityName)
      lines.push(`export * from './${fileName}.schema'`)
    }

    if (entityNames.length === 0) {
      lines.push('// No offline mode entities found in OpenAPI spec')
    }

    lines.push('')

    return lines.join('\n')
  }

  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }

  /**
   * Extract entity name from path
   */
  private extractEntityName(path: string): string | null {
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const skipPrefixes = ['api', 'v1', 'v2', 'v3', 'v4']
    const resourceSegment = segments.find((seg) => !skipPrefixes.includes(seg.toLowerCase()))
    return resourceSegment || null
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
export function generateRxDBSchemas(
  parsedAPI: ParsedOpenAPI,
  options?: RxDBSchemaGeneratorOptions
): GeneratedRxDBSchemas {
  const generator = new RxDBSchemaGenerator(options)
  return generator.generate(parsedAPI)
}
