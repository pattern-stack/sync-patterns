/**
 * Column Metadata Generator
 *
 * Generates static column metadata files per entity from OpenAPI schemas.
 * Outputs TypeScript constants with ColumnMetadata[] for each entity,
 * enabling type-safe field rendering without runtime API calls.
 */

import type {
  EntityModel,
  EntityDefinition,
} from '../core/entity-model.js'

export interface GeneratedColumnMetadata {
  /** Per-entity column files: Map<entityName, fileContent> */
  columns: Map<string, string>
  /** Shared types file content */
  types: string
  /** Barrel export file content */
  index: string
}

export interface ColumnMetadataGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<ColumnMetadataGeneratorOptions> = {
  includeJSDoc: true,
}

export class ColumnMetadataGenerator {
  private options: Required<ColumnMetadataGeneratorOptions>

  constructor(options: ColumnMetadataGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(model: EntityModel): GeneratedColumnMetadata {
    const columns = new Map<string, string>()

    // Generate column metadata file for each entity with columns
    for (const [entityName, entity] of model.entities) {
      if (entity.columnMetadata && entity.columnMetadata.length > 0) {
        columns.set(entityName, this.generateEntityColumnsFile(entity))
      }
    }

    return {
      columns,
      types: this.generateTypesFile(),
      index: this.generateIndexFile(model.entities),
    }
  }

  /**
   * Generate column metadata file for a single entity
   */
  private generateEntityColumnsFile(entity: EntityDefinition): string {
    const lines: string[] = []

    // File header
    lines.push(this.generateFileHeader(entity.pascalName))
    lines.push('')

    // Import types
    lines.push("import type { ColumnMetadata } from './types.js'")
    lines.push('')

    // Export column metadata constant
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Static column metadata for ${entity.pascalName} entity`)
      lines.push(' * Generated from OpenAPI schema - use as placeholder until dynamic fetch completes')
      lines.push(' */')
    }
    lines.push(`export const ${entity.singular}BaseColumns: ColumnMetadata[] = [`)

    for (const col of entity.columnMetadata!) {
      lines.push('  {')
      lines.push(`    field: '${col.field}',`)
      lines.push(`    label: '${this.escapeString(col.label)}',`)
      lines.push(`    type: '${col.type}',`)
      lines.push(`    importance: '${col.importance}',`)

      // Optional fields
      if (col.group) {
        lines.push(`    group: '${this.escapeString(col.group)}',`)
      }
      lines.push(`    sortable: ${col.sortable},`)
      lines.push(`    filterable: ${col.filterable},`)
      if (col.format) {
        lines.push(`    format: ${JSON.stringify(col.format)},`)
      }
      if (col.description) {
        lines.push(`    description: '${this.escapeString(col.description)}',`)
      }
      if (col.placeholder) {
        lines.push(`    placeholder: '${this.escapeString(col.placeholder)}',`)
      }
      lines.push(`    visible: ${col.visible},`)
      lines.push(`    required: ${col.required},`)
      lines.push(`    computed: ${col.computed},`)
      lines.push(`    source: '${col.source}',`)
      if (col.options && col.options.length > 0) {
        lines.push(`    options: ${JSON.stringify(col.options)},`)
      }
      if (col.reference) {
        lines.push(`    reference: {`)
        lines.push(`      entity: '${this.escapeString(col.reference.entity)}',`)
        lines.push(`      displayField: '${this.escapeString(col.reference.displayField)}',`)
        if (col.reference.endpoint) {
          lines.push(`      endpoint: '${this.escapeString(col.reference.endpoint)}',`)
        }
        lines.push(`    },`)
      }

      lines.push('  },')
    }

    lines.push(']')
    lines.push('')

    // Export type-safe field union
    const fieldNames = entity.columnMetadata!.map((c) => `'${c.field}'`).join(' | ')
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Type-safe field names for ${entity.pascalName}`)
      lines.push(' */')
    }
    lines.push(`export type ${entity.pascalName}Field = ${fieldNames}`)
    lines.push('')

    // Export helper to get column by field name
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Get column metadata by field name`)
      lines.push(' */')
    }
    lines.push(
      `export function get${entity.pascalName}Column(field: ${entity.pascalName}Field): ColumnMetadata | undefined {`
    )
    lines.push(`  return ${entity.singular}BaseColumns.find((c) => c.field === field)`)
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate shared types file
   */
  private generateTypesFile(): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Column Metadata Types'))
    lines.push('')

    // UIType
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Semantic display types (19 types)')
      lines.push(' * Specifies HOW to display data, not storage or input methods.')
      lines.push(' */')
    }
    lines.push('export type UIType =')
    lines.push("  // Text")
    lines.push("  | 'text'")
    lines.push("  | 'password'")
    lines.push("  // Numbers")
    lines.push("  | 'number'")
    lines.push("  | 'money'")
    lines.push("  | 'percent'")
    lines.push("  // Dates")
    lines.push("  | 'date'")
    lines.push("  | 'datetime'")
    lines.push("  // Links")
    lines.push("  | 'email'")
    lines.push("  | 'url'")
    lines.push("  | 'phone'")
    lines.push("  // Boolean")
    lines.push("  | 'boolean'")
    lines.push("  // Visual Chips")
    lines.push("  | 'badge'")
    lines.push("  | 'status'")
    lines.push("  // Entity References")
    lines.push("  | 'entity'")
    lines.push("  | 'user'")
    lines.push("  // Special")
    lines.push("  | 'json'")
    lines.push("  | 'image'")
    lines.push("  | 'rating'")
    lines.push("  | 'color'")
    lines.push("  | 'file'")
    lines.push('')

    // UIImportance
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Business priority levels')
      lines.push(' * Controls visibility and prominence in different view contexts.')
      lines.push(' */')
    }
    lines.push("export type UIImportance = 'critical' | 'high' | 'medium' | 'low' | 'minimal'")
    lines.push('')

    // EntityReference
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Resolution info for FK references')
      lines.push(' * Used when type === "entity" to enable automatic foreign key resolution.')
      lines.push(' */')
    }
    lines.push('export interface EntityReference {')
    lines.push('  /** Target entity name (plural): "categories", "accounts" */')
    lines.push('  entity: string')
    lines.push('  /** Field to display from resolved entity: "name", "title" */')
    lines.push('  displayField: string')
    lines.push('  /** Optional: endpoint to fetch single entity. Default: /{entity}/{id} */')
    lines.push('  endpoint?: string')
    lines.push('}')
    lines.push('')

    // ColumnMetadata
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Complete field metadata for UI rendering')
      lines.push(' * Mirrors backend ColumnMetadata Pydantic model.')
      lines.push(' */')
    }
    lines.push('export interface ColumnMetadata {')
    lines.push('  /** Model field name */')
    lines.push('  field: string')
    lines.push('  /** Human-readable label */')
    lines.push('  label: string')
    lines.push('  /** Semantic UI type */')
    lines.push('  type: UIType')
    lines.push('  /** Business priority */')
    lines.push('  importance: UIImportance')
    lines.push('  /** Logical grouping (e.g., "Financial") */')
    lines.push('  group?: string')
    lines.push('  /** Whether field can be sorted */')
    lines.push('  sortable: boolean')
    lines.push('  /** Whether field can be filtered */')
    lines.push('  filterable: boolean')
    lines.push('  /** Format hints: {"currency": "USD", "decimals": 2} */')
    lines.push('  format?: Record<string, unknown>')
    lines.push('  /** Help text for forms/tooltips */')
    lines.push('  description?: string')
    lines.push('  /** Placeholder text for inputs */')
    lines.push('  placeholder?: string')
    lines.push('  /** Whether visible by default */')
    lines.push('  visible: boolean')
    lines.push('  /** Whether field is required */')
    lines.push('  required: boolean')
    lines.push('  /** Whether computed/derived (read-only) */')
    lines.push('  computed: boolean')
    lines.push('  /** Field source: "system", "org", "user", "external:{type}" */')
    lines.push("  source: 'system' | 'org' | 'user' | string")
    lines.push('  /** Available choices (for BADGE/STATUS types) */')
    lines.push('  options?: string[]')
    lines.push('  /** Present when type === "entity". Contains resolution info for FK references. */')
    lines.push('  reference?: EntityReference')
    lines.push('}')
    lines.push('')

    // ColumnMetadataResponse (for API responses)
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * API response wrapper for column metadata')
      lines.push(' */')
    }
    lines.push('export interface ColumnMetadataResponse {')
    lines.push('  /** List of column metadata objects */')
    lines.push('  columns: ColumnMetadata[]')
    lines.push('  /** Entity name (e.g., "account") */')
    lines.push('  entity: string')
    lines.push('  /** View context ("list", "detail", "form") */')
    lines.push('  view: string')
    lines.push('  /** Metadata schema version */')
    lines.push('  version: string')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate barrel export file
   */
  private generateIndexFile(entities: Map<string, EntityDefinition>): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Column Metadata Exports'))
    lines.push('')

    // Export types
    lines.push("export * from './types.js'")
    lines.push('')

    // Export each entity's columns
    const sortedEntities = Array.from(entities.entries())
      .filter(([_, e]) => e.columnMetadata && e.columnMetadata.length > 0)
      .sort((a, b) => a[0].localeCompare(b[0]))

    for (const [entityName, entity] of sortedEntities) {
      lines.push(`export * from './${entity.singular}.columns.js'`)
    }
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Escape string for use in TypeScript string literal
   */
  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
  }

  /**
   * Generate file header comment
   */
  private generateFileHeader(title: string): string {
    return `/**
 * ${title}
 *
 * Auto-generated from OpenAPI specification
 * Do not edit manually - regenerate using sync-patterns CLI
 */`
  }
}

/**
 * Factory function for generating column metadata
 */
export function generateColumnMetadata(
  model: EntityModel,
  options?: ColumnMetadataGeneratorOptions
): GeneratedColumnMetadata {
  const generator = new ColumnMetadataGenerator(options)
  return generator.generate(model)
}
