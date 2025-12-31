/**
 * Entity Config Generator
 *
 * Generates derived semantic field mapping per entity.
 * Outputs EntityConfig with titleField, statusField, valueField, etc.
 * derived from column metadata importance and types.
 */

import type {
  EntityModel,
  EntityDefinition,
  EntityUIConfig,
} from '../core/entity-model.js'

export interface GeneratedEntityConfigs {
  /** Per-entity config files: Map<entityName, fileContent> */
  configs: Map<string, string>
  /** Shared types file content */
  types: string
  /** Barrel export file content */
  index: string
}

export interface EntityConfigGeneratorOptions {
  /** Include JSDoc comments (default: true) */
  includeJSDoc?: boolean
}

const DEFAULT_OPTIONS: Required<EntityConfigGeneratorOptions> = {
  includeJSDoc: true,
}

export class EntityConfigGenerator {
  private options: Required<EntityConfigGeneratorOptions>

  constructor(options: EntityConfigGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  generate(model: EntityModel): GeneratedEntityConfigs {
    const configs = new Map<string, string>()

    // Generate config file for each entity with UI config
    for (const [entityName, entity] of model.entities) {
      if (entity.uiConfig) {
        configs.set(entityName, this.generateEntityConfigFile(entity))
      }
    }

    return {
      configs,
      types: this.generateTypesFile(),
      index: this.generateIndexFile(model.entities),
    }
  }

  /**
   * Generate config file for a single entity
   */
  private generateEntityConfigFile(entity: EntityDefinition): string {
    const lines: string[] = []
    const config = entity.uiConfig!

    // File header
    lines.push(this.generateFileHeader(entity.pascalName))
    lines.push('')

    // Imports
    lines.push("import type { EntityConfig } from './types.js'")
    lines.push('')

    // Icon import (if we have one)
    if (config.icon) {
      lines.push(`// Icon can be imported from lucide-react:`)
      lines.push(`// import { ${config.icon} } from 'lucide-react'`)
      lines.push('')
    }

    // Export entity config
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * UI configuration for ${entity.pascalName} entity`)
      lines.push(' * Derived from column metadata at generation time.')
      lines.push(' */')
    }
    lines.push(`export const ${entity.singular}Config: EntityConfig = {`)
    lines.push(`  entityType: '${entity.singular}',`)
    lines.push('')

    // Field mapping
    lines.push('  // Semantic field mapping (derived from column importance + type)')
    if (config.titleField) {
      lines.push(`  titleField: '${config.titleField}',`)
    }
    if (config.subtitleField) {
      lines.push(`  subtitleField: '${config.subtitleField}',`)
    }
    if (config.valueField) {
      lines.push(`  valueField: '${config.valueField}',`)
    }
    if (config.statusField) {
      lines.push(`  statusField: '${config.statusField}',`)
    }
    if (config.metadataFields.length > 0) {
      lines.push(`  metadataFields: ${JSON.stringify(config.metadataFields)},`)
    } else {
      lines.push('  metadataFields: [],')
    }
    lines.push('')

    // Visual config
    lines.push('  // Visual configuration')
    if (config.icon) {
      lines.push(`  icon: '${config.icon}',`)
    }

    lines.push('}')
    lines.push('')

    // Helper functions for this entity
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(` * Get the display title for a ${entity.pascalName}`)
      lines.push(' */')
    }
    lines.push(`export function get${entity.pascalName}Title(data: Record<string, unknown>): string {`)
    if (config.titleField) {
      lines.push(`  return String(data['${config.titleField}'] ?? '')`)
    } else {
      lines.push(`  return String(data.id ?? data.name ?? '')`)
    }
    lines.push('}')
    lines.push('')

    if (config.statusField) {
      if (this.options.includeJSDoc) {
        lines.push('/**')
        lines.push(` * Get the status for a ${entity.pascalName}`)
        lines.push(' */')
      }
      lines.push(`export function get${entity.pascalName}Status(data: Record<string, unknown>): string | undefined {`)
      lines.push(`  const status = data['${config.statusField}']`)
      lines.push(`  return status != null ? String(status) : undefined`)
      lines.push('}')
      lines.push('')
    }

    if (config.valueField) {
      if (this.options.includeJSDoc) {
        lines.push('/**')
        lines.push(` * Get the primary value for a ${entity.pascalName}`)
        lines.push(' */')
      }
      lines.push(`export function get${entity.pascalName}Value(data: Record<string, unknown>): number | undefined {`)
      lines.push(`  const value = data['${config.valueField}']`)
      lines.push(`  if (value == null) return undefined`)
      lines.push(`  return typeof value === 'number' ? value : parseFloat(String(value))`)
      lines.push('}')
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Generate shared types file
   */
  private generateTypesFile(): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Entity Config Types'))
    lines.push('')

    // EntityConfig interface
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Semantic field mapping for entity display')
      lines.push(' * Used by EntityCard, EntityTable, EntityDetail components.')
      lines.push(' */')
    }
    lines.push('export interface EntityConfig {')
    lines.push('  /** Entity type identifier */')
    lines.push('  entityType: string')
    lines.push('')
    lines.push('  // Semantic field mapping')
    lines.push('')
    lines.push('  /** Primary text field (card titles, table primary column) */')
    lines.push('  titleField?: string')
    lines.push('  /** Secondary text field (subtitles) */')
    lines.push('  subtitleField?: string')
    lines.push('  /** Primary value field (for money/metrics display) */')
    lines.push('  valueField?: string')
    lines.push('  /** Status field (for status badges) */')
    lines.push('  statusField?: string')
    lines.push('  /** Additional fields for metadata display */')
    lines.push('  metadataFields: string[]')
    lines.push('')
    lines.push('  // Visual configuration')
    lines.push('')
    lines.push('  /** Icon identifier (lucide icon name) */')
    lines.push('  icon?: string')
    lines.push('}')
    lines.push('')

    // EntityConfigMap type
    if (this.options.includeJSDoc) {
      lines.push('/**')
      lines.push(' * Map of entity type to config')
      lines.push(' */')
    }
    lines.push('export type EntityConfigMap = Record<string, EntityConfig>')
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generate barrel export file with aggregated config map
   */
  private generateIndexFile(entities: Map<string, EntityDefinition>): string {
    const lines: string[] = []

    lines.push(this.generateFileHeader('Entity Config Exports'))
    lines.push('')

    // Export types
    lines.push("export * from './types.js'")
    lines.push('')

    // Get entities with UI config
    const configuredEntities = Array.from(entities.entries())
      .filter(([_, e]) => e.uiConfig)
      .sort((a, b) => a[0].localeCompare(b[0]))

    // Export each entity's config
    for (const [entityName, entity] of configuredEntities) {
      lines.push(`export * from './${entity.singular}.config.js'`)
    }
    lines.push('')

    // Import configs for aggregation
    lines.push('// Import all configs for aggregated map')
    for (const [entityName, entity] of configuredEntities) {
      lines.push(`import { ${entity.singular}Config } from './${entity.singular}.config.js'`)
    }
    lines.push('')

    // Aggregated config map
    if (configuredEntities.length > 0) {
      lines.push('/**')
      lines.push(' * All entity configs in a single map')
      lines.push(' * Useful for dynamic entity rendering.')
      lines.push(' */')
      lines.push('export const entityConfigs: Record<string, import("./types.js").EntityConfig> = {')
      for (const [entityName, entity] of configuredEntities) {
        lines.push(`  ${entity.singular}: ${entity.singular}Config,`)
      }
      lines.push('}')
      lines.push('')

      // Helper to get config by entity type
      lines.push('/**')
      lines.push(' * Get entity config by type')
      lines.push(' */')
      lines.push('export function getEntityConfig(entityType: string): import("./types.js").EntityConfig | undefined {')
      lines.push('  return entityConfigs[entityType]')
      lines.push('}')
      lines.push('')
    }

    return lines.join('\n')
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
 * Factory function for generating entity configs
 */
export function generateEntityConfigs(
  model: EntityModel,
  options?: EntityConfigGeneratorOptions
): GeneratedEntityConfigs {
  const generator = new EntityConfigGenerator(options)
  return generator.generate(model)
}
